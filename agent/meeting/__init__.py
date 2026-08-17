"""Meeting-room (roundtable) deliberation layer.

The meeting engine is a backend session-state machine (program lifetime ==
meeting lifetime). Schedules, UI projections, replay, and audit all rebuild
from the append-only ``meeting_events`` stream. The desktop app is only a
projection of this state.

See docs/design/meeting-room-dev-guide.md / meeting-room-implementation.md.
"""