"""Tests for the Ollama local-runtime endpoints in hermes_cli.web_server."""

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _client(monkeypatch, _isolate_hermes_home):
    try:
        from starlette.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi/starlette not installed")

    from hermes_cli import web_server

    monkeypatch.setattr(web_server, "_ollama_rt", _FakeRt())
    self = SimpleNamespace()
    self.client = TestClient(web_server.app)
    self.client.headers[web_server._SESSION_HEADER_NAME] = web_server._SESSION_TOKEN
    self.rt = web_server._ollama_rt
    return self


class _FakeRt:
    """Fake ollama_runtime module: every call records and returns canned data."""

    def __init__(self):
        self.calls = []
        self.status = {
            "available": True,
            "version": "0.6.0",
            "install_path": "C:/runtime/ollama",
            "models_dir": "C:/models/ollama",
            "host": "127.0.0.1",
            "port": 11434,
            "running": True,
            "managed": True,
            "gpu": "inference compute: CUDA",
        }
        self.models_payload = {
            "models": [
                {
                    "id": "qwen3:8b",
                    "name": "qwen3:8b",
                    "size": 5000000000,
                    "quant": "Q4_K_M",
                    "capabilities": ["completion", "thinking", "tools"],
                    "status": "ready",
                }
            ],
            "current": {"provider": "ollama", "model": "qwen3:8b", "is_local": True},
        }

    def _record(self, name, args, kwargs):
        self.calls.append((name, args, kwargs))

    def runtime_status(self):
        self._record("runtime_status", (), {})
        return dict(self.status)

    def serve_ollama(self):
        self._record("serve_ollama", (), {})
        return {"ok": "started"}

    def stop_ollama(self):
        self._record("stop_ollama", (), {})
        return {"ok": "stopped"}

    def list_models(self):
        self._record("list_models", (), {})
        return self.models_payload

    def show_model(self, tag):
        self._record("show_model", (tag,), {})
        return {"id": tag, "capabilities": ["completion", "thinking"], "details": {}}

    def activate_model(self, tag):
        self._record("activate_model", (tag,), {})
        return {"provider": "ollama", "model": tag, "base_url": "http://127.0.0.1:11434/v1"}

    def set_model_thinking(self, tag, enabled):
        self._record("set_model_thinking", (tag, enabled), {})
        return {"model": tag, "thinking": enabled}

    def delete_model(self, tag):
        self._record("delete_model", (tag,), {})
        return None

    def import_gguf(self, file_path, name):
        self._record("import_gguf", (file_path, name), {})
        return {"id": name or "x", "capabilities": ["completion"]}

    def create_model(self, name, modelfile):
        self._record("create_model", (name, modelfile), {})
        return None

    def ensure_ollama(self, progress_cb=None):
        self._record("ensure_ollama", (), {})
        if progress_cb:
            progress_cb({"stage": "download", "completed": 5, "total": 10})
            progress_cb({"stage": "extract", "completed": 10, "total": 10})
            progress_cb({"stage": "done", "completed": 1, "total": 1})
        return "C:/runtime/ollama/ollama.exe"

    def pull_model(self, tag, cancel_event=None):
        self._record("pull_model", (tag,), {})
        yield {"digest": "sha256:abc", "total": 100, "completed": 50, "progress": 0.5, "status": "downloading"}
        yield {"digest": "sha256:abc", "total": 100, "completed": 100, "progress": 1.0, "status": "success"}

    def import_gguf_from_url(self, url, name, progress_cb=None):
        self._record("import_gguf_from_url", (url, name), {})
        if progress_cb:
            progress_cb({"stage": "download", "completed": 42, "total": 84})
        return {"id": name, "capabilities": ["completion"]}


# ---------------------------------------------------------------------------
# status / lifecycle
# ---------------------------------------------------------------------------


def test_get_local_runtimes_reports_status(_client):
    resp = _client.client.get("/api/local-runtimes")
    assert resp.status_code == 200
    ollama = resp.json()["ollama"]
    assert ollama["available"] is True
    assert ollama["version"] == "0.6.0"
    assert ollama["running"] is True
    assert ollama["gpu"] == "inference compute: CUDA"


def test_start_ollama(_client):
    resp = _client.client.post("/api/local-runtimes/ollama/start")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert ("serve_ollama", (), {}) in _client.rt.calls


def test_stop_ollama(_client):
    resp = _client.client.post("/api/local-runtimes/ollama/stop")
    assert resp.status_code == 200
    assert ("stop_ollama", (), {}) in _client.rt.calls


def test_install_ollama_streams_progress(_client):
    with _client.client.stream("POST", "/api/local-runtimes/ollama/install") as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        events = [json.loads(line[6:]) for line in resp.iter_lines() if line.startswith("data: ")]
    assert events[0]["stage"] == "download"
    assert events[0]["progress"] == 0.5
    assert events[-1]["stage"] == "done"
    assert events[-1]["progress"] == 1.0


def test_install_ollama_streams_error_then_ends(_client, monkeypatch):
    def _boom(progress_cb=None):
        raise RuntimeError("download failed")

    monkeypatch.setattr(_client.rt, "ensure_ollama", _boom)
    with _client.client.stream("POST", "/api/local-runtimes/ollama/install") as resp:
        events = [json.loads(line[6:]) for line in resp.iter_lines() if line.startswith("data: ")]
    assert events[-1]["error"] == "download failed"


# ---------------------------------------------------------------------------
# model management
# ---------------------------------------------------------------------------


def test_list_local_models(_client):
    resp = _client.client.get("/api/local-models")
    assert resp.status_code == 200
    data = resp.json()
    assert data["models"][0]["id"] == "qwen3:8b"
    assert "thinking" in data["models"][0]["capabilities"]
    assert data["current"]["is_local"] is True


def test_pull_model_streams_progress(_client):
    with _client.client.stream("POST", "/api/local-models/pull", json={"tag": "qwen3:8b"}) as resp:
        assert resp.status_code == 200
        events = [json.loads(line[6:]) for line in resp.iter_lines() if line.startswith("data: ")]
    assert events[0]["progress"] == 0.5
    assert events[-1]["status"] == "success"


def test_pull_model_streams_error_then_ends(_client, monkeypatch):
    def _boom(tag, cancel_event=None):
        yield {"digest": "", "total": 0, "completed": 0, "progress": 0.0, "status": "pulling"}
        raise RuntimeError("model not found")

    monkeypatch.setattr(_client.rt, "pull_model", _boom)
    with _client.client.stream("POST", "/api/local-models/pull", json={"tag": "nope"}) as resp:
        events = [json.loads(line[6:]) for line in resp.iter_lines() if line.startswith("data: ")]
    assert events[-1]["error"] == "model not found"


def test_import_gguf_local_file(_client):
    resp = _client.client.post(
        "/api/local-models/import-gguf", json={"file_path": "C:/models/x.gguf", "name": "x"}
    )
    assert resp.status_code == 200
    assert resp.json()["model"]["id"] == "x"
    assert ("import_gguf", ("C:/models/x.gguf", "x"), {}) in _client.rt.calls


def test_import_gguf_value_error_maps_to_400(_client, monkeypatch):
    def _boom(file_path, name):
        raise ValueError("Model file not found: nope")

    monkeypatch.setattr(_client.rt, "import_gguf", _boom)
    resp = _client.client.post(
        "/api/local-models/import-gguf", json={"file_path": "nope", "name": "x"}
    )
    assert resp.status_code == 400
    assert "not found" in resp.json()["detail"]


def test_pull_from_url_streams_progress(_client):
    with _client.client.stream(
        "POST",
        "/api/local-models/pull-from-url",
        json={"url": "https://huggingface.co/org/m/resolve/main/m.gguf", "name": "m"},
    ) as resp:
        assert resp.status_code == 200
        events = [json.loads(line[6:]) for line in resp.iter_lines() if line.startswith("data: ")]
    assert events[0]["stage"] == "download"
    assert events[0]["progress"] == 0.5
    assert events[-1]["stage"] == "done"


def test_create_model(_client):
    resp = _client.client.post(
        "/api/local-models/create", json={"name": "m", "modelfile": "FROM qwen3:8b\n"}
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_show_model(_client):
    resp = _client.client.get("/api/local-models/qwen3:8b/show")
    assert resp.status_code == 200
    assert "thinking" in resp.json()["capabilities"]


def test_activate_model(_client):
    resp = _client.client.post("/api/local-models/qwen3:8b/activate")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["provider"] == "ollama"


def test_thinking_toggle(_client):
    resp = _client.client.post("/api/local-models/qwen3:8b/thinking", json={"enabled": False})
    assert resp.status_code == 200
    assert resp.json()["thinking"] is False
    assert ("set_model_thinking", ("qwen3:8b", False), {}) in _client.rt.calls


def test_delete_model(_client):
    resp = _client.client.delete("/api/local-models/qwen3:8b")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert ("delete_model", ("qwen3:8b",), {}) in _client.rt.calls


def test_pull_wires_cancel_event(_client):
    """The route must hand pull_model a threading.Event wired to the stream."""
    import threading

    cancel_seen = []

    def _pulling(tag, cancel_event=None):
        cancel_seen.append(cancel_event)
        yield {"digest": "d", "total": 100, "completed": 100, "progress": 1.0, "status": "success"}

    _client.rt.pull_model = _pulling
    with _client.client.stream("POST", "/api/local-models/pull", json={"tag": "x"}) as resp:
        for line in resp.iter_lines():
            if line.startswith("data: "):
                assert json.loads(line[6:])["status"] == "success"
    assert cancel_seen and isinstance(cancel_seen[0], threading.Event)