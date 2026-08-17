# 会议室功能执行修改方案（P0 施工详案 + P1/P2 排期）

| | |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-08-05 |
| 对应企划 | [meeting-room.md](meeting-room.md) v1.2（已决议） |
| 评审结论 | 可开工，含 5 处回填修订（WS0） |

---

## 0. 总体技术决策

**会议引擎落在 Python 后端（`agent/meeting/` 新包），桌面端只做 UI 投影与 RPC。** 三条理由：

1. **会议生命周期 = 程序生命周期**（决议 2026-08-07）：程序存续则会议存续，程序退出即会议收尾落库（与单对话同构——引擎持会话状态机，桌面仅投影）。不设"桌面关闭后无人值守继续运行"，程序退出即终止是设计内行为；
2. 调度器要直接驱动 agent loop、abort 流式请求、扣减预算——这些都是后端原语；
3. sqlite 状态库、账本先例（`gateway/delivery_ledger.py`）、辅助模型客户端（`agent/auxiliary_client.py`）全在后端。

桌面端经 `JsonRpcGatewayClient` 收发：`meeting.*` 事件下行（参照 `subagent.*` 的 scoped 路由先例，`apps/desktop/src/lib/gateway-events.ts:55`），RPC 上行（创建/暂停/插嘴/否决/接管/终止）。

---

## 1. WS0：企划书回填修订（0.5 人日，纯文档，阻塞后续施工）

| # | 位置 | 修订 |
|---|---|---|
| 1 | §4.3 | **Tier1 分歧占位符规则**：关键帧按 clearance 过滤后各参会者事实基础不一致，低权限方无法质证其看不到的"事实"。被过滤帧以 `[已脱敏条目 #N，由主持人掌握]` 占位注入，保证议事一致性；主持人（最高 clearance）持全量。 |
| 2 | §4.5 | 轻量会诊最低产物明确为：决策纪要或实施契约至少其一（否则"禁止纯讨论"在最低档落空）。 |
| 3 | §11.1(5) | 决策门补一项：**补抽新增率**（事件驱动抽取发现的、发言人未声明的断言占比）——发言人自报 claims 存在漏报偏差，代码核验层验不了"漏抽"，补抽新增率是比 recall 更直接的漏报信号。 |
| 4 | §11.1(3) | 金丝雀埋雷集加维护机制：季度轮换 + 扩样，防红队模型版本更新后"记住"题目。 |
| 5 | §11.1(4) | 行动日志字段（`intent` / `pre_state_ref`）P2 才启用，但 P0 建 `meeting_events` 表时**预留列**，避免 P2 做 sqlite 迁移。 |

---

## 2. 数据模型（sqlite 新表）

跟随现有 state DB 的 WAL 与 schema 迁移惯例（参照 `tests/test_zeroed_state_db.py`、`tests/test_sqlite_wal_reset_gate.py` 揭示的机制）。**写路径复用现有 state DB 连接管理，不新开连接**（仓库有 sqlite 锁/泄漏病史：`sqlite_leak_fix.png`、`tests/test_sqlite_lock_safe_inspection.py`）。

```sql
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  origin_ref TEXT,              -- 发起处：thread:xxx / kanban:card:yyy / subagent:zzz
  topic TEXT NOT NULL,
  mode TEXT NOT NULL,           -- light(1v1) | full
  status TEXT NOT NULL,         -- created|running|converging|suspended|closed|aborted|interrupted
                                -- aborted=程序退出主动收尾；interrupted=重启自检发现 running 无活引擎（可恢复）
  budget_rounds INTEGER, budget_seconds INTEGER, budget_tokens INTEGER,
  spent_rounds INTEGER DEFAULT 0, spent_tokens INTEGER DEFAULT 0,
  delegation_profile_id TEXT,   -- P2 启用，P0 可空预留
  project_id TEXT,              -- 项目级账本 P2 启用，P0 可空预留
  worktree_path TEXT,           -- P2 启用
  created_at REAL, closed_at REAL
);

CREATE TABLE meeting_events (     -- Tier 0：append-only，永不删除
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  seq INTEGER NOT NULL,          -- 单调序号，回放依赖
  kind TEXT NOT NULL,            -- turn|claim|keyframe|ledger|fuse|veto|budget|clearance_audit|...
  actor TEXT,                    -- agent 席位 / user / system
  payload_json TEXT,
  intent TEXT,                   -- WS0-5 预留：行动日志 intent
  pre_state_ref TEXT,            -- WS0-5 预留：git SHA / 文件 hash
  created_at REAL,
  UNIQUE(meeting_id, seq)
);

CREATE TABLE meeting_keyframes (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL,
  source_msg_id TEXT NOT NULL,   -- 回指 meeting_events
  text TEXT NOT NULL,            -- 逐字
  clearance TEXT NOT NULL,       -- endpoint 信任分级枚举
  source TEXT NOT NULL,          -- user|recorder|agent|rule
  status TEXT NOT NULL           -- candidate|pinned|rejected
);

CREATE TABLE meeting_ledger (    -- 版本化，只追加不改写
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- decision|number|date|promise|exception|todo
  value_json TEXT NOT NULL,
  supersedes_id TEXT,            -- 修订链
  source_msg_id TEXT NOT NULL,
  status TEXT NOT NULL,          -- proposed|pending|decided|vetoed
  signed_by TEXT,                -- user 或（P2 白名单内）moderator
  created_at REAL
);

CREATE TABLE meeting_claims (
  id TEXT PRIMARY KEY, msg_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  class TEXT NOT NULL,           -- fact|inference|opinion
  citation TEXT,
  verify_status TEXT,            -- ok|unresolved|invalid_citation|value_mismatch
  declared_by TEXT NOT NULL      -- speaker（声明）| extractor（补抽）→ 算补抽新增率
);
```

---

## 3. P0 工作流（按依赖排序）

### WS1 存储层（Python）
建表 + 迁移注册 + 读写 DAO。**验收**：迁移测试绿（仿 `test_zeroed_state_db.py`）；并发写不死锁（仿 `test_sqlite_lock_safe_inspection.py`）。

### WS2 调度引擎（`agent/meeting/` 新包：`engine.py` / `scheduler.py`）
- 会议状态机 + FloorToken + P0–P4 优先级事件队列；
- 封闭动作集解析：主持人输出 structured output 校验，非法或 10s 超时 → 兜底调度器（被@者 > 被追问者 > 领域相关度 > 举手先后）；
- @环检测（单议题同 pair 互@计数 >2 → 转争议点）、三级熔断、三重预算扣减与强制收敛；
- 轻量会诊档：调度退化为纯规则轮流，熔断全量保留；
- **P0 中断接线**（已核验存在，无缺口）：后端 turn-cancel 已闭环——desktop RPC `session.interrupt`（`tui_gateway/methods_session.py`）→ `request_hard_interrupt`（`agent/interrupt_compat.py`）→ `AIAgent.interrupt(hard_cancel=True)`（run_agent.py:3020，真实 abort 流式请求）。调度引擎直接驱动 agent 回合中止，无需新建 API；"desktop 仅见 OAuth cancel"为误述（实为 pet.cancel，与本功能无关）。
- 复用：`tools/budget_config.py`（工具结果持久化字符预算，非 token 扣减；token 预算扣减走 `agent/aux_accounting.py` / `agent/account_usage.py` / `agent/credits_tracker.py`）。
- **liveness probe**：T 秒无 dequeue ∧ token 无 owner ∧ budget 不递减 → 判死锁。

**验收（红线）**：三个故障注入场景全部自动收敛——①互@死循环、②主持人持续超时/非法输出、③预算耗尽；死锁判定 0 次。

### WS3 发言人协议 + 记录员管线（`agent/meeting/recorder.py`）
- 发言人 structured output 扩展 `claims[]`（断言 + `fact|inference|opinion` + citation）；
- 核验层（纯代码，零 token，每轮同步）：citation 可解析性（文件存在/行号有效/SHA 可定位）+ 引用片段含断言数值 → 四分类写 `meeting_claims.verify_status`；
- 事件驱动补抽：议题关闭 / 决策事件 / 每 K 回合触发，挂 P4 队列，走 `agent/auxiliary_client.py` 用最便宜已配置模型，结果标 `declared_by=extractor`；
- 正则关键帧候选（数字/金额/"以 X 为准"）→ `meeting_keyframes(status=candidate)`。

**验收**：记录员 token/发言人 token ≤ 0.3；抽样 assertion recall ≥ 80%；补抽新增率有报表（WS0-3）。

### WS4 记忆装配 + clearance 闸门（`agent/meeting/memory.py` / `clearance.py`）
- 参会 Agent 每轮上下文装配 = 初始目标 + Tier1 关键帧（clearance 过滤 + **占位符**，WS0-1）+ 账本当前值 + 滚动摘要 + 最近 N 轮原文；钩子挂在现有压缩链路同级（`trajectory_compressor.py` / desktop `store/compaction.ts` 对应的后端装配点）；
- `clearance.py`：providers 配置扩展 `clearance` 字段（endpoint 信任分级）+ 项目级敏感路径/模式策略文件 + **独立过滤 pipeline 阶段** + 审计写 `meeting_events(kind=clearance_audit)`。

**验收（红线）**：敏感帧不进入低 clearance 参会者上下文；占位符存在；审计留痕可查。

### WS5 产物层（`agent/meeting/products.py`）
闭幕产物门：实施契约（目标/约束/验收标准/测试要求/禁止事项/溯源引用）或账本级纪要至少其一，否则拒绝闭幕并记异常会议；契约中定量断言必须 `verify_status=ok`。

### WS6 回流包（后端 + 桌面）
- 后端：闭幕发 `meeting.conclusion` 事件（`origin_ref` + MeetingReturnPacket：decisions 逐字段 + contract 摘要 + open_items 计数 + stats）；`origin_ref=thread:*` 时写入 SessionMessage，`display_kind='meeting_conclusion'`（`types/hermes.ts:546` 为开放联合，无需改 core type）；会议期间原对话新消息以 P4 背景更新正向推入会议；
- **生命周期收尾**（决议 2026-08-07，与单对话同构）：程序退出 → 会议以 `aborted` 终态落库，未决签章事项转"待回放"；重启后检测到 `running` 但无活引擎 → 标记 `interrupted` 可恢复。收尾逻辑放引擎 `shutdown()` 钩子 + 启动自检；
- 桌面：`gateway-events.ts` 增加 `meeting.*` scoped 路由（仿 `subagent.*`）；`lib/chat-messages.ts` 渲染回流富卡片（仿 `async_delegation_complete` 现有渲染路径）；decisions 逐字注入 ≤1500 token，溢出策略：最近 > 高风险 > 其余计数化。

**验收**：会议结论在发起对话中以卡片出现，点击可展开溯源；kanban / 编排器 origin 适配留 P1。

### WS7 桌面会议 UI（列表式，P0 不做圆桌动画）
- `src/store/meeting.ts`（nanostores，仿 `store/subagents.ts` 模式：进度/流式/成本字段直接对齐 `SubagentProgress`）；
- `src/app/meeting/`：发言流（**虚拟化**，工程红线）+ 议题块（进行中/已搁置/已决策）+ 排队面板（位次 + 原因）+ 席位条 + 预算表（三顶余量）；
- 控制条五按钮（暂停/接管/否决/一言堂/终止）→ RPC 上行，全部 P0 级；
- 长按发言 → 标记关键（写 `meeting_keyframes(source=user)`）。

### WS8 评测 L0 + 验收测试
- citation 四分类分布报表（机械、零 token）——企划 §11.1(7) L0 层；
- WS2 故障注入三场景 + WS4 闸门测试 + WS3 决策门报表，全部纳入 CI。

---

## 4. P1 / P2 序列（依赖驱动）

| 期 | 内容 | 依赖 |
|---|---|---|
| P1 | 焦点栏四 tab / 排队池完善 / 圆桌布局（2–4 人档）；kanban"转入会诊"（`estimateTask` 扩可逆性/分歧度维度，`api.ts:227`）；AI 申请召集（用户确认制弹窗）；主持日志 UI；防漂移对账；金丝雀评测 harness + 埋雷集资产；待回答面板复用 `tools/clarify_tool.py` 通道 | WS1–WS8 全部 |
| P2 | Delegation Profile（白/灰/黑名单，黑名单不可配置删除）；行动日志启用（`intent`/`pre_state_ref` 列点亮，前置状态参考 `tools/checkpoint_manager.py`）；worktree-per-meeting；回溯否决 + saga 补偿（工具注册表 `reversibility` 标注，建在 `tools/` 工具层）；项目级账本（`project_id` 列点亮）；复盘会 | P1 + 指标门禁（完成率 ≥80%、否决率 ≤10%） |

工具 `reversibility` 元数据属 P2，但 **P0 施工时在工具定义处预留字段位**（空默认 = 未知 = 按不可反问询），避免二次遍历全部工具。

---

## 5. 已核验复用锚点表

| 需求 | 现有资产 | 位置 |
|---|---|---|
| 挂起→完成→结果回归 | async delegation | `tools/async_delegation.py` + `apps/desktop/src/store/background-delegation.ts` |
| 系统消息富卡片 | `display_kind` 开放联合 | `apps/desktop/src/types/hermes.ts:546`、`src/lib/chat-messages.ts` |
| 事件 scoped 路由先例 | `subagent.*` | `apps/desktop/src/lib/gateway-events.ts:55` |
| token 预算（LLM spend） | aux 记账 | `agent/aux_accounting.py`、`agent/account_usage.py`（`tools/budget_config.py` 是工具结果持久化字符预算，勿误引） |
| Agent→用户提问通道 | clarify（P2 待回答面板） | `tools/clarify_tool.py`、`tools/clarify_gateway.py` |
| 审批流 | approval | `tools/approval.py` |
| 辅助模型调用 | auxiliary client（补抽/打分） | `agent/auxiliary_client.py`、`agent/aux_accounting.py` |
| 任务复杂度打分 | kanban estimate | `apps/desktop/src/plugins/kanban/api.ts:227-230` |
| 账本先例 | delivery/lifecycle ledger | `gateway/delivery_ledger.py`、`gateway/lifecycle_ledger.py` |
| 前置状态/检查点 | checkpoint manager | `tools/checkpoint_manager.py` |
| 上下文压缩挂点 | trajectory compressor | `trajectory_compressor.py` + `apps/desktop/src/store/compaction.ts` |
| 成本追踪字段 | SubagentProgress | `apps/desktop/src/store/subagents.ts` |
| 离场保活（防系统休眠） | keep-awake + powerSaveBlocker | `apps/desktop/src/store/keep-awake.ts`、`apps/desktop/electron/power-save.ts` |
| 回合中止链路（已闭环） | session.interrupt → request_hard_interrupt → AIAgent.interrupt | `tui_gateway/methods_session.py:2750`、`agent/interrupt_compat.py:9`、`run_agent.py:3020` |
| sqlite 迁移/锁惯例 | state DB 测试群 | `tests/test_zeroed_state_db.py`、`test_sqlite_lock_safe_inspection.py` 等 |

---

## 6. 施工风险注意

1. **引擎归属**：调度状态严禁放桌面 store——引擎是后端会话状态机（与单对话同构）。红线是收尾路径：程序退出必须统一落终态（`aborted`），不留悬空 running。
2. **sqlite 写放大**：每回合多表写入，必须复用现有 state DB 连接管理与 WAL 惯例，有锁/泄漏病史在前。
3. **发言流渲染**：会议回合复用现有 `message.*` 流式事件管线，不另起渲染通道；`meeting.*` 只携带调度/账本/预算元数据。
4. **turn-cancel 已核验**：WS2 复用 `session.interrupt` → `AIAgent.interrupt(hard_cancel=True)` 即可，无需补建（见 §3 WS2）。
5. **占位符一致性**（WS0-1）：clearance 过滤与质证完整性的矛盾靠占位符规则解，测试必须覆盖"低 clearance 参会者对脱敏条目的回应不翻车"。

---

## 7. P0 验收红线（对应企划 §8）

| 红线 | 判定 |
|---|---|
| 死锁 0 次 | liveness probe + 三故障注入场景全部自动收敛 |
| 断言分级与溯源可用 | L0 四分类报表产出；`invalid_citation` 断言进不了实施契约 |
| clearance 闸门生效 | 敏感帧过滤 + 占位符 + 审计留痕，测试全绿 |

量级参考（单人全栈）：WS1–WS8 合计约 25–35 人日，WS2 调度引擎与 WS4 装配/闸门占一半以上。
