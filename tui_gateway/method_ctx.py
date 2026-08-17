"""Seam for the server.py @method handler split (mechanical move).

server.py's ~130 JSON-RPC handlers close over its module globals
(``_sessions``, ``_ok``, ``_err``, config helpers, ...).  To move them
out of the 19K-line module without rewriting a single handler body,
each ``methods_*`` module defines its handlers under a local
:class:`HandlerRegistry` and server.py calls :meth:`HandlerRegistry.install`
at the end of its own import, once every global the handlers close over
exists.  ``install()`` rebinds each handler's ``__globals__`` to
server.py's namespace with ``types.FunctionType``, so handler bodies
stay byte-identical and ``global X`` statements inside handlers keep
mutating server.py state exactly as before the split.

No import cycle: ``methods_*`` modules never import server at module
level — server imports them and passes itself to ``register()``.
"""

import types


class HandlerRegistry:
    """Deferred @method registrar used by the methods_* split modules."""

    def __init__(self) -> None:
        self._pending: list[tuple[str, types.FunctionType]] = []

    def method(self, name: str):
        """Drop-in for server.py's ``@method`` decorator (defers registration)."""

        def dec(fn):
            self._pending.append((name, fn))
            return fn

        return dec

    def profile_scoped(self, fn):
        """Drop-in for server.py's ``@_profile_scoped`` (applied at install)."""
        fn._hermes_profile_scoped = True
        return fn

    def install(self, server) -> None:
        """Rebind pending handlers onto ``server``'s globals and register them."""
        g = vars(server)
        for name, fn in self._pending:
            module = fn.__globals__
            # Module-local helpers (methods_meeting.py's _int_or_none,
            # _default_seat_specs, _run_meeting, ...) live in fn's own module
            # globals and are NOT @method handlers, so install() only sees
            # them through the handler's namespace. Two reborings are needed:
            #
            # 1. Rebind the module's local functions onto server.py's
            #    namespace. They close over server globals at runtime (e.g.
            #    the meeting driver's _emit / _sessions / _make_agent),
            #    which their original module globals never contained.
            #
            # 2. Publish the module's remaining names (constants, module
            #    state) onto server.py's namespace so anything the handler
            #    touches resolves.
            #
            # Handlers and their helpers must NOT get a private copy of
            # server.py's globals instead: `global X` write-through is
            # load-bearing (paste.collapse's _paste_counter, reload.mcp's
            # _mcp_reload_* are read back from server.py's namespace).
            for helper, value in module.items():
                if (
                    type(value) is types.FunctionType
                    and value.__module__ == module.get("__name__")
                    and helper not in g
                ):
                    g[helper] = types.FunctionType(
                        value.__code__,
                        g,
                        value.__name__,
                        value.__defaults__,
                        value.__closure__,
                    )
            for helper, value in module.items():
                if helper != "__builtins__" and helper not in g:
                    g[helper] = value
            real = types.FunctionType(
                fn.__code__, g, fn.__name__, fn.__defaults__, fn.__closure__
            )
            real.__kwdefaults__ = fn.__kwdefaults__
            real.__doc__ = fn.__doc__
            real.__dict__.update(fn.__dict__)
            if getattr(fn, "_hermes_profile_scoped", False):
                real = server._profile_scoped(real)
            server._methods[name] = real
