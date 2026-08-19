"""Ollama local runtime management (Hermes-managed local inference).

Replaces the direct llama.cpp path: Ollama is the single local inference
runtime. Hermes resolves an existing Ollama (env override -> PATH -> system
install locations -> managed portable under ``$HERMES_HOME/runtime/ollama``),
bootstraps one on demand, owns the detached ``ollama serve`` lifecycle
(spawn, readiness probe, adoption across backend restarts, stop), and drives
model management through the Ollama HTTP API (``/api/tags``, ``/api/pull``,
``/api/create``, ``/api/show``, ``/api/delete``, blobs upload).

The live endpoint is wired into config.yaml ``providers`` (id ``ollama``)
and optionally activated as the main model, so the existing custom-endpoint
chat chain consumes it unchanged (the ``custom`` provider profile already
handles Ollama's ``num_ctx`` and ``think`` flags).

``ollama serve`` runs DETACHED from the backend process on purpose: the
desktop spawns a fresh backend on every app start, and an atexit kill would
murder the model mid-conversation. The server survives backend restarts and
the next backend adopts it via the live port probe; the user explicitly
stops it to free the port.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional

import httpx

from hermes_constants import get_hermes_home
from hermes_cli.config import load_config, save_config

log = logging.getLogger("hermes_cli.ollama_runtime")

_OLLAMA_PROVIDER_ID = "ollama"
_READY_TIMEOUT = 120.0
_STATE_FILE = "ollama_runtime.json"
_LOG_FILE = "ollama.log"
_DEFAULT_PORT = 11434
_DEFAULT_HOST = "127.0.0.1"

# Ollama download URLs per platform (official portable packages).
_OLLAMA_DOWNLOAD_URLS = {
    "win32": "https://ollama.com/download/ollama-windows-amd64.zip",
    "darwin": "https://ollama.com/download/Ollama-darwin.zip",
    "linux": "https://ollama.com/download/ollama-linux-amd64.tgz",
}

# Hosts allowed for direct GGUF downloads (plan §4.2).
_GGUF_URL_WHITELIST_HOSTS = {"huggingface.co", "github.com", "hf.co"}

# Live child process (the single `ollama serve`), keyed by nothing — there is
# exactly one server. Not persisted: the pid/port survive in the state sidecar
# but a process handle is meaningless after a backend restart.
_proc: Optional["subprocess.Popen"] = None
_proc_lock = threading.Lock()

# In-memory /api/show cache: capabilities/detail probes are chatty if run on
# every 5s settings poll, so show() results are cached briefly.
_show_cache: Dict[str, Dict[str, Any]] = {}
_show_cache_ts: Dict[str, float] = {}
_SHOW_CACHE_TTL = 30.0


# ---------------------------------------------------------------------------
# Config plumbing
# ---------------------------------------------------------------------------


def _ollama_cfg() -> Dict[str, Any]:
    """Read the ``local_runtime.ollama`` section from config.yaml."""
    cfg = load_config()
    section = cfg.get("local_runtime")
    if not isinstance(section, dict):
        section = {}
    entry = section.get("ollama")
    return entry if isinstance(entry, dict) else {}


def _cfg_str(entry: Dict[str, Any], key: str) -> str:
    value = entry.get(key)
    return str(value).strip() if isinstance(value, str) else ""


def _cfg_int(entry: Dict[str, Any], key: str, default: int) -> int:
    value = entry.get(key)
    return value if isinstance(value, int) and value > 0 else default


def managed_ollama_dir() -> Path:
    """``$HERMES_HOME/runtime/ollama`` — the Hermes-managed portable install."""
    return get_hermes_home() / "runtime" / "ollama"


def ollama_models_dir() -> Path:
    """``$HERMES_HOME/models/ollama`` by default; overridable in config."""
    entry = _ollama_cfg()
    override = _cfg_str(entry, "models_dir")
    if override:
        return Path(override).expanduser()
    return get_hermes_home() / "models" / "ollama"


def ollama_install_dir() -> Path:
    entry = _ollama_cfg()
    override = _cfg_str(entry, "install_dir")
    if override:
        return Path(override).expanduser()
    return managed_ollama_dir()


def ollama_host() -> str:
    entry = _ollama_cfg()
    return _cfg_str(entry, "host") or _DEFAULT_HOST


def ollama_port() -> int:
    entry = _ollama_cfg()
    return _cfg_int(entry, "port", _DEFAULT_PORT)


# ---------------------------------------------------------------------------
# Resolution ladder (plan §4.1)
# ---------------------------------------------------------------------------


def _system_install_candidates() -> List[Path]:
    """Standard install locations for each platform (order matters)."""
    if os.name == "nt":
        local = os.environ.get("LOCALAPPDATA", "")
        candidates = []
        if local:
            candidates.append(Path(local) / "Programs" / "Ollama" / "ollama.exe")
        return candidates
    if sys.platform == "darwin":
        return [
            Path("/usr/local/bin/ollama"),
            Path("/Applications/Ollama.app/Contents/Resources/ollama"),
            Path("/opt/homebrew/bin/ollama"),
        ]
    return [Path("/usr/local/bin/ollama"), Path("/usr/bin/ollama")]


def _port_alive(host: str, port: int) -> bool:
    """True when something answers TCP on host:port."""
    if not isinstance(port, int) or port <= 0:
        return False
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


def _api_version(host: str, port: int, timeout: float = 3.0) -> Optional[str]:
    """Return the Ollama version string if an Ollama service answers, else None."""
    try:
        resp = httpx.get(f"http://{host}:{port}/api/version", timeout=timeout)
        if resp.status_code == 200:
            data = resp.json()
            version = data.get("version")
            return str(version) if version else ""
    except Exception:
        pass
    return None


def resolve_ollama() -> Optional[str]:
    """Locate an Ollama binary: env override -> PATH -> system locations ->
    managed portable install. Pure lookup — no side effects."""
    override = os.getenv("HERMES_OLLAMA_BINARY", "").strip()
    if override:
        candidate = Path(override)
        if candidate.is_file():
            return str(candidate)
        log.warning("HERMES_OLLAMA_BINARY points at a missing file: %s", override)

    exe = "ollama.exe" if os.name == "nt" else "ollama"
    on_path = shutil.which(exe)
    if on_path:
        return on_path

    for candidate in _system_install_candidates():
        if candidate.is_file():
            return str(candidate)

    managed = _find_managed_binary(ollama_install_dir())
    if managed:
        return managed

    return None


def _find_managed_binary(install_dir: Path) -> Optional[str]:
    """Find the ollama executable under an extracted portable package.

    The Windows zip carries ``ollama.exe`` at the root; macOS carries an
    ``Ollama.app`` bundle with the binary inside ``Contents/Resources``.
    """
    if not install_dir.is_dir():
        return None
    exe = "ollama.exe" if os.name == "nt" else "ollama"
    root = install_dir / exe
    if root.is_file():
        return str(root)
    # macOS app bundle
    for app in install_dir.glob("Ollama.app/Contents/Resources/*"):
        if app.name == exe and app.is_file():
            return str(app)
    # Recursive search as a last resort (tgz layouts vary)
    for candidate in install_dir.rglob(exe):
        if candidate.is_file():
            return str(candidate)
    return None


def probe_ollama_binary_version(binary: str) -> str:
    """Run ``ollama --version`` and return the version line, or ''."""
    try:
        result = subprocess.run(
            [binary, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        text = ((result.stdout or "") + (result.stderr or "")).strip()
        for line in text.splitlines():
            if "version" in line.lower():
                return line.strip()
        return text.splitlines()[0] if text else ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Managed install (plan §4.1.3)
# ---------------------------------------------------------------------------


def _download_file(url: str, dest: Path, progress_cb: Optional[Callable[[int, int], None]] = None) -> None:
    """Stream-download *url* to *dest*, reporting (completed, total) bytes."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    total = 0
    completed = 0
    with httpx.stream("GET", url, follow_redirects=True, timeout=60.0) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length") or 0)
        with tmp.open("wb") as handle:
            for chunk in resp.iter_bytes(chunk_size=1024 * 256):
                handle.write(chunk)
                completed += len(chunk)
                if progress_cb:
                    progress_cb(completed, total)
    tmp.replace(dest)


def _extract_package(package: Path, install_dir: Path, progress_cb: Optional[Callable[[int, int], None]] = None) -> None:
    """Extract a portable package (zip on Windows/macOS, tgz on Linux)."""
    install_dir.mkdir(parents=True, exist_ok=True)
    if package.suffix == ".zip" or package.name.lower().endswith(".zip"):
        with zipfile.ZipFile(package) as zf:
            names = zf.namelist()
            total = len(names)
            for index, name in enumerate(names):
                zf.extract(name, install_dir)
                if progress_cb:
                    progress_cb(index + 1, total)
    else:
        import tarfile

        with tarfile.open(package, "r:*") as tf:
            members = tf.getmembers()
            total = len(members)
            for index, member in enumerate(members):
                tf.extract(member, install_dir)
                if progress_cb:
                    progress_cb(index + 1, total)


def ensure_ollama(progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None) -> str:
    """Ensure an Ollama binary exists; download the portable package when
    missing. Returns the executable path.

    *progress_cb* receives dicts with ``stage`` in {"download", "extract",
    "done"} plus ``completed``/``total`` and (on failure) ``error``.
    """
    existing = resolve_ollama()
    if existing:
        if progress_cb:
            progress_cb({"stage": "done", "completed": 1, "total": 1, "path": existing})
        return existing

    url = _OLLAMA_DOWNLOAD_URLS.get(sys.platform)
    if not url:
        raise RuntimeError(f"Ollama portable package is not available for platform: {sys.platform}")

    install_dir = ollama_install_dir()
    install_dir.mkdir(parents=True, exist_ok=True)
    package = install_dir / f"ollama-package{'.zip' if url.endswith('.zip') else '.tgz'}"

    def _emit(stage: str, completed: int, total: int, error: str = "") -> None:
        if progress_cb:
            payload: Dict[str, Any] = {"stage": stage, "completed": completed, "total": total}
            if error:
                payload["error"] = error
            progress_cb(payload)

    try:
        _emit("download", 0, 0)
        _download_file(url, package, progress_cb=lambda c, t: _emit("download", c, t))
        _emit("extract", 0, 0)
        _extract_package(package, install_dir, progress_cb=lambda c, t: _emit("extract", c, t))
    except Exception as exc:
        _emit("download", 0, 0, error=str(exc))
        raise
    finally:
        try:
            package.unlink(missing_ok=True)
        except OSError:
            pass

    binary = _find_managed_binary(install_dir)
    if not binary:
        raise RuntimeError(
            f"Ollama portable package extracted but the ollama binary was not found under {install_dir}"
        )

    if progress_cb:
        progress_cb({"stage": "done", "completed": 1, "total": 1, "path": binary})
    log.info("Managed Ollama installed at %s", binary)
    return binary


def update_ollama(progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None) -> str:
    """Re-download and re-extract the managed portable package (models dir is
    untouched). Mirrors ``update_managed_uv``. System installs self-update."""
    binary = resolve_ollama()
    if binary and not Path(binary).is_relative_to(ollama_install_dir()):
        log.info("Ollama is a system install (%s) — it manages its own updates", binary)
        return binary

    # Force a fresh download by removing the current managed install first.
    install_dir = ollama_install_dir()
    try:
        shutil.rmtree(install_dir)
    except FileNotFoundError:
        pass
    except OSError:
        log.warning("Could not remove managed Ollama install at %s", install_dir)
    return ensure_ollama(progress_cb)


# ---------------------------------------------------------------------------
# Server lifecycle (plan §4.2.1)
# ---------------------------------------------------------------------------


def _state_path() -> Path:
    return get_hermes_home() / _STATE_FILE


def _load_state() -> Dict[str, Any]:
    try:
        data = json.loads(_state_path().read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("server"), dict):
            return data
    except FileNotFoundError:
        pass
    except Exception:
        log.exception("Failed to read Ollama runtime state")
    return {"server": {}}


def _save_state(server: Dict[str, Any]) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"server": server}, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _log_path() -> Path:
    path = get_hermes_home() / "logs" / _LOG_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _spawn_server(binary: str, host: str, port: int) -> "subprocess.Popen":
    log_file = _log_path().open("ab")
    env = dict(os.environ)
    env["OLLAMA_HOST"] = f"{host}:{port}"
    env["OLLAMA_MODELS"] = str(ollama_models_dir())
    cmd = [binary, "serve"]
    if os.name == "nt":
        # DETACHED_PROCESS: the server outlives this backend (app restarts,
        # dev-mode backend respawns) and is adopted by the next backend via
        # the port probe. No console window either way.
        creationflags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
        proc = subprocess.Popen(cmd, env=env, stdout=log_file, stderr=subprocess.STDOUT, creationflags=creationflags)
    else:
        proc = subprocess.Popen(
            cmd, env=env, stdout=log_file, stderr=subprocess.STDOUT, start_new_session=True
        )
    with _proc_lock:
        global _proc
        _proc = proc
    return proc


def _wait_ready(host: str, port: int, proc: "subprocess.Popen", timeout: float = _READY_TIMEOUT) -> bool:
    """Poll /api/version until the server answers; False on timeout or crash."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False
        if _api_version(host, port) is not None:
            return True
        time.sleep(0.5)
    return False


def _terminate(proc: "subprocess.Popen") -> None:
    if proc is None or proc.poll() is not None:
        return
    if os.name == "nt":
        proc.terminate()
    else:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def serve_ollama() -> Dict[str, Any]:
    """Start (or adopt) the Ollama server and return its status.

    Resolution order: an existing service on the configured port is adopted
    (including a system-installed tray instance — never spawned twice). When
    the port is taken by a foreign service, a free port is chosen. Otherwise
    ``ollama serve`` is spawned detached with ``OLLAMA_HOST``/``OLLAMA_MODELS``
    injected and polled until ready.
    """
    host = ollama_host()
    port = ollama_port()

    # Adopt an already-running instance first — no second serve, ever.
    version = _api_version(host, port)
    if version is not None:
        state = {"pid": 0, "port": port, "managed": False, "version": version}
        _save_state(state)
        return _status_from_state()

    if _port_alive(host, port):
        port = _free_port(host)
        log.warning("Port %d is occupied by a foreign service; using %d", ollama_port(), port)

    binary = resolve_ollama() or ensure_ollama()
    if not binary:
        raise RuntimeError(
            "Ollama binary not found. Set HERMES_OLLAMA_BINARY, install Ollama, "
            "or run `hermes local-runtime install`."
        )

    proc = _spawn_server(binary, host, port)
    pid = getattr(proc, "pid", 0)
    if not _wait_ready(host, port, proc):
        with _proc_lock:
            _proc = None
        _terminate(proc)
        raise RuntimeError(
            "Ollama failed to start or timed out. Log tail:\n" + _log_tail()
        )

    version = _api_version(host, port) or ""
    _save_state({"pid": pid, "port": port, "managed": True, "version": version})
    log.info("Ollama serve ready on %s:%d (pid %d)", host, port, pid)
    return _status_from_state()


def _log_tail(lines: int = 8) -> str:
    try:
        content = _log_path().read_text(encoding="utf-8", errors="replace")
        return "\n".join(content.strip().splitlines()[-lines:])
    except Exception:
        return ""


def _status_from_state() -> Dict[str, Any]:
    state = _load_state()
    server = state.get("server") or {}
    host = ollama_host()
    port = int(server.get("port") or ollama_port())
    version = _api_version(host, port)
    running = version is not None
    binary = resolve_ollama()
    return {
        "available": bool(binary),
        "install_path": str(Path(binary).parent) if binary else str(ollama_install_dir()),
        "binary": binary or "",
        "models_dir": str(ollama_models_dir()),
        "host": host,
        "port": port,
        "running": running,
        "managed": bool(server.get("managed")) and running,
        "version": version if version is not None else probe_ollama_binary_version(binary) if binary else "",
        "gpu": _detect_gpu_from_log() if running else "",
    }


def runtime_status() -> Dict[str, Any]:
    """Full read-only status: version, install path, models dir, running
    state, and best-effort GPU info."""
    return _status_from_state()


def stop_ollama() -> Dict[str, Any]:
    """Stop the Hermes-managed server. Adopted (system) instances are left
    alone — Hermes does not kill a service it does not own."""
    state = _load_state()
    server = state.get("server") or {}
    status = _status_from_state()
    if not status["running"]:
        return status

    if not server.get("managed"):
        log.info("Ollama instance on port %d is not managed by Hermes — not stopping", status["port"])
        return status

    proc = None
    with _proc_lock:
        global _proc
        proc = _proc
        _proc = None
    if proc is not None:
        _terminate(proc)
    else:
        pid = server.get("pid")
        if isinstance(pid, int) and pid > 0:
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                log.warning("Failed to terminate Ollama pid %s", pid)
    server["managed"] = False
    _save_state(server)
    log.info("Stopped managed Ollama server (port %d)", status["port"])
    return _status_from_state()


def _detect_gpu_from_log() -> str:
    """Best-effort, read-only GPU info from the serve log. Ollama probes GPU
    at startup and logs the compute backend it finds (CUDA/ROCm/Metal/Vulkan/
    CPU); we only surface that, never control it."""
    patterns = [
        (r"inference compute\s*:\s*(.+)", "compute"),
        (r"library\s*=\s*(\S+)", "backend"),
        (r"(\S*cuda\S*)", "cuda"),
        (r"metal", "metal"),
        (r"vulkan", "vulkan"),
        (r"rocm|hip", "rocm"),
        (r"cpu", "cpu"),
    ]
    try:
        content = _log_path().read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    for line in reversed(content.splitlines()):
        for pattern, _label in patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                return line.strip()[:200]
    return ""


# ---------------------------------------------------------------------------
# Ollama HTTP API helpers (plan §7.1)
# ---------------------------------------------------------------------------


def _base_url(host: Optional[str] = None, port: Optional[int] = None) -> str:
    host = host or ollama_host()
    port = port if isinstance(port, int) and port > 0 else ollama_port()
    return f"http://{host}:{port}"


def _require_server() -> Dict[str, Any]:
    """Ensure a server is reachable, starting it if possible; return status."""
    status = _status_from_state()
    if status["running"]:
        return status
    if resolve_ollama() or _port_alive(status["host"], status["port"]):
        return serve_ollama()
    raise RuntimeError(
        "Ollama is not installed. Install it (Settings -> Local Models) or run `hermes local-runtime install`."
    )


def list_models() -> Dict[str, Any]:
    """List installed models (GET /api/tags) plus the active local model."""
    status = _require_server()
    base = _base_url(status["host"], status["port"])
    resp = httpx.get(f"{base}/api/tags", timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    models = []
    for entry in data.get("models") or []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or entry.get("model") or "")
        if not name:
            continue
        details = entry.get("details") or {}
        capabilities = [str(c) for c in (entry.get("capabilities") or [])]
        model = {
            "id": name,
            "name": name,
            "size": entry.get("size") or 0,
            "model_size": entry.get("model_size") or 0,
            "quant": details.get("quantization_level") or "",
            "parameter_size": details.get("parameter_size") or "",
            "capabilities": capabilities,
            "status": "ready",
        }
        if not capabilities:
            show = _show_cached(base, name)
            caps = show.get("capabilities") or []
            model["capabilities"] = [str(c) for c in caps]
        if "thinking" in model["capabilities"]:
            model["thinking"] = model_thinking_state(name)
        models.append(model)

    current = _current_model_cfg()
    return {
        "models": models,
        "current": {
            "provider": str(current.get("provider") or ""),
            "model": str(current.get("default", current.get("name", "")) or ""),
            "is_local": str(current.get("provider") or "").strip().lower() == _OLLAMA_PROVIDER_ID,
        },
    }


def _show_cached(base: str, tag: str) -> Dict[str, Any]:
    now = time.monotonic()
    cached = _show_cache.get(tag)
    if cached is not None and now - _show_cache_ts.get(tag, 0) < _SHOW_CACHE_TTL:
        return cached
    result = {}
    try:
        resp = httpx.post(f"{base}/api/show", json={"model": tag}, timeout=10.0)
        if resp.status_code == 200:
            result = resp.json()
            if not isinstance(result, dict):
                result = {}
    except Exception:
        pass
    _show_cache[tag] = result
    _show_cache_ts[tag] = now
    return result


def show_model(tag: str) -> Dict[str, Any]:
    """POST /api/show — capabilities + details for one model."""
    status = _require_server()
    base = _base_url(status["host"], status["port"])
    resp = httpx.post(f"{base}/api/show", json={"model": tag}, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    caps = data.get("capabilities") or []
    return {
        "id": tag,
        "capabilities": [str(c) for c in caps],
        "details": data.get("details") or {},
        "model_info": data.get("model_info") or {},
        "parameters": data.get("parameters") or "",
    }


def pull_model(tag: str, cancel_event: Optional[threading.Event] = None) -> Iterator[Dict[str, Any]]:
    """POST /api/pull (streaming) — yields per-digest progress dicts.

    Yields: ``{"digest", "total", "completed", "progress", "status"}`` where
    ``progress`` is a 0..1 float. Raises RuntimeError with the Ollama error
    message on a failed pull.
    """
    status = _require_server()
    base = _base_url(status["host"], status["port"])
    with httpx.stream(
        "POST", f"{base}/api/pull", json={"model": tag, "stream": True}, timeout=60.0
    ) as resp:
        if resp.status_code >= 400:
            body = resp.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Ollama pull failed ({resp.status_code}): {body[:300]}")
        for line in resp.iter_lines():
            if cancel_event is not None and cancel_event.is_set():
                raise RuntimeError("Pull cancelled")
            line = (line or "").strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict):
                continue
            total = int(event.get("total") or 0)
            completed = int(event.get("completed") or 0)
            progress = (completed / total) if total > 0 else 0.0
            yield {
                "digest": str(event.get("digest") or ""),
                "total": total,
                "completed": completed,
                "progress": round(progress, 4),
                "status": str(event.get("status") or ""),
            }
            error = event.get("error")
            if error:
                raise RuntimeError(f"Ollama pull failed: {error}")


def delete_model(tag: str) -> None:
    """DELETE /api/delete — remove a model and its blobs."""
    status = _require_server()
    base = _base_url(status["host"], status["port"])
    resp = httpx.delete(f"{base}/api/delete", json={"model": tag}, timeout=60.0)
    if resp.status_code >= 400:
        body = resp.text[:300]
        raise RuntimeError(f"Ollama delete failed ({resp.status_code}): {body}")


def create_model(name: str, modelfile: str) -> None:
    """POST /api/create — build a model from a Modelfile (e.g. ADAPTER mounts)."""
    status = _require_server()
    base = _base_url(status["host"], status["port"])
    with httpx.stream(
        "POST", f"{base}/api/create", json={"model": name, "modelfile": modelfile, "stream": True}, timeout=60.0
    ) as resp:
        if resp.status_code >= 400:
            body = resp.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Ollama create failed ({resp.status_code}): {body[:300]}")
        for line in resp.iter_lines():
            line = (line or "").strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict) and event.get("error"):
                raise RuntimeError(f"Ollama create failed: {event['error']}")


# ---------------------------------------------------------------------------
# GGUF import (plan §4.2.2 / §7.1)
# ---------------------------------------------------------------------------


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def import_gguf(file_path: str, name: str) -> Dict[str, Any]:
    """Import a local GGUF file into Ollama: stage -> sha256 -> blob upload
    -> create (``FROM model.gguf``) -> cleanup. Mirrors the open-webui flow."""
    status = _require_server()
    base = _base_url(status["host"], status["port"])
    path = Path(file_path).expanduser()
    if not path.is_file():
        raise ValueError(f"Model file not found: {file_path}")
    if path.suffix.lower() not in (".gguf", ".safetensors"):
        log.info("Importing non-GGUF file %s — passing through to Ollama", path.name)

    model_name = (name or "").strip() or path.stem

    digest = _sha256(path)
    blob_resp = httpx.put(
        f"{base}/api/blobs/sha256:{digest}",
        content=path.read_bytes(),
        headers={"Content-Type": "application/octet-stream"},
        timeout=3600.0,
    )
    if blob_resp.status_code >= 400:
        raise RuntimeError(f"Blob upload failed ({blob_resp.status_code}): {blob_resp.text[:300]}")

    modelfile = f"FROM model.{path.suffix.lstrip('.')}\n"
    with httpx.stream(
        "POST",
        f"{base}/api/create",
        json={"model": model_name, "files": {f"model.{path.suffix.lstrip('.')}": f"@sha256:{digest}"}, "modelfile": modelfile, "stream": True},
        timeout=3600.0,
    ) as resp:
        if resp.status_code >= 400:
            body = resp.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Ollama create failed ({resp.status_code}): {body[:300]}")
        for line in resp.iter_lines():
            line = (line or "").strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict) and event.get("error"):
                raise RuntimeError(f"Ollama create failed: {event['error']}")

    log.info("Imported GGUF %s as model %s", path.name, model_name)
    return show_model(model_name)


_GGUF_URL_ALLOWED = re.compile(r"^https://(?:[^/]+\.)?(huggingface\.co|hf\.co|github\.com)/", re.IGNORECASE)


def import_gguf_from_url(
    url: str,
    name: str,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """Download a GGUF from a whitelisted host (HuggingFace/GitHub) with
    resume support, then import it like a local file."""
    url = (url or "").strip()
    if not _GGUF_URL_ALLOWED.match(url):
        raise ValueError(
            "Only HuggingFace (huggingface.co / hf.co) and GitHub (github.com) "
            "URLs are allowed for direct downloads."
        )

    staging = get_hermes_home() / "cache" / "uploads"
    staging.mkdir(parents=True, exist_ok=True)
    parsed = urllib.parse.urlparse(url)
    filename = Path(parsed.path).name or "model.gguf"
    if not filename.endswith(".gguf"):
        filename += ".gguf"
    dest = staging / filename

    # Resumable download: keep the partial file and resume with Range.
    completed = dest.stat().st_size if dest.is_file() else 0
    headers = {"Range": f"bytes={completed}-"} if completed else {}
    with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=60.0) as resp:
        if resp.status_code == 416:
            pass  # already fully downloaded
        elif resp.status_code not in (200, 206):
            raise RuntimeError(f"Download failed ({resp.status_code}): {resp.text[:200]}")
        else:
            total = int(resp.headers.get("content-length") or 0) + completed
            with dest.open("ab" if completed else "wb") as handle:
                for chunk in resp.iter_bytes(chunk_size=1024 * 256):
                    handle.write(chunk)
                    completed += len(chunk)
                    if progress_cb:
                        progress_cb({"stage": "download", "completed": completed, "total": total})

    try:
        return import_gguf(str(dest), name)
    finally:
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Activation (plan §7.1 / §4.2.3)
# ---------------------------------------------------------------------------


def _current_model_cfg() -> Dict[str, Any]:
    cfg = load_config()
    model_cfg = cfg.get("model")
    return model_cfg if isinstance(model_cfg, dict) else {}


def activate_model(tag: str) -> Dict[str, Any]:
    """Write the ``ollama`` provider entry + activate *tag* as the main model."""
    status = _require_server()
    if not any(m["id"] == tag for m in list_models()["models"]):
        raise ValueError(f"Model not installed locally: {tag}")
    base = _base_url(status["host"], status["port"])
    cfg = load_config()
    providers = cfg.get("providers")
    if not isinstance(providers, dict):
        providers = {}
    providers[_OLLAMA_PROVIDER_ID] = {
        "name": "Ollama (local)",
        "base_url": f"{base}/v1",
        "model": tag,
        "discover_models": False,
    }
    cfg["providers"] = providers
    model_cfg = cfg.get("model")
    if not isinstance(model_cfg, dict):
        model_cfg = {}
    model_cfg["provider"] = _OLLAMA_PROVIDER_ID
    model_cfg["default"] = tag
    model_cfg["base_url"] = f"{base}/v1"
    model_cfg.pop("context_length", None)
    cfg["model"] = model_cfg
    save_config(cfg)
    log.info("Activated local model %s via provider %s", tag, _OLLAMA_PROVIDER_ID)
    return {"provider": _OLLAMA_PROVIDER_ID, "model": tag, "base_url": f"{base}/v1"}


def deactivate_model() -> None:
    """Clear the main-model pointer when it points at the local provider."""
    cfg = load_config()
    model_cfg = cfg.get("model")
    if isinstance(model_cfg, dict) and str(model_cfg.get("provider") or "").strip().lower() == _OLLAMA_PROVIDER_ID:
        for field in ("provider", "base_url", "api_key", "key_env", "default", "name"):
            model_cfg.pop(field, None)
        cfg["model"] = model_cfg
        save_config(cfg)


def set_model_thinking(tag: str, enabled: bool) -> Dict[str, Any]:
    """Per-model thinking override via ``agent.reasoning_overrides``.

    Disabled -> ``"none"`` (the custom profile then sends ``think:false`` +
    ``reasoning_effort: none`` to Ollama); enabled -> override removed so the
    model's server-side default applies. Independent of the global
    ``agent.reasoning_effort`` default.
    """
    caps = show_model(tag).get("capabilities") or []
    if "thinking" not in caps:
        raise ValueError(f"Model {tag} does not support thinking")
    cfg = load_config()
    agent_cfg = cfg.get("agent")
    if not isinstance(agent_cfg, dict):
        agent_cfg = {}
    overrides = agent_cfg.get("reasoning_overrides")
    if not isinstance(overrides, dict):
        overrides = {}
    if enabled:
        overrides.pop(tag, None)
    else:
        overrides[tag] = "none"
    agent_cfg["reasoning_overrides"] = overrides
    cfg["agent"] = agent_cfg
    save_config(cfg)
    log.info("Local model %s thinking -> %s", tag, "enabled" if enabled else "disabled")
    return {"model": tag, "thinking": enabled}


def model_thinking_state(tag: str) -> bool:
    """Read the persisted per-model thinking state (True when no override)."""
    cfg = load_config()
    agent_cfg = cfg.get("agent")
    overrides = agent_cfg.get("reasoning_overrides") if isinstance(agent_cfg, dict) else None
    if isinstance(overrides, dict) and tag in overrides:
        effort = str(overrides[tag] or "").strip().lower()
        return effort not in ("none", "false", "off", "disabled")
    return True


def legacy_llama_registry() -> Optional[Dict[str, Any]]:
    """Legacy llama.cpp registry (``local_models.json``) from the pre-Ollama
    local-model runtime. Returns ``{"path", "models"}`` when llama entries
    exist so callers can warn users to re-import GGUFs via Ollama instead of
    silently dropping them (plan §7.2 migration — never auto-migrates)."""
    path = get_hermes_home() / "local_models.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    entries = data.get("models")
    if not isinstance(entries, dict) or not entries:
        return None
    return {"path": str(path), "models": sorted(str(k) for k in entries.keys())}