# Hermes 桌面端本地模型（Ollama）集成方案

> 状态：决策已锁定，待实施
> 最后更新：2026-08-18

## 一、背景与目标

为 Hermes 桌面端增加"配置本地模型并进行对话"的能力。当前实现基于 `llama.cpp` 的 `llama-server` 直接托管 GGUF 文件，存在以下问题：

- 硬编码 `--n-gpu-layers 0`（纯 CPU 推理），且仓库内捆绑的 `llama-b10456-bin-win-cpu-x64` 是 CPU-only 构建（无 CUDA/Vulkan/HIP 运行时），有显卡也用不上。
- 可配置参数极少（仅 `ctx_size`，默认 4096）。
- 无模型获取/浏览/下载能力，需手动准备 GGUF。
- 无微调、无 LoRA 挂载入口。

最终目标：用户可在桌面端选择模型、配置权重、进行对话，推理在本地完成。

## 二、选型结论

**以 Ollama 作为唯一本地推理运行时，替代直连 llama.cpp。**

Ollama 已自带：GPU 自动探测（CUDA/AMD/Metal）、模型 registry 拉取、量化 tag 管理、blobs/manifests 存储、OpenAI 兼容 API、Windows 便携分发。直连 llama.cpp 需要自行重写的部分（GPU 探测、模型管理、量化选择）由 Ollama 承担，Hermes 只负责"检测 → 按需安装便携版 → 管理服务生命周期 → 写 provider 配置 → 桌面 UI"。

参考项目：

- `D:\open\ollama-main`：Ollama 源码（GPU 探测 `discover/`、模型创建 `server/create.go`、能力声明 `api/types.go`）
- `D:\open\open-webui-main`：模型管理 UI 与 GGUF 导入流程的主要参照
- `D:\open\page-assist-main`：对话/生命周期交互参照

## 三、关键技术依据（来自 Ollama 源码核实）

- **服务端点**：`ollama serve` 默认 `127.0.0.1:11434`，OpenAI 兼容路径 `/v1/chat/completions`。
- **模型存储**：由 `OLLAMA_MODELS` 环境变量控制，结构为 OCI 风格 `blobs/` + `manifests/`。
- **监听地址**：`OLLAMA_HOST`。
- **GPU**：Ollama 启动时自动探测，无 `OLLAMA_NO_GPU` 开关；`api.Options.NumGPU` 默认 `-1`（自动卸载全部层），设 `0` 强制 CPU。本方案不做手动 GPU 控制，完全交给 Ollama。
- **模型能力**：`POST /api/show` 返回 `Capabilities []model.Capability`，包含 `completion`、`thinking`、`tools`、`vision`、`audio` 等，用于思考模式开关的前置判定。
- **GGUF 导入**：`POST /api/blobs/sha256:<digest>` 上传二进制 → `POST /api/create` 携带 `files` + `modelfile`（`FROM model.gguf`）完成注册。open-webui 采用同一套流程。
- **模型拉取**：`POST /api/pull` 流式返回 JSON 进度（`digest`/`total`/`completed`/`status`）。
- **驱动门槛**（来自 `discover/cuda_compat.go`）：CUDA fatbin 压缩需 NVIDIA 驱动 ≥ 550；旧 PTX JIT 需 ≥ 570。本方案不做预检，仅在 UI 只读展示 Ollama 探测结果。

## 四、用户流程

### 4.1 安装流程

安装 Hermes 后，首次进入"设置 → 提供方 → 本地模型"（或 CLI `hermes setup` Step 1 选择 Local）时：

1. **检测 Ollama 是否已存在**，按优先级：
   1. `HERMES_OLLAMA_BINARY` 环境变量指定路径
   2. 系统 PATH 中的 `ollama`
   3. 系统标准安装位置：
      - Windows：`%LOCALAPPDATA%\Programs\Ollama\ollama.exe`
      - macOS：`/usr/local/bin/ollama`、`/Applications/Ollama.app`
      - Linux：`/usr/local/bin/ollama`
   4. Hermes 托管位置：`$HERMES_HOME/runtime/ollama/ollama(.exe)`
   5. 端口探测：`127.0.0.1:11434` 是否已有 Ollama 服务在运行
2. **已存在** → 不安装，直接复用；若已有服务在 11434 则 adopt，不重复拉起。
3. **不存在** → 触发按需安装：
   - 下载对应平台官方便携包（Windows `ollama-windows-amd64.zip`、macOS tgz、Linux tgz），解压到 `$HERMES_HOME/runtime/ollama/`
   - 流式展示下载/解压进度
   - 模型存储目录默认 `$HERMES_HOME/models/ollama/`（通过 `OLLAMA_MODELS` 注入），设置中可改为其他路径（如大盘）
   - 不强制塞进主安装器（体积大、可选）；`scripts/install.ps1|sh` 增加一个默认跳过的 `Stage-LocalRuntime`（带 skip reason，同 `Stage-Node` 模式）

### 4.2 日常使用

1. 启动 `ollama serve`（detached 子进程，注入 `OLLAMA_HOST`/`OLLAMA_MODELS`），轮询 `/api/version` 就绪。
2. 添加模型（任选其一）：
   - 从 Ollama.com 拉取：输入 tag（如 `qwen3:8b`）→ 选量化 tag → 拉取（进度条/取消）
   - 导入本地 GGUF：文件选择器 → 暂存 → blob 上传 → create
   - 从 HuggingFace/GitHub URL 下载 GGUF（白名单主机）→ 同上导入
   - 从 Modelfile 创建（高级，折叠）
3. 激活模型 → 写 `config.yaml` provider 条目 → 直接对话。
4. 每模型可开启思考模式（仅当 `/api/show` 返回 capabilities 含 `thinking`）。
5. 停止/删除/更新模型。

## 五、目录与配置

### 5.1 托管目录（与 uv 同级于 HERMES_HOME 下）

| 内容 | 路径 | 说明 |
|------|------|------|
| Ollama 程序 | `$HERMES_HOME/runtime/ollama/` | 便携包解压目录（uv 在 `$HERMES_HOME/bin/`） |
| 模型存储 | `$HERMES_HOME/models/ollama/` | `OLLAMA_MODELS`，设置可改 |
| 暂存区 | `$HERMES_HOME/cache/uploads/` | GGUF 导入暂存，完成后删除 |
| 日志 | `$HERMES_HOME/logs/ollama.log` | 复用现有日志目录 |

### 5.2 config.yaml 新增段

```yaml
local_runtime:
  ollama:
    install_dir: ""    # 默认 $HERMES_HOME/runtime/ollama
    models_dir: ""     # 默认 $HERMES_HOME/models/ollama
    host: "127.0.0.1"
    port: 11434        # 被占用时自动选空闲端口
```

- 非密配置走 config.yaml（遵循 AGENTS.md 规范）。
- 环境变量仅保留逃生舱：`HERMES_OLLAMA_BINARY`（与现有 `HERMES_LLAMA_BINARY` 同模式）。
- 不设 `gpu_enabled` / `engine` 字段：GPU 由 Ollama 自动；引擎只有 Ollama。

## 六、功能范围

### 6.1 一期内容

| 模块 | 内容 |
|------|------|
| 安装 | 检测已装→复用；未装→按需下载便携包到 `runtime/ollama/`；模型目录 `models/ollama/`（可改） |
| 生命周期 | detached `ollama serve`、端口探测 `/api/version`、日志、后端重启后端口接管、start/stop |
| GPU | 无开关，Ollama 自动探测；UI 只读展示 GPU/CPU 状态 |
| 模型获取 | tag 拉取（进度/取消）、GGUF 文件导入、HF/GitHub URL 下载导入、Modelfile 创建 |
| 思考模式 | 每模型开关，开启前查 `/api/show` capabilities 含 `thinking` 才允许；不支持则置灰提示 |
| 能力展示 | 列表显示 thinking/tools/vision 徽章 |
| 对话 | 走现有 custom provider（`base_url: http://127.0.0.1:11434/v1`），零改动聊天链路 |
| llama.cpp | 移除直连路径，删除/停用 `local_models.py` 中 llama-server 逻辑与捆绑二进制 |
| CLI/向导 | `hermes local-runtime install/status/update`；`hermes setup` Step 1 增加 Local 选项 |

### 6.2 二期内容

- **微调**：数据集管理 → 基座选择 → LoRA 参数 → 训练进程（`llama-finetune` 或 unsloth）→ 通过 Modelfile `ADAPTER <path>` 挂载或合并后导入。
- 可搜索的模型市场（带评分/截图）；一期仅 tag 输入 + 外链 ollama.com/library（对齐 open-webui）。

## 七、后端设计（Python）

### 7.1 新增 `hermes_cli/ollama_runtime.py`

核心函数：

- `resolve_ollama() -> Optional[str]`：按 4.1 优先级检测，返回可执行路径或 None。
- `ensure_ollama(progress_cb=None) -> str`：缺失时下载便携包并解压，返回路径；带进度回调供 SSE。
- `serve_ollama() -> dict`：启动 detached `ollama serve`，注入 `OLLAMA_HOST`/`OLLAMA_MODELS`，写日志，轮询 `/api/version` 就绪，记录 pid/port。
- `stop_ollama()`：终止进程（句柄优先，pid 兜底）。
- `adopt_existing()`：端口探测，接管已在运行的实例（含系统安装版）。
- `list_models() -> dict`：`GET /api/tags`。
- `pull_model(tag, cancel_event=None) -> Iterator[dict]`：`POST /api/pull` 流式进度。
- `delete_model(tag)`：`DELETE /api/delete`。
- `show_model(tag) -> dict`：`POST /api/show`，返回 capabilities/details。
- `import_gguf(file_path, name) -> dict`：暂存 → SHA256 → `POST /api/blobs/sha256:<digest>` → `POST /api/create`（files + modelfile `FROM model.gguf`）→ 清暂存。
- `import_gguf_from_url(url, name, progress_cb=None)`：白名单 `huggingface.co`/`github.com`，断点续传下载后同 import_gguf。
- `create_model(name, modelfile)`：`POST /api/create`。
- `activate_model(tag)`：写 `config.yaml` providers 条目 + `model.provider/default/base_url`。
- `runtime_status() -> dict`：版本、安装路径、模型目录、运行状态、GPU 信息（解析 `ollama ps` 或启动日志，只读）。
- `update_ollama()`：便携版重新下载解压（参照 `update_managed_uv`）；系统安装版由 Ollama 自更新。

进程管理沿用现有 `local_models.py` 的成熟模式：detached 子进程、日志文件、端口探测 adopt、`_procs` 字典、锁。

### 7.2 移除/替换

- `hermes_cli/local_models.py`：删除 llama-server 相关逻辑（`resolve_llama_binary`、`_spawn_llama_server`、GGUF 直连注册、`--n-gpu-layers` 等）。整体由 `ollama_runtime.py` 替代。
- 仓库根目录 `llama-b10456-bin-win-cpu-x64/`：不再使用，可移除（不阻塞功能开发）。
- 迁移：启动时检测旧 `local_models.json` 中的 llama 条目，提示用户通过 Ollama 重新导入 GGUF 或清除，不自动迁移进程。

### 7.3 HTTP API（`hermes_cli/web_server.py` + `web_models.py`）

```
GET    /api/local-runtimes
       → {ollama: {available, version, install_path, models_dir, running, gpu}}

POST   /api/local-runtimes/ollama/install
       → SSE: {stage, progress, completed, total, error}

GET    /api/local-models
       → {models: [{id, name, size, quant, capabilities[], status}], current}

POST   /api/local-models/pull            body: {tag}
       → SSE: {digest, total, completed, progress, status}

POST   /api/local-models/import-gguf     body: {file_path, name}
       → {ok, model}

POST   /api/local-models/pull-from-url   body: {url, name}
       → SSE

POST   /api/local-models/create          body: {name, modelfile}
       → {ok}

GET    /api/local-models/{id}/show
       → {capabilities: ["completion","thinking","tools","vision"], details}

POST   /api/local-models/{id}/activate
       → {ok, provider, model}

DELETE /api/local-models/{id}
       → {ok}

POST   /api/local-runtimes/ollama/stop
POST   /api/local-runtimes/ollama/start
```

`web_models.py` 替换 `LocalModelRegister`，新增 `OllamaInstallRequest`、`ModelPullRequest`、`GgufImportRequest`、`ModelCreateRequest` 等 Pydantic 模型。

### 7.4 其他后端改动

- `hermes_cli/config_defaults.py`：新增 `local_runtime.ollama` 默认段（见 5.2）。
- `hermes_cli/setup.py`：Step 1 provider 选择加 "Local models (Ollama)" → `ensure_ollama()` + serve + 引导拉取第一个模型。
- `hermes_cli/main.py`：新增 `hermes local-runtime install|status|update` 子命令。
- `scripts/install.ps1` / `install.sh`：新增默认跳过的 `Stage-LocalRuntime`。
- `custom` provider profile 保持不变（已支持 Ollama 的 `num_ctx`、`think` 标志）。

## 八、桌面端设计（TS/React/Electron）

### 8.1 改动文件

| 文件 | 改动 |
|------|------|
| `src/types/hermes.ts` | 更新 `LocalModel`（加 `capabilities`、`size`、`quant`、`digest`）、`LocalRuntime`（Ollama 版）、新增进度类型 |
| `src/hermes.ts` | 替换本地模型 API 客户端：`installOllama()`、`pullModel()`、`importGguf()`、`createModel()`、`getModelShow()`、`activateModel()`；SSE 流式辅助 |
| `src/app/settings/local-models-settings.tsx` | 重写（见 8.2） |
| 会话内模型选择器 | 输入未安装 tag 时显示 "Pull X from Ollama.com" 快捷操作（参照 open-webui `Selector.svelte`） |
| 对话设置 | 活跃模型支持 thinking 时显示思考开关，状态持久化到 config，请求时经 custom provider 传 `think:true` |
| `i18n/*.ts` | 新增文案 |
| Electron | GGUF 文件选择已具备（`window.hermesDesktop?.selectPaths`），无需改动；可选把 `runtime/ollama` 加进后端 PATH（非必需） |

### 8.2 本地模型设置页结构

```
本地模型 (Local Models)
├── 运行时状态卡片
│   ├── Ollama 版本 / 安装路径 / 模型存储路径 / 运行状态 / GPU(只读)
│   └── [安装] / [启动] / [停止] / [更新]
├── 已安装模型列表
│   └── 每项：名称、量化、大小、能力徽章(thinking/tools/vision)、状态
│       [使用] [删除]
├── 添加模型（Tabs）
│   ├── Pull from Ollama.com：tag 输入 + 拉取按钮 + 进度条 + 取消 + library 链接
│   ├── Upload GGUF：文件选择器（.gguf/.safetensors）→ 导入进度
│   ├── From URL：HuggingFace/GitHub 下载链接输入
│   └── Create（高级折叠）：模型名 + Modelfile 文本框
└── 模型设置（每模型）
    └── 思考模式开关（capabilities 含 thinking 才可用，否则置灰）
```

- 无 GPU 开关。
- 轮询复用现有 5 秒刷新机制。
- 安装/拉取/导入均用 SSE 流式进度。

## 九、Footprint 合规

- 全部能力位于 `hermes_cli/` + 桌面端，**不新增核心模型工具**，符合 AGENTS.md Footprint Ladder（CLI 命令 + 后端管理，零 model-tool 占用）。
- 非密配置入 `config.yaml`，仅 `HERMES_OLLAMA_BINARY` 作为逃生舱环境变量。
- 不捆绑 Ollama 进安装包，按需下载（MIT 协议，允许再分发但体积大）。
- 不删除/破坏其他功能；`custom` provider profile 复用。

## 十、实施顺序

1. `hermes_cli/ollama_runtime.py` 核心（resolve/ensure/serve/list/show）+ 单测（mock Ollama HTTP API）
2. `web_server.py` API + `web_models.py` + `config_defaults.py`
3. 桌面运行时卡片 + 模型列表 + 激活对话（最小闭环：装 Ollama → pull → 聊天）
4. GGUF 导入 + URL 下载 + Modelfile 创建
5. 思考模式开关 + 能力徽章
6. `setup.py` 向导 + CLI 子命令 + install 脚本 Stage
7. 旧 llama.cpp 清理 + 迁移提示 + 文档

## 十一、待办与风险

- [ ] 实测 Windows 便携 zip 的 GPU runner 行为：zip 内是否含 CUDA runner，还是首次启动按需下载；必要时复刻 Ollama 安装器的 runner 处理。
- [ ] 确认便携版 `ollama serve` 在 Windows 下无需安装 VC++ 运行时即可启动。
- [ ] 模型目录默认放 `$HERMES_HOME/models/ollama`，首次安装时建议用户确认路径（避免 C 盘空间不足）。
- [ ] 端口 11434 被占用时自动选空闲端口，并正确写入 provider base_url。
- [ ] 系统已装 Ollama 托盘服务时直接 adopt，不重复启动。
- [ ] 便携版更新策略：`hermes local-runtime update` 重新下载解压，模型目录不动。
