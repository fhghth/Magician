"""Tests for hermes_cli.ollama_runtime (Ollama local runtime manager)."""

import io
import json
import os
import signal
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

from hermes_cli.config import load_config, save_config
from hermes_cli import ollama_runtime as rt


class _FakeResp:
    """Minimal httpx-like response for unit tests."""

    def __init__(self, status_code=200, json_data=None, text="", lines=None):
        self.status_code = status_code
        self._json = json_data if json_data is not None else {}
        self.text = text
        self._lines = lines if lines is not None else []
        self.headers = {}

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def iter_bytes(self, chunk_size=None):
        yield self.text.encode()

    def iter_lines(self):
        for line in self._lines:
            yield line

    def read(self):
        return self.text.encode()


class _FakeStream:
    def __init__(self, resp):
        self._resp = resp
        self.status_code = resp.status_code
        self.headers = resp.headers

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_bytes(self, chunk_size=None):
        return self._resp.iter_bytes(chunk_size)

    def iter_lines(self):
        return self._resp.iter_lines()

    def read(self):
        return self._resp.read()


class _FakeProc:
    def __init__(self):
        self.dead = False
        self.pid = 4242

    def poll(self):
        return None if not self.dead else 0

    def terminate(self):
        self.dead = True

    def wait(self, timeout=None):
        self.dead = True
        return 0

    def kill(self):
        self.dead = True


@pytest.fixture(autouse=True)
def _clean_state():
    rt._proc = None
    rt._show_cache.clear()
    rt._show_cache_ts.clear()
    yield
    rt._proc = None
    rt._show_cache.clear()
    rt._show_cache_ts.clear()


def _fake_binary(tmp_path, name="ollama.exe" if os.name == "nt" else "ollama"):
    binary = tmp_path / name
    binary.write_bytes(b"x")
    return str(binary)


# ---------------------------------------------------------------------------
# resolve_ollama ladder
# ---------------------------------------------------------------------------


def test_resolve_prefers_env_override(_isolate_hermes_home, tmp_path):
    binary = _fake_binary(tmp_path)
    with patch.dict(os.environ, {"HERMES_OLLAMA_BINARY": binary}):
        assert rt.resolve_ollama() == binary


def test_resolve_env_override_missing_file_falls_through(_isolate_hermes_home, tmp_path):
    binary = _fake_binary(tmp_path)
    with patch.dict(os.environ, {"HERMES_OLLAMA_BINARY": str(tmp_path / "nope.exe")}), \
         patch.object(rt.shutil, "which", return_value=binary):
        assert rt.resolve_ollama() == binary


def test_resolve_falls_back_to_path(_isolate_hermes_home):
    with patch.object(rt.shutil, "which", return_value="C:/bin/ollama.exe"):
        assert rt.resolve_ollama() == "C:/bin/ollama.exe"


def test_resolve_falls_back_to_system_location(_isolate_hermes_home, tmp_path, monkeypatch):
    if os.name == "nt":
        local = tmp_path / "LocalAppData"
        local.mkdir()
        binary = local / "Programs" / "Ollama" / "ollama.exe"
        binary.parent.mkdir(parents=True)
        binary.write_bytes(b"x")
        monkeypatch.setenv("LOCALAPPDATA", str(local))
        with patch.object(rt.shutil, "which", return_value=None):
            assert rt.resolve_ollama() == str(binary)
    else:
        with patch.object(rt.shutil, "which", return_value=None), \
             patch.object(rt, "_system_install_candidates", return_value=[tmp_path / "ollama"]):
            binary = tmp_path / "ollama"
            binary.write_bytes(b"x")
            assert rt.resolve_ollama() == str(binary)


def test_resolve_falls_back_to_managed_dir(_isolate_hermes_home):
    install = rt.ollama_install_dir()
    install.mkdir(parents=True)
    binary = install / ("ollama.exe" if os.name == "nt" else "ollama")
    binary.write_bytes(b"x")
    with patch.object(rt.shutil, "which", return_value=None), \
         patch.object(rt, "_system_install_candidates", return_value=[]):
        assert rt.resolve_ollama() == str(binary)


def test_resolve_none_when_missing(_isolate_hermes_home):
    with patch.object(rt.shutil, "which", return_value=None), \
         patch.object(rt, "_system_install_candidates", return_value=[]), \
         patch.dict(os.environ, {}, clear=False):
        os.environ.pop("HERMES_OLLAMA_BINARY", None)
        assert rt.resolve_ollama() is None


# ---------------------------------------------------------------------------
# ensure_ollama
# ---------------------------------------------------------------------------


def test_ensure_uses_existing_binary(_isolate_hermes_home, tmp_path):
    binary = _fake_binary(tmp_path)
    with patch.object(rt, "resolve_ollama", return_value=binary) as resolve:
        events = []
        assert rt.ensure_ollama(events.append) == binary
        resolve.assert_called_once()
        assert events[-1]["stage"] == "done"


def test_ensure_downloads_and_extracts_zip(_isolate_hermes_home):
    install = rt.ollama_install_dir()
    install.mkdir(parents=True)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr("ollama.exe", b"binary-bytes")
    zip_bytes = zip_buffer.getvalue()

    package_path = install / "ollama-package.zip"

    def _fake_download(url, dest, progress_cb=None):
        dest.write_bytes(zip_bytes)
        if progress_cb:
            progress_cb(len(zip_bytes), len(zip_bytes))

    with patch.object(rt, "resolve_ollama", return_value=None), \
         patch.object(rt, "_download_file", side_effect=_fake_download):
        events = []
        binary = rt.ensure_ollama(events.append)

    assert binary == str(install / "ollama.exe")
    assert Path(binary).read_bytes() == b"binary-bytes"
    assert not package_path.exists()
    assert any(e["stage"] == "download" for e in events)
    assert any(e["stage"] == "extract" for e in events)
    assert events[-1]["stage"] == "done"


def test_ensure_raises_when_binary_missing_after_extract(_isolate_hermes_home):
    install = rt.ollama_install_dir()
    install.mkdir(parents=True)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr("some-other-tool.exe", b"x")
    zip_bytes = zip_buffer.getvalue()

    def _fake_download(url, dest, progress_cb=None):
        dest.write_bytes(zip_bytes)

    with patch.object(rt, "resolve_ollama", return_value=None), \
         patch.object(rt, "_download_file", side_effect=_fake_download):
        with pytest.raises(RuntimeError, match="ollama binary was not found"):
            rt.ensure_ollama()


# ---------------------------------------------------------------------------
# serve / stop lifecycle
# ---------------------------------------------------------------------------


def test_serve_adopts_running_instance(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"):
        status = rt.serve_ollama()
    assert status["running"] is True
    assert status["managed"] is False
    state = rt._load_state()
    assert state["server"]["pid"] == 0
    assert state["server"]["managed"] is False


def test_serve_spawns_when_nothing_running(_isolate_hermes_home):
    proc = _FakeProc()
    with patch.object(rt, "_api_version", side_effect=[None, "0.6.0", "0.6.0", "0.6.0"]), \
         patch.object(rt, "_port_alive", return_value=False), \
         patch.object(rt, "resolve_ollama", return_value="C:/ollama.exe"), \
         patch.object(rt.subprocess, "Popen", return_value=proc) as spawn:
        status = rt.serve_ollama()

    assert status["running"] is True
    assert status["managed"] is True
    spawn.assert_called_once()
    state = rt._load_state()
    assert state["server"]["pid"] == 4242
    assert state["server"]["managed"] is True


def test_serve_picks_free_port_when_foreign_service_occupies(_isolate_hermes_home):
    proc = _FakeProc()
    with patch.object(rt, "_api_version", side_effect=[None, "0.6.0", "0.6.0", "0.6.0"]), \
         patch.object(rt, "_port_alive", return_value=True), \
         patch.object(rt, "_free_port", return_value=23456), \
         patch.object(rt, "resolve_ollama", return_value="C:/ollama.exe"), \
         patch.object(rt.subprocess, "Popen", return_value=proc) as spawn:
        status = rt.serve_ollama()

    assert status["port"] == 23456
    spawn.assert_called_once()
    args = spawn.call_args
    assert "OLLAMA_HOST" in args.kwargs["env"]
    assert args.kwargs["env"]["OLLAMA_HOST"] == "127.0.0.1:23456"


def test_serve_failure_raises_with_log_tail(_isolate_hermes_home):
    proc = _FakeProc()
    proc.dead = True
    with patch.object(rt, "_api_version", return_value=None), \
         patch.object(rt, "_port_alive", return_value=False), \
         patch.object(rt, "resolve_ollama", return_value="C:/ollama.exe"), \
         patch.object(rt.subprocess, "Popen", return_value=proc), \
         patch.object(rt, "_log_tail", return_value="boom"):
        with pytest.raises(RuntimeError, match="boom"):
            rt.serve_ollama()


def test_stop_only_kills_managed_server(_isolate_hermes_home):
    proc = _FakeProc()
    with patch.object(rt, "_api_version", side_effect=[None, "0.6.0", "0.6.0", "0.6.0", "0.6.0", None]), \
         patch.object(rt, "_port_alive", return_value=False), \
         patch.object(rt, "resolve_ollama", return_value="C:/ollama.exe"), \
         patch.object(rt.subprocess, "Popen", return_value=proc):
        rt.serve_ollama()
        status = rt.stop_ollama()
    assert status["running"] is False
    assert proc.dead


def test_stop_leaves_adopted_instance_alone(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"):
        rt.serve_ollama()
        status = rt.stop_ollama()
    assert status["running"] is True
    assert status["managed"] is False


def test_stop_orphan_kills_recorded_pid(_isolate_hermes_home):
    rt._save_state({"pid": 7777, "port": 11434, "managed": True})
    with patch.object(rt, "_api_version", side_effect=["0.6.0", None]), \
         patch.object(rt, "_proc", None), \
         patch.object(rt.os, "kill") as kill:
        status = rt.stop_ollama()
    kill.assert_called_once_with(7777, signal.SIGTERM)
    assert status["running"] is False


# ---------------------------------------------------------------------------
# model list / show / pull / delete / create
# ---------------------------------------------------------------------------


def test_list_models_parses_tags_with_capabilities(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "get", return_value=_FakeResp(json_data={
             "models": [
                 {
                     "name": "qwen3:8b",
                     "size": 5000000000,
                     "details": {"quantization_level": "Q4_K_M", "parameter_size": "8.2B"},
                     "capabilities": ["completion", "tools", "thinking"],
                 },
                 {"name": "gemma3:4b", "size": 3000000000, "details": {"quantization_level": "Q4_0", "parameter_size": "3.5B"}},
             ]
         })):
        result = rt.list_models()

    models = result["models"]
    assert models[0]["id"] == "qwen3:8b"
    assert models[0]["quant"] == "Q4_K_M"
    assert "thinking" in models[0]["capabilities"]
    assert models[0]["capabilities"] == ["completion", "tools", "thinking"]
    assert models[0]["thinking"] is True
    assert "thinking" not in models[1]
    assert result["current"]["is_local"] is False


def test_list_models_fills_capabilities_via_show_cache(_isolate_hermes_home):
    tags = _FakeResp(json_data={"models": [{"name": "qwen3:8b", "size": 1, "details": {}}]})
    show = _FakeResp(json_data={"capabilities": ["completion", "thinking"]})

    def _fake_get(url, **kwargs):
        assert url.endswith("/api/tags")
        return tags

    def _fake_post(url, **kwargs):
        assert url.endswith("/api/show")
        return show

    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "get", side_effect=_fake_get), \
         patch.object(rt.httpx, "post", side_effect=_fake_post):
        result = rt.list_models()
    assert "thinking" in result["models"][0]["capabilities"]


def test_list_models_reflects_disabled_thinking_override(_isolate_hermes_home):
    cfg = load_config()
    cfg["agent"] = {"reasoning_overrides": {"qwen3:8b": "none"}}
    save_config(cfg)

    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "get", return_value=_FakeResp(json_data={
             "models": [
                 {"name": "qwen3:8b", "size": 1, "details": {},
                  "capabilities": ["completion", "thinking"]},
             ]
         })):
        result = rt.list_models()
    assert result["models"][0]["thinking"] is False


def test_legacy_llama_registry_detects_old_entries(_isolate_hermes_home):
    from hermes_cli import ollama_runtime as rt

    assert rt.legacy_llama_registry() is None

    registry = {"models": {"my-gguf": {"id": "my-gguf", "status": "ready"}}}
    (rt.get_hermes_home() / "local_models.json").write_text(
        json.dumps(registry), encoding="utf-8"
    )
    legacy = rt.legacy_llama_registry()
    assert legacy is not None
    assert legacy["models"] == ["my-gguf"]

    (rt.get_hermes_home() / "local_models.json").write_text(
        json.dumps({"models": {}}), encoding="utf-8"
    )
    assert rt.legacy_llama_registry() is None


def test_list_models_flags_active_local_model(_isolate_hermes_home):
    cfg = load_config()
    cfg["model"] = {"provider": "ollama", "default": "qwen3:8b"}
    cfg["providers"] = {"ollama": {"base_url": "http://127.0.0.1:11434/v1"}}
    save_config(cfg)

    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "get", return_value=_FakeResp(json_data={"models": []})):
        result = rt.list_models()
    assert result["current"]["is_local"] is True
    assert result["current"]["model"] == "qwen3:8b"


def test_pull_model_streams_progress(_isolate_hermes_home):
    lines = [
        json.dumps({"status": "pulling manifest"}),
        json.dumps({"status": "downloading", "digest": "sha256:abc", "total": 100, "completed": 25}),
        json.dumps({"status": "downloading", "digest": "sha256:abc", "total": 100, "completed": 100}),
        json.dumps({"status": "success"}),
    ]
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "stream", return_value=_FakeStream(_FakeResp(lines=lines))):
        events = list(rt.pull_model("qwen3:8b"))

    assert events[1]["progress"] == 0.25
    assert events[2]["progress"] == 1.0
    assert events[-1]["status"] == "success"


def test_pull_model_raises_on_ollama_error(_isolate_hermes_home):
    lines = [json.dumps({"status": "error", "error": "model not found"})]
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "stream", return_value=_FakeStream(_FakeResp(lines=lines))):
        with pytest.raises(RuntimeError, match="model not found"):
            list(rt.pull_model("nope"))


def test_pull_model_respects_cancel_event(_isolate_hermes_home):
    import threading

    lines = [json.dumps({"status": "downloading", "total": 100, "completed": 10})]
    cancel = threading.Event()
    cancel.set()
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "stream", return_value=_FakeStream(_FakeResp(lines=lines))):
        with pytest.raises(RuntimeError, match="Pull cancelled"):
            list(rt.pull_model("qwen3:8b", cancel_event=cancel))


def test_delete_model(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "delete", return_value=_FakeResp()) as delete:
        rt.delete_model("qwen3:8b")
    delete.assert_called_once()
    args = delete.call_args
    assert args.kwargs["json"] == {"model": "qwen3:8b"}


def test_create_model_posts_modelfile(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "stream", return_value=_FakeStream(_FakeResp(lines=[json.dumps({"status": "success"})]))) as stream:
        rt.create_model("my-model", "FROM qwen3:8b\n")
    args = stream.call_args
    assert args.args[1].endswith("/api/create")
    assert args.kwargs["json"] == {"model": "my-model", "modelfile": "FROM qwen3:8b\n", "stream": True}


def test_create_model_raises_on_ollama_error(_isolate_hermes_home):
    lines = [json.dumps({"error": "bad modelfile"})]
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "stream", return_value=_FakeStream(_FakeResp(lines=lines))):
        with pytest.raises(RuntimeError, match="bad modelfile"):
            rt.create_model("my-model", "FROM x\n")


def test_show_model_returns_capabilities(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "post", return_value=_FakeResp(json_data={
             "capabilities": ["completion", "thinking"],
             "details": {"family": "qwen3"},
             "parameters": "num_ctx 8192",
         })):
        result = rt.show_model("qwen3:8b")
    assert "thinking" in result["capabilities"]
    assert result["parameters"] == "num_ctx 8192"


# ---------------------------------------------------------------------------
# GGUF import
# ---------------------------------------------------------------------------


@pytest.fixture
def gguf_file(tmp_path):
    path = tmp_path / "my-model-q4.gguf"
    path.write_bytes(b"GGUF" + b"\x00" * 512)
    return str(path)


def test_import_gguf_uploads_blob_and_creates(_isolate_hermes_home, gguf_file):
    import hashlib

    digest = hashlib.sha256(Path(gguf_file).read_bytes()).hexdigest()
    calls = {}

    def _fake_put(url, **kwargs):
        calls["put_url"] = url
        calls["put_kwargs"] = kwargs
        return _FakeResp()

    def _fake_stream(method, url, **kwargs):
        calls["stream_url"] = url
        calls["stream_kwargs"] = kwargs
        return _FakeStream(_FakeResp(lines=[json.dumps({"status": "success"})]))

    def _fake_post(url, **kwargs):
        calls["post_url"] = url
        calls["post_kwargs"] = kwargs
        return _FakeResp(json_data={"capabilities": ["completion"]})

    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "put", side_effect=_fake_put), \
         patch.object(rt.httpx, "stream", side_effect=_fake_stream), \
         patch.object(rt.httpx, "post", side_effect=_fake_post):
        result = rt.import_gguf(gguf_file, "my-model")

    assert calls["put_url"] == f"http://127.0.0.1:11434/api/blobs/sha256:{digest}"
    create_json = calls["stream_kwargs"]["json"]
    assert create_json["model"] == "my-model"
    assert create_json["files"] == {"model.gguf": f"@sha256:{digest}"}
    assert "FROM model.gguf" in create_json["modelfile"]
    assert "thinking" not in result["capabilities"]


def test_import_gguf_missing_file_raises(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"):
        with pytest.raises(ValueError, match="not found"):
            rt.import_gguf("Z:/does/not/exist.gguf", "x")


def test_import_gguf_url_whitelist(_isolate_hermes_home):
    with pytest.raises(ValueError, match="Only HuggingFace"):
        rt.import_gguf_from_url("https://evil.example.com/model.gguf", "x")
    with pytest.raises(ValueError, match="Only HuggingFace"):
        rt.import_gguf_from_url("http://huggingface.co/model.gguf", "x")


def test_import_gguf_from_url_downloads_and_imports(_isolate_hermes_home):
    import hashlib

    payload = b"GGUF-downloaded"

    def _fake_stream(method, url, **kwargs):
        resp = _FakeResp(text=payload.decode())
        resp.headers = {"content-length": str(len(payload))}
        return _FakeStream(resp)

    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "stream", side_effect=_fake_stream), \
         patch.object(rt.httpx, "put", return_value=_FakeResp()), \
         patch.object(rt.httpx, "post", return_value=_FakeResp(json_data={"capabilities": ["completion"]})):
        events = []
        result = rt.import_gguf_from_url(
            "https://huggingface.co/org/model/resolve/main/model.gguf", "remote-model", events.append
        )

    assert result["id"] == "remote-model"
    assert events[-1]["stage"] == "download"
    staging = rt.get_hermes_home() / "cache" / "uploads"
    leftovers = list(staging.glob("*.gguf")) if staging.exists() else []
    assert leftovers == []


# ---------------------------------------------------------------------------
# activation + thinking
# ---------------------------------------------------------------------------


def test_activate_model_writes_provider_and_main(_isolate_hermes_home):
    tags = _FakeResp(json_data={"models": [{"name": "qwen3:8b", "size": 1, "details": {}, "capabilities": ["completion"]}]})
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "get", return_value=tags):
        result = rt.activate_model("qwen3:8b")

    assert result["provider"] == "ollama"
    cfg = load_config()
    assert cfg["providers"]["ollama"]["base_url"] == "http://127.0.0.1:11434/v1"
    assert cfg["providers"]["ollama"]["model"] == "qwen3:8b"
    assert cfg["model"]["provider"] == "ollama"
    assert cfg["model"]["default"] == "qwen3:8b"


def test_activate_unknown_model_raises(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "get", return_value=_FakeResp(json_data={"models": []})):
        with pytest.raises(ValueError, match="not installed"):
            rt.activate_model("nope")


def test_deactivate_clears_main_when_local(_isolate_hermes_home):
    cfg = load_config()
    cfg["model"] = {"provider": "ollama", "default": "qwen3:8b"}
    save_config(cfg)
    rt.deactivate_model()
    assert "provider" not in load_config().get("model", {})


def test_deactivate_keeps_other_provider(_isolate_hermes_home):
    cfg = load_config()
    cfg["model"] = {"provider": "deepseek", "default": "deepseek-chat"}
    save_config(cfg)
    rt.deactivate_model()
    assert load_config()["model"]["provider"] == "deepseek"


def test_set_model_thinking_requires_capability(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "post", return_value=_FakeResp(json_data={"capabilities": ["completion"]})):
        with pytest.raises(ValueError, match="does not support thinking"):
            rt.set_model_thinking("gemma3:4b", True)


def test_set_model_thinking_persists_override(_isolate_hermes_home):
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt.httpx, "post", return_value=_FakeResp(json_data={"capabilities": ["completion", "thinking"]})):
        rt.set_model_thinking("qwen3:8b", False)
        cfg = load_config()
        assert cfg["agent"]["reasoning_overrides"]["qwen3:8b"] == "none"
        assert rt.model_thinking_state("qwen3:8b") is False

        rt.set_model_thinking("qwen3:8b", True)
        cfg = load_config()
        assert "qwen3:8b" not in cfg["agent"]["reasoning_overrides"]
        assert rt.model_thinking_state("qwen3:8b") is True


def test_model_thinking_state_defaults_true(_isolate_hermes_home):
    assert rt.model_thinking_state("qwen3:8b") is True


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------


def test_runtime_status_when_installed_but_stopped(_isolate_hermes_home, tmp_path):
    binary = _fake_binary(tmp_path)
    with patch.object(rt, "_api_version", return_value=None), \
         patch.object(rt, "resolve_ollama", return_value=binary), \
         patch.object(rt, "probe_ollama_binary_version", return_value="version 0.6.0"):
        status = rt.runtime_status()
    assert status["available"] is True
    assert status["running"] is False
    assert status["version"] == "version 0.6.0"
    assert str(rt.ollama_models_dir()) in status["models_dir"]


def test_runtime_status_when_running_reports_gpu(_isolate_hermes_home):
    rt._save_state({"pid": 1, "port": 11434, "managed": True})
    with patch.object(rt, "_api_version", return_value="0.6.0"), \
         patch.object(rt, "resolve_ollama", return_value="C:/ollama.exe"), \
         patch.object(rt, "_detect_gpu_from_log", return_value="inference compute: CUDA"):
        status = rt.runtime_status()
    assert status["running"] is True
    assert status["gpu"] == "inference compute: CUDA"