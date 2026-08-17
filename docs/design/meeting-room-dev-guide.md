# 会议室功能编码实施指南（分阶段技术设计）

| | |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-08-07 |
| 上游文档 | 企划 [meeting-room.md](meeting-room.md)（离场模式决议）· 施工方案 [meeting-room-implementation.md](meeting-room-implementation.md) |
| 读者 | 施工工程师 |

本指南把 P0 拆成 **M0–M5 六个里程碑**，每个里程碑可独立验收、可回滚。原则：**先有能跑的最小闭环，再逐层加复杂度**——M1 结束时功能已可演示，之后每个 M 只加一层能力。

---

## 实现三原则（动工前读）

1. **`meeting_events` 是唯一事实源**。调度状态、UI 投影、回放、审计全部从事件流重建；任何状态变更先落事件再生效。调试时一张表看清一切。
2. **单会议单协程**。每个会议一个 engine 协程，所有输入（Agent 回合完成、用户 RPC、熔断计时器）进同一优先级队列，循环内无锁。并发复杂度全部关在队列门外。
3. **LLM 只有提议权**。主持人的决策走 structured output 封闭动作集；调度、熔断、预算、过滤全是纯代码，可单测、可故障注入。

### 接口草案（M1 起逐步落地，允许微调）

**RPC（上行，仿 `tui_gateway/methods_session.py` 的 `@method` 注册）**：
`meeting.create{origin_ref, topic, mode, seats[], budgets}` / `meeting.pause` / `meeting.resume` / `meeting.interject{text}` / `meeting.veto{target_id}` / `meeting.seize` / `meeting.decree{text}`（一言堂）/ `meeting.close` / `meeting.status{id}`

**事件（下行，`meeting.*` namespace，scoped 路由仿 `subagent.*`）**：
`meeting.turn.start|delta|complete{seat, seq}` · `meeting.queue.update` · `meeting.budget.update{remaining}` · `meeting.fuse{kind, detail}` · `meeting.ledger.update` · `meeting.signoff.request` · `meeting.conclusion{packet}`

---

## M0 地基：存储与数据模型（约 2 人日）

**目标**：五张表落库，DAO 可用，不写任何会议逻辑。

- **0.1** 按施工方案 §2 DDL 建表（`meetings / meeting_events / meeting_keyframes / meeting_ledger / meeting_claims`），注册进现有 state DB 迁移机制（惯例参照 `tests/test_zeroed_state_db.py`）。注意 `meetings.status` 含 `interrupted`（施工方案已修订）。
- **0.2** `agent/meeting/store.py`：DAO 层。写路径**复用现有 state DB 连接管理**（sqlite 锁/泄漏病史在前，禁新开连接）；`meeting_events` 的 `seq` 由 DAO 保证会议内单调递增（回放依赖）。
- **0.3** `meeting_events` 追加写封装：`emit(meeting_id, kind, actor, payload)` —— 这是后续所有模块的唯一写入口。

**测试**：迁移测试；并发追加写不乱序、不死锁（仿 `test_sqlite_lock_safe_inspection.py`）。
**DoD**：测试绿，DAO 单测覆盖。

---

## M1 最小闭环：轻量会诊 walking skeleton（约 5 人日）

**目标**：从对话发起 1v1 会诊 → 两席位规则轮流发言 → 预算耗尽自动收敛 → 纪要落库 → 结论卡片回流原对话。**不用 LLM 主持人**，先把端到端管道打穿。

- **1.1** `agent/meeting/engine.py`：状态机 `created→running→converging→closed|aborted`；`shutdown()` 钩子（程序退出 → `aborted` 落库，未决签章转待回放）+ 启动自检（发现 `running` 无活引擎 → 标 `interrupted`）。与单对话生命周期同构。
- **1.2** `agent/meeting/seat.py`：席位 = 独立 `AIAgent` 实例（`run_agent.py:412`），持各自消息历史；`TurnRunner` 驱动一席发言，流式输出复用现有 `message.*` 事件管线（不另起渲染通道）。
- **1.3** `agent/meeting/scheduler.py`（M1 版）：纯规则轮流 + 三重预算扣减（token 走 `agent/credits_tracker.py` / `account_usage.py`，**不是** `tools/budget_config.py`）+ 任一耗尽 → 强制收敛。
- **1.4** `agent/meeting/products.py`（M1 版）：最小账本级纪要生成；闭幕发 `meeting.conclusion`（`origin_ref=thread:*` 时写 SessionMessage，`display_kind='meeting_conclusion'`，`types/hermes.ts:546` 开放联合无需改 core type）。
- **1.5** 桌面最小 UI：`src/store/meeting.ts`（nanostores，仿 `store/subagents.ts`）+ 只读发言流 + 预算表 + `gateway-events.ts` 增 `meeting.*` scoped 路由；回流卡片渲染仿 `lib/chat-messages.ts` 的 `async_delegation_complete` 路径。

**测试**：端到端集成测试——mock 两席位模型，断言：轮流顺序正确、token 扣减正确、预算耗尽收敛、事件流完整、退出/重启两个终态正确。
**DoD**：功能可演示。**此后每个 M 只是加层，不再有"跑不起来"的风险。**

### M1.1 补丁包（实测反馈回填，2026-08-09，约 2–3 人日，阻塞 M2）

首轮实测暴露四个 M1 DoD 欠账，全部修复后才允许进 M2——M2 调试依赖可观测性与可介入性：

1. **`meeting.close` RPC + 结束按钮（安全级）**：handle 加 `threading.Event` 停止信号；scheduler 循环每回合检查 → `engine.abort(actor="user")`；当前回合若在进行，复用 `request_hard_interrupt`（`agent/interrupt_compat.py:9`）中止席位 agent；会议视图加"结束会议"按钮。
2. **席位身份贯通**：`meeting.started` 事件发完整 roster `[{seat_id, name, role}]`（当前只发 seat_id 列表）；`turn.complete` 载荷带 `name`/`role`；桌面 `MeetingTurn` 扩字段，会议视图按席位显示名称+角色+配色。
3. **正向背景快照**：`meeting.create` 从 origin session 拉最近 N 条消息（≈20 条或 8k token 内）压成 background 存入 meeting row，`_build_prompt` 开场轮注入。**留 TODO**：M1 阶段席位全继承同 provider（无出域风险），M2/P1 允许异构席位后快照必须先过 clearance 闸门。
4. **`meeting.interject` 最小版**：RPC 写入 `meeting_events(kind=user_interject, actor=user)` + scheduler 每回合开始前排空 pending 队列、作为"用户回合"注入 transcript（占回合、不触发席位生成）；桌面会议视图自带输入框（**不劫持聊天 composer**）。M2.5 再升级为真 P0 abort 语义。
5. **回流卡片确认**：反向通道（products.finalize → 原 thread 的 `meeting_conclusion` 卡片）已实现，实测确认卡片到达；若缺失查 `_ensure_session_db_row` → `append_message` 链路。

另注意：`_default_seat_specs` 默认 3 席含"协调者"席位，与企划"主持人不占人头"有出入——M1 walking skeleton 可接受，**M2 必须把主持人从席位中拿出**，改为非席位的 structured-output 调用。

---

## M2 调度完整化（约 7 人日，P0 复杂度核心）

**目标**：完整会议档（3 席 + LLM 主持人）+ 全部防死锁机制 + 用户 P0 中断。

- **2.1** scheduler 重写为正式版：FloorToken + P0–P4 优先级队列；举手制（席位发言请求入队，携带原因：被@/被追问/主动）。
- **2.2** LLM 主持人（非席位）：输入 = 队列快照 + 滚动摘要，输出 = structured output 封闭动作集 `{next_speaker|park_topic|summarize|escalate_to_user|close}`；10s 超时或非法输出累计 2 次 → 自动降级兜底调度器（被@者 > 被追问者 > 领域相关度 > 举手先后），恢复后交还。
- **2.3** @解析 + 环检测：单议题内同 pair 互@计数 >2 → 不产新回合，自动转争议点搁置并升级；熔断后涉事 pair 冷却 M 回合。
- **2.4** 三级熔断：①单回合 60s 无产出 → 令牌移交，半成品标"发言中断"；②语义循环（连续 4 回合相似度超阈）→ 强制主持人"收敛或升级"，同议题三振 → 自动搁置+通知；③liveness probe：T 秒无 dequeue ∧ token 无 owner ∧ budget 不递减 → 判死锁并强制收敛。
- **2.5** P0 中断接线（链路已核验）：`meeting.interject` → 复用 `request_hard_interrupt`（`agent/interrupt_compat.py:9`）→ `AIAgent.interrupt(hard_cancel=True)`（`run_agent.py:3020`，真实 abort 流式）→ 半成品折叠标"被打断" → 令牌立即移交用户。区分 `meeting.pause`（冻结引擎）与插嘴（抢令牌）。

**测试（红线）**：故障注入三场景全部自动收敛、死锁 0 次——①互@死循环；②主持人持续超时/非法输出；③预算耗尽。另：插嘴 abort 后无残留流、令牌归属正确。
**DoD**：红线测试进 CI。

---

## M3 记忆与诚信层（约 7 人日）

**目标**：三层记忆装配 + 断言核验 + 决策账本 + clearance 闸门。

- **3.1** 发言人协议：发言 structured output 扩展 `claims[]`（断言文本 + `fact|inference|opinion` + citation）。
- **3.2** `agent/meeting/recorder.py` 核验层（纯代码、零 token、每轮同步）：citation 可解析（文件存在/行号有效/SHA 可定位）+ 引用片段含断言数值 → `ok|unresolved|invalid_citation|value_mismatch` 四分类落 `meeting_claims`。
- **3.3** 关键帧管线：四来源（用户标记 / 记录员按 schema 抽取 / `pin_message` 工具自标记 / 正则候选）；`agent/meeting/ledger.py` 版本化账本（只追加，`supersedes_id` 链）。
- **3.4** `agent/meeting/memory.py` 装配器：每席位每轮上下文 = 初始目标 + Tier1 关键帧 + 账本当前值 + 滚动摘要 + 最近 N 轮原文；挂在现有压缩链路同级（`trajectory_compressor.py` 对应装配点）。
- **3.5** `agent/meeting/clearance.py`：providers 配置扩展 `clearance` 字段 + 项目敏感路径/模式策略文件 + 装配前独立过滤阶段；**被过滤帧以 `[已脱敏条目 #N，由主持人掌握]` 占位注入**（防 Tier1 分歧割裂质证）；审计写 `meeting_events(kind=clearance_audit)`。
- **3.6** 事件驱动补抽：议题关闭/决策事件/每 K 回合触发，P4 队列，走 `agent/auxiliary_client.py` 最便宜已配置模型，结果标 `declared_by=extractor`。

**测试（红线）**：敏感帧不进低 clearance 上下文 + 占位符在场 + 审计可查；决策门报表：recorder/speaker token ≤ 0.3、assertion recall ≥ 80%、补抽新增率（漏报信号）。
**DoD**：Agent 引用一个 2 小时前被压缩掉的数字时，该数字来自账本逐字而非摘要转述。

---

## M4 产物与权限（约 4 人日）

**目标**：产物门 + 结论状态机 + 人类独裁模式。

- **4.1** 产物门：闭幕校验——实施契约（目标/约束/验收标准/测试要求/禁止事项/溯源引用）或账本级纪要至少其一，否则拒绝闭幕记异常会议；契约中定量断言必须 `verify_status=ok`。
- **4.2** 结论状态机 `提议→待确认→已决策(签章)` 落 `meeting_ledger.status`；控制条五 RPC：`veto`（标记"已被用户否决"注入全体上下文约束 + 账本注记，**标记非删除**）/ `seize`（令牌夺还，主持人降级参与者）/ `decree`（一言堂：绑定决策事件 + 议题关闭）/ `pause` / `close`。
- **4.3** 回放基础：按 `seq` 重放 `meeting_events` + 账本 diff 视图（离场模式的事后回溯地基，P2 直接复用）。

**测试**：否决后后续发言不得引用被否内容（上下文断言）；一言堂后议题状态正确；无产物会议拒绝闭幕。
**DoD**：P0 功能完整。

---

## M5 UI 完整化与评测硬化（约 4 人日）

**目标**：达到企划 §7 布局规约 + 评测体系 L0 + 红线全进 CI。

**UI 施工以企划 §7 为唯一依据**——所有区域职责、模式切换、断点行为、输入框分离规则已在 §7.1–§7.7 定稿。以下为施工要点摘录，冲突时以 §7 原文为准。

- **5.1 侧边栏分组（§7.1）**：`apps/desktop/src/app/chat/sidebar/index.tsx` 内"对话""会议"两类分区，会议条目含状态芯片、待回答红点、预算细条。`store/meeting.ts` 加 `$meetingsById` 派生。
- **5.2 独立会议三列（§7.2）**：主区圆桌 + 席位卡片（持令牌者展开流式，其余仅状态徽章）+ 头部条预算 + 控制条五按钮 + 右侧栏 [对话]/[焦点]/[回放] Tab + 排队薄条 + 会议输入框 + 快捷操作行。
- **5.3 对话内会议四列（§7.3）**：对话列压缩 + 会议列紧凑（席位横排，省略圆环）+ 头部精简控制条；对话输入框与会议输入框**双框分立**。
- **5.4 圆桌降级与断点（§7.4、§7.6）**：2–4/5–7/8–10 人三档 + 窗口 <1280px / <1024px 断点；圆桌不得以 CSS 自适应绕过显式断点；对话流虚拟化。
- **5.5 L0 评测报表**：citation 四分类分布（机械、零 token），按会议/按周期聚合。
- **5.6 红线 CI**：M2 故障注入三场景、M3 闸门测试、M3/M5 决策门报表。

**DoD = P0 验收红线**：
1. 死锁 0（M2 故障注入三场景全自动收敛）
2. 断言分级与溯源可用（L0 四分类报表产出，invalid_citation 不进契约）
3. clearance 闸门生效（敏感帧过滤 + 占位符 + 审计留痕）
4. **两输入框绝对不合一**：独立会议模式下仅右侧栏会议输入框；对话内会议模式下对话输入框与会议输入框物理分离、语义不同、同时可见

---

## P1 / P2 衔接（详见施工方案 §4）

- **P1**：kanban 转入（`estimateTask` 扩维度）、AI 申请召集（确认制）、焦点栏四 tab、圆桌 2–4 人档、主持日志 UI、防漂移对账、金丝雀评测、待回答面板（复用 `tools/clarify_tool.py`）。
- **P2（离场模式）**：Delegation Profile 白/灰/黑名单 + 两个 P2 前必须回答的设计点——
  1. **"离场"判定信号**：建议不做存在性检测（idle detection 是误检温床），改为会议创建时/会议中显式"允许离场"开关，配合预算硬顶兜底；
  2. **休眠时间空洞**：合盖休眠时进程挂起、wall-clock 的 `budget_seconds` 会在睡眠中耗尽导致唤醒误杀——预算应改为引擎活跃 tick 累计，且离场会议期间复用 `electron/power-save.ts`（powerSaveBlocker）阻止系统休眠。
- P2 数据列（`delegation_profile_id` / `intent` / `pre_state_ref` / `project_id`）M0 已预留，点亮即可，无迁移。

---

## 里程碑依赖与节奏

```
M0(2d) → M1(5d) → M2(7d) → M3(7d) → M4(4d) → M5(4d)   ≈ 29 人日
              └─ M1 结束 = walking skeleton 可演示 ─┘
```

M2 与 M3 的装配器（3.4）有接口依赖（调度器调装配器取上下文），M3 可先以"最近 N 轮原文"空装配开工，并行不阻塞。每个 M 合并前跑全部已通过的红线测试，防回归。
