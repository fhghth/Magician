# Hermes Agent Preset ↔ DeepSeek Harness 对齐进度追踪

> 本文档追踪 Hermes 向 DeepSeek Harness 的技能/工具/预设注入逻辑对齐进度。
> 参考源码：`D:\open\deepseek-harness-master\deepseek-harness-master`
> 最后更新：2026-08-20

---

## 一、整体架构对比

| 维度 | DeepSeek Harness | Hermes（当前） |
|------|-------------------|-----------------|
| 核心范式 | 一切皆插件（Cordis），注册即 effect，disposer 自动清理 | 单体 Python 核心 + 插件边缘扩展 |
| 作用域模型 | 全局层 + 作用域链（ScopedLayers），最近作用域覆盖全局 | 全局单例 registry，按平台 toolset 过滤 |
| 预设模型 | Standing mount：每 preset 挂载一次，同 preset 的 agent 共享实例 | ✅ PresetMountManager 单例 + file_stamp 缓存键 |
| Prompt 缓存 | 非首要设计目标，目录变更自动重发布 | 最高优先级，系统提示字节稳定神圣不可侵犯 |
| 技能目录注入 | user message（`<available_skills>` 块）+ SHA-256 digest 检测 | ✅ user message 注入 + digest 检测 + 压缩后重发 |
| 技能调用 | 双路径：`modelInvocable`（skill 工具）+ `userInvocable`（`/name` 斜杠） | ✅ `disable-model-invocation` + `user-invocable` 双字段控制 |
| 文件监视 | Chokidar 实时监视，自动失效 | ✅ 目录 stamp 轮询检测 + 缓存失效（轻量方案） |
| 工具输出 | 结构化 `output.schema` + `output.render` 分离 | ✅ ToolOutputSpec 基础设施（schema 验证 + render 分离 + wrap_handler） |
| 系统提示 | 四类贡献（sections/contexts/tools/variables）+ 分层合并 + waterfall | ✅ SystemPromptRegistry 基础设施（section/context/variable/transformer + 作用域覆盖 + waterfall + 变量插值） |
| 卸载 | Effect-based 自动级联清理 | 显式命令 + 手动缓存失效 |

---

## 二、已对齐部分 ✅

### 2.1 Preset 核心语义

| Harness 概念 | Hermes 实现 | 涉及文件 | 状态 |
|---|---|---|---|
| Preset 目录结构 | `agent.preset.yaml` + `preset.yml` | `hermes_cli/agent_presets.py` | ✅ 已对齐 |
| 组合文件为 line list | persona / tools / capabilities / skills 四种 line kind | `hermes_cli/agent_presets.py` | ✅ 已对齐 |
| 发现：bundled first + user root | `discover_presets()` + `BUNDLED_PRESET_DIR` + `user_presets_root()` | `hermes_cli/agent_presets.py` | ✅ 已对齐 |
| first-root-wins on id collisions | `by_id.setdefault()` | `hermes_cli/agent_presets.py` | ✅ 已对齐 |
| Broken preset 列出但不可 mount | `broken` / `broken_reason` 字段 | `hermes_cli/agent_presets.py` | ✅ 已对齐 |
| `copy()` 创作（唯一写入方式） | `copy_preset()` | `hermes_cli/agent_presets.py` | ✅ 已对齐 |
| `default` 预设（config） | `agent_presets.default` config key | `hermes_cli/agent_presets.py`, `hermes_cli/presets.py` | ✅ 已对齐 |
| 优先级：explicit > session > config | `agent_init.py` 三段解析 | `agent/agent_init.py` | ✅ 已对齐 |
| tools/capabilities → toolset 合并 | `apply_preset_tools()` | `hermes_cli/agent_presets.py` | ✅ 已对齐 |
| skills allow/deny 过滤 | `apply_preset_skills()` → `only_skill_names`/`deny_skill_names` | `hermes_cli/agent_presets.py`, `agent/prompt_builder.py` | ✅ 已对齐 |
| persona → system prompt | `agent._preset_persona` → `build_system_prompt_parts` | `agent/agent_init.py`, `agent/system_prompt.py` | ✅ 已对齐 |
| persona `complete: true` 替换全系统提示 | preset persona complete 字段 | `agent/system_prompt.py` | ✅ 已对齐 |
| mid-session `/preset` 切换（recompose） | CLI `/preset` 命令 | `cli.py`, `hermes_cli/cli_commands_mixin.py` | ✅ 已对齐 |
| TUI RPC preset 方法 | `methods_presets.py` | `tui_gateway/methods_presets.py` | ✅ 已对齐 |
| CLI 命令（list/show/copy/default） | `hermes preset` 子命令 | `hermes_cli/presets.py` | ✅ 已对齐 |

### 2.2 测试覆盖

| 测试文件 | 覆盖范围 | 状态 |
|---|---|---|
| `tests/run_agent/test_agent_preset_mount.py` | preset mount 到 agent | ✅ |
| `tests/hermes_cli/test_agent_presets.py` | preset 发现/解析/合并 | ✅ |
| `tests/tui_gateway/test_presets_rpc.py` | TUI RPC preset 方法 | ✅ |
| `tests/tui_gateway/test_preset_default_config_set.py` | default preset 配置 | ✅ |

---

## 三、尚未对齐的核心差距

### P0：Standing Mount 共享实例 🔴

**Harness 设计**：
- 每个 preset 只 mount 一次（standing mount），所有命名该 preset 的 agent 共享**同一插件实例、同一工具注册、同一 prompt sections**
- 子 agent 通过 `composeFrom()` 继承父 agent 的完全相同的 composition（同一插件对象）
- 文件戳（mtimeMs + size）检测变更：新会话用新一代，已有会话保持原代
- 参考：`packages/preset/agent-presets/src/mount.ts`, `index.ts`

**Hermes 当前**：
- 每个 agent 独立加载 preset 配置，在 init 时修改 toolset 列表和 skill 过滤
- 没有共享实例，子 agent（delegate_task）有独立的 toolset 配置
- 无代际隔离

**对齐方案**：
1. 引入 `PresetMountManager` 单例，按 preset id 缓存已解析的 composition
   - 缓存内容：`enabled_toolsets`, `disabled_toolsets`, `skill_allow`, `skill_deny`, `persona`
   - 缓存键：`preset_id + composition_file_stamp(mtime+size)`
   - 文件变更时自动失效（新会话用新解析，已有会话保持引用）
2. `agent_init.py` 中从 `PresetMountManager` 获取解析结果，而非每次独立解析
3. delegate_task 子 agent 默认继承父 agent 的 preset id（而非独立配置）
   - 在 `tools/delegate_tool.py` 中传递 `agent_preset` 参数
   - 子 agent 初始化时读取父 agent 的 `_agent_preset_id`

**涉及文件**：
- 新建：`agent/preset_mount_manager.py`
- 修改：`agent/agent_init.py`（使用 manager）
- 修改：`tools/delegate_tool.py`（传递 preset id）
- 修改：`run_agent.py`（AIAgent 接收 agent_preset 参数）

**验收标准**：
- [ ] 同 preset 的多个 agent 共享同一份解析结果（不重复解析文件）
- [ ] 子 agent 继承父 agent 的 preset
- [ ] preset 文件变更后，新会话使用新解析，已有会话不受影响
- [ ] 现有 preset 测试全部通过

---

### P1：技能目录从系统提示迁移到 user message catalog 🟡

**Harness 设计**：
- 技能目录作为 **user message** 注入对话，包含 `<system-reminder><available_skills>` 块
- SHA-256 digest 变更检测，仅在目录变化时重发布
- 目录可见性与 `skill` 工具注册绑定：工具被限制时目录同步消失
- 参考：`packages/skill/tool-skill/src/index.ts`

**Hermes 当前**：
- 技能索引注入**系统提示**（`build_skills_system_prompt()`，57 字符截断）
- mtime 缓存，技能变更时 `clear_skills_system_prompt_cache()` 失效
- 无 digest 精确检测

**对齐方案**：
1. 新建 `agent/skill_catalog.py`，负责：
   - 收集所有 `modelInvocable` 技能的 name + description
   - 计算 SHA-256 digest
   - 渲染 `<system-reminder><available_skills>` user message
   - 与上一次 digest 比较，未变更时不重发
2. 在 `run_conversation()` 首轮注入 catalog user message（而非系统提示）
3. 系统提示中移除技能索引部分（或保留为极简提示"使用 skill_view 加载技能"）
4. 上下文压缩时重置 digest 缓存（压缩后需重发目录）

**涉及文件**：
- 新建：`agent/skill_catalog.py`
- 修改：`run_agent.py`（首轮注入 catalog）
- 修改：`agent/prompt_builder.py`（移除或精简技能索引）
- 修改：`agent/conversation_compressor.py`（压缩时重置 catalog 缓存）

**验收标准**：
- [ ] 技能目录作为 user message 注入，不在系统提示中
- [ ] digest 未变更时不重发目录
- [ ] 技能增删改后下一轮自动重发目录
- [ ] 上下文压缩后重发目录
- [ ] prompt cache 命中率不下降（系统提示更稳定）

---

### P2：技能双调用控制（modelInvocable / userInvocable） 🟡

**Harness 设计**：
- 每个技能有独立的 `modelInvocable`（出现在目录 + skill 工具可加载）和 `userInvocable`（可通过 `/name` 斜杠调用）
- frontmatter 字段：`disable-model-invocation`（默认 false）、`user-invocable`（默认 true）
- `modelInvocable=false` 的技能不出现在目录，但可通过 `/name` 斜杠调用
- 参考：`packages/skill/skill-filesystem/src/index.ts`（`parseInvocationPolicy`）

**Hermes 当前**：
- 技能统一通过 `skill_view` 工具加载
- 斜杠命令是独立机制（`agent/skill_commands.py`），无 per-skill 控制
- 无 `disable-model-invocation` 概念

**对齐方案**：
1. 在技能 frontmatter 解析中增加：
   - `disable-model-invocation: bool`（默认 false）
   - `user-invocable: bool`（默认 true）
2. `skills_list()` 和技能目录中过滤掉 `modelInvocable=false` 的技能
3. `skill_view()` 中检查 `modelInvocable`，非 model-invocable 技能拒绝模型调用
4. 斜杠命令调用路径（`agent/skill_commands.py`）检查 `userInvocable`
5. `apply_preset_skills()` 的 allow/deny 列表同时影响两种调用路径

**涉及文件**：
- 修改：`tools/skills_tool.py`（frontmatter 解析 + 调用检查）
- 修改：`agent/skill_commands.py`（userInvocable 检查）
- 修改：`agent/prompt_builder.py`（目录过滤）

**验收标准**：
- [ ] `disable-model-invocation: true` 的技能不出现在目录，模型无法 skill_view 加载
- [ ] `user-invocable: false` 的技能无法通过斜杠命令调用
- [ ] 两种控制独立，互不影响
- [ ] 现有技能全部默认行为不变（modelInvocable=true, userInvocable=true）

---

### P3：文件系统实时监视 🟢

**Harness 设计**：
- Chokidar 实时监视技能根目录，200ms 稳定性阈值
- 变更自动 invalidate 缓存 + 触发 `skills/change` 事件
- Preset 文件变更通过 mtimeMs+size 戳检测
- 参考：`packages/skill/skill-filesystem/src/index.ts`（`SkillWatchManager`）

**Hermes 当前**：
- 技能索引 mtime 缓存被动失效（重建时检测）
- Preset 无文件监视，每次 `find_preset()` 重读
- 无主动失效机制

**对齐方案**：
1. 引入技能目录文件监视（使用 `watchfiles` 或 `watchdog`）
   - 监视 `~/.hermes/skills/`、项目 `.hermes/skills/`、内置 `skills/`
   - 变更（add/change/delete）时主动调用 `clear_skills_system_prompt_cache()`
   - 同时触发技能目录 digest 失效（P1 完成后）
2. Preset 文件监视：
   - 监视 `~/.hermes/.agent-presets/` 和 bundled preset 目录
   - 变更时失效 `PresetMountManager` 缓存（P0 完成后）
3. 网关/CLI 退出时清理监视器

**涉及文件**：
- 新建：`agent/file_watcher.py`（或复用现有基础设施）
- 修改：`tools/skills_tool.py`（集成监视）
- 修改：`hermes_cli/agent_presets.py`（集成监视）
- 依赖：`watchfiles`（推荐，高性能）或 `watchdog`

**验收标准**：
- [ ] 技能文件增删改后，下一轮自动使用新目录（无需重启）
- [ ] Preset 文件变更后，新会话使用新解析
- [ ] 监视器在进程退出时正确清理
- [ ] 无频繁变更导致的性能问题（debounce）

---

### P4：工具结构化输出（output.schema + output.render） 🔵

**Harness 设计**：
- 工具定义有 `output.schema`（结构化输出 JSON Schema）+ `output.render`（渲染函数）分离
- 工具结果可以是结构化对象而非纯字符串
- `presentCall(args)` 声明 UI 展示意图（generic/terminal/diff）
- 参考：`packages/core/tools/src/index.ts`（`defineTool`）

**Hermes 当前**：
- 所有工具 handler 必须返回 JSON 字符串
- 无结构化输出 schema
- 无 UI 展示意图声明

**对齐方案**（长期目标，可选）：
1. 扩展 `registry.register()` 支持 `output_schema` 和 `render_fn` 参数
2. 工具 handler 可返回 dict（结构化对象），由 registry 自动序列化为 JSON
3. `render_fn` 用于将结构化结果渲染为模型面向文本
4. `presentCall` 等价物：工具 schema 中增加 `ui_hint` 字段

**涉及文件**：
- 修改：`tools/registry.py`
- 修改：`model_tools.py`（结果处理）

**验收标准**：
- [ ] 工具可返回结构化 dict，自动序列化
- [ ] 现有返回 JSON 字符串的工具不受影响
- [ ] 性能无回归

**优先级说明**：这是较大的改动，涉及工具注册 schema 扩展和 agent loop 结果处理。短期不必对齐，可作为长期架构目标。

---

### P5：系统提示四类贡献 + waterfall 组装 🔵

**Harness 设计**：
- 系统提示由四类贡献组装：
  - `sections`：有序系统提示段（name + order + text/function）
  - `contexts`：动态运行时上下文（user-role snapshot）
  - `tools`：工具 schema 提供者
  - `variables`：`{{variable}}` 插值提供者
- 全局 + scope 分层合并，scoped 同名覆盖 global
- `system-prompt/assemble` waterfall 事件，插件可在组装后修改
- `complete` section 完全替换系统提示
- 参考：`packages/core/system-prompt/src/index.ts`

**Hermes 当前**：
- 固定模板拼接（`build_system_prompt_parts()`）
- preset persona 通过 `complete: true` 可替换整个系统提示（已实现）
- 无变量插值、无动态 context、无 waterfall

**对齐方案**（长期目标，可选）：
1. 引入 `PromptSection` 注册机制：`register_prompt_section(name, order, text_or_fn)`
2. 引入 `{{variable}}` 插值支持：`register_prompt_variable(name, provider_fn)`
3. 组装时按 order 排序 sections，插值 variables
4. waterfall 事件可延后（Python 中可用钩子列表替代）

**涉及文件**：
- 新建：`agent/prompt_registry.py`
- 修改：`agent/prompt_builder.py`（重构为注册式组装）
- 修改：`agent/system_prompt.py`

**验收标准**：
- [ ] 插件可注册自定义 prompt section
- [ ] `{{variable}}` 插值工作
- 现有系统提示内容不变
- [ ] 性能无回归

**优先级说明**：这是架构级重构，涉及 `prompt_builder.py` 全面重构。短期不必全面对齐，可逐步引入（先加变量插值，再加动态 sections）。

---

## 四、推荐对齐路线

```
阶段 1：核心基础（立即可做）
  ├─ P0  Standing Mount 共享实例
  └─     子 agent 继承父 agent preset

阶段 2：技能系统对齐
  ├─ P1  技能目录迁移到 user message + digest 检测
  └─ P2  双调用控制（modelInvocable/userInvocable）

阶段 3：运行时增强
  ├─ P3  文件系统实时监视
  └─     preset 代际隔离

阶段 4：长期架构目标（可选）
  ├─ P4  工具结构化输出
  └─ P5  系统提示四类贡献 + waterfall
```

---

## 五、关键文件索引

### Hermes 侧

| 文件 | 职责 |
|------|------|
| `hermes_cli/agent_presets.py` | Preset 发现/解析/合并核心 |
| `hermes_cli/presets.py` | `hermes preset` CLI 命令 |
| `agent/agent_init.py` | Agent 初始化时应用 preset |
| `agent/prompt_builder.py` | 系统提示构建 + 技能索引 |
| `agent/system_prompt.py` | 系统提示段组装 |
| `tools/skills_tool.py` | skills_list / skill_view 工具 |
| `tools/skill_manager_tool.py` | skill_manage（create/edit/delete） |
| `agent/skill_commands.py` | 技能斜杠命令 |
| `tools/registry.py` | 工具注册中心 |
| `model_tools.py` | 工具发现/组装/dispatch |
| `toolsets.py` | 工具集定义 |
| `tui_gateway/methods_presets.py` | TUI preset RPC 方法 |
| `tools/delegate_tool.py` | 子 agent 委派 |

### Harness 侧（参考）

| 文件 | 职责 |
|------|------|
| `packages/skill/skill/src/index.ts` | 技能注册中心（SkillRegistry） |
| `packages/skill/skill-filesystem/src/index.ts` | 文件系统技能提供者 + 监视 |
| `packages/skill/tool-skill/src/index.ts` | skill 工具 + 目录注入 |
| `packages/preset/agent-presets/src/index.ts` | Preset 服务（AgentPresets） |
| `packages/preset/agent-presets/src/mount.ts` | Standing mount 实现 |
| `packages/preset/agent-presets/src/discovery.ts` | Preset 发现 |
| `packages/core/tools/src/index.ts` | 工具注册中心（defineTool） |
| `packages/core/system-prompt/src/index.ts` | 系统提示组装（四类贡献） |

---

## 六、进度追踪

| 阶段 | 任务 | 优先级 | 状态 | 完成日期 |
|------|------|--------|------|----------|
| 基础 | Preset 核心语义对齐 | - | ✅ 已完成 | 2026-08-20 |
| 阶段 1 | P0 Standing Mount 共享实例 | 🔴 高 | ✅ 已完成 | 2026-08-20 |
| 阶段 1 | 子 agent 继承父 agent preset | 🔴 高 | ✅ 已完成 | 2026-08-20 |
| 阶段 2 | P1 技能目录迁移到 user message | 🟡 中 | ✅ 已完成 | 2026-08-20 |
| 阶段 2 | P2 双调用控制 | 🟡 中 | ✅ 已完成 | 2026-08-20 |
| 阶段 3 | P3 文件系统变化检测 | 🟢 低 | ✅ 已完成 | 2026-08-20 |
| 阶段 4 | P4 工具结构化输出基础设施 | 🔵 可选 | ✅ 已完成（基础设施+registry集成） | 2026-08-20 |
| 阶段 4 | P5 系统提示四类贡献基础设施 | 🔵 可选 | ✅ 已完成（基础设施+桥接集成） | 2026-08-20 |
| 阶段 5 | 现有系统提示迁移到 registry | 🔵 长期 | ✅ 已完成（桥接式迁移+内置sections注册） | 2026-08-20 |
| 阶段 5 | 现有工具逐步迁移到 output_spec | 🔵 长期 | 🔄 进行中（已迁移 44 个核心工具：todo/skills_list/clarify/read_file/web_search/terminal/write_file/patch/search_files/delegate_task/memory/web_extract/session_search/vision_analyze/browser_navigate/cronjob/image_generate/execute_code/browser_snapshot/browser_click/browser_type/browser_scroll/browser_back/browser_press/browser_get_images/browser_vision/browser_console/text_to_speech/kanban_show/kanban_list/kanban_complete/kanban_block/kanban_heartbeat/kanban_comment/kanban_attach/kanban_create/kanban_unblock/kanban_link/kanban_attach_url/kanban_attachments/ha_list_entities/ha_get_state/ha_list_services/ha_call_service，基础设施就绪） | 2026-08-20 |

---

## 七、注意事项

1. **Prompt caching 约束**：Hermes 的 prompt caching 是最高优先级约束。P1（技能目录迁移到 user message）实际上**有利于** prompt caching——系统提示更稳定，目录变更只影响 user message。但需确保压缩后正确重发目录。

2. **向后兼容**：所有对齐必须保持向后兼容。现有技能、工具、preset 的默认行为不变。新功能通过 opt-in 字段（如 `disable-model-invocation`）启用。

3. **测试覆盖**：每个 P0-P3 任务必须包含单元测试 + 集成测试。P4-P5 作为长期目标，可在实施时补充测试。

4. **渐进式实施**：建议按阶段顺序实施，每个阶段完成后验证稳定性再进入下一阶段。P0 是后续所有对齐的基础。

5. **Harness 预发布状态**：Harness 仍处于 pre-release 阶段（"foundation over blast radius"），其 API 可能变化。对齐时关注稳定的核心概念（standing mount、scoped layers、invocation policy），而非具体实现细节。
