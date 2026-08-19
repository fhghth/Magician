"""``hermes local-runtime`` — manage the managed Ollama local model runtime.

Subcommands: install / status / update. Mirrors the desktop settings surface
("Local Models") for terminal users.
"""

import argparse
import sys


def _print_progress(ev: dict) -> None:
    stage = ev.get("stage")
    completed = ev.get("completed") or 0
    total = ev.get("total") or 0
    if stage == "done":
        print(f"\n{ev.get('path') or 'Ollama ready.'}")
        return
    if stage and total:
        pct = int(completed / total * 100) if total else 0
        print(f"\r  {stage}: {pct}%", end="", flush=True)


def cmd_install(args: argparse.Namespace) -> int:
    from hermes_cli.ollama_runtime import ensure_ollama, probe_ollama_binary_version

    try:
        binary = ensure_ollama(progress_cb=_print_progress)
    except Exception as exc:  # noqa: BLE001 — surface download/extract failures to the user
        print(f"Install failed: {exc}", file=sys.stderr)
        return 1
    print(f"Ollama installed at {binary}")
    print(f"Version: {probe_ollama_binary_version(binary)}")
    print("Run `hermes local-runtime status` and start a chat to use local models.")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    from hermes_cli.ollama_runtime import runtime_status

    status = runtime_status()
    if not status.get("available"):
        print("Ollama is not installed.")
        print("Run `hermes local-runtime install` to download the managed portable package.")
        return 0

    print(f"Ollama {status.get('version') or '?'}")
    for key, label in (
        ("install_path", "Install path"),
        ("models_dir", "Models dir"),
        ("host", "Host"),
        ("port", "Port"),
        ("gpu", "GPU"),
    ):
        value = status.get(key)
        if value:
            print(f"{label}: {value}")
    print(f"Managed by Hermes: {'yes' if status.get('managed') else 'no'}")
    print(f"Running: {'yes' if status.get('running') else 'no'}")
    return 0


def cmd_update(args: argparse.Namespace) -> int:
    from hermes_cli.ollama_runtime import update_ollama

    try:
        binary = update_ollama(progress_cb=_print_progress)
    except Exception as exc:  # noqa: BLE001 — surface download/extract failures to the user
        print(f"Update failed: {exc}", file=sys.stderr)
        return 1
    print(f"Ollama updated at {binary}")
    return 0


def local_runtime_command(args: argparse.Namespace) -> int:
    return args.func(args)


def register_cli(parser: argparse.ArgumentParser) -> None:
    """Wire subcommands onto the ``hermes local-runtime`` parser."""
    parser.set_defaults(func=cmd_status)  # bare `hermes local-runtime` → status
    subs = parser.add_subparsers(dest="local_runtime_command", metavar="COMMAND")

    p_install = subs.add_parser(
        "install",
        help="Download and install the managed portable Ollama package",
    )
    p_install.set_defaults(func=cmd_install)

    p_status = subs.add_parser(
        "status",
        help="Show runtime version, paths, GPU, and run state",
    )
    p_status.set_defaults(func=cmd_status)

    p_update = subs.add_parser(
        "update",
        help="Re-download the managed Ollama package (models are kept)",
    )
    p_update.set_defaults(func=cmd_update)