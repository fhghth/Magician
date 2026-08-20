import { atom } from 'nanostores'

export type MeetingStatus = 'aborted' | 'closed' | 'converging' | 'created' | 'interrupted' | 'running' | 'suspended'

export interface MeetingTurn {
  seat: string
  seq: number
  tokens: number
  text: string
}

export interface MeetingBudget {
  rounds: number | null
  seconds: number | null
  tokens: number | null
  spentRounds: number
  spentTokens: number
}

export interface MeetingConclusion {
  openItems: number
  decisionsCount: number
  turns: number
  tokens: number
  contract: string
}

export interface MeetingProgress {
  meetingId: string
  status: MeetingStatus
  topic: string
  originRef: null | string
  /** True when the room has no origin conversation (started without a source
   *  chat). Such rooms are stamped with a synthetic ``meeting:<id>`` key and
   *  get a standalone label in the sidebar instead of a source chat name. */
  standalone: boolean
  mode: string
  /** Roster order from `meeting.started`. */
  seats: string[]
  /** Read-only turn stream, rebuilt from `meeting.turn.complete`. */
  turns: MeetingTurn[]
  budget: MeetingBudget
  /** Convergence trigger (e.g. "budget:rounds", "max_rounds"). */
  convergeReason?: string
  conclusion?: MeetingConclusion
  updatedAt: number
}

const TERMINAL: ReadonlySet<MeetingStatus> = new Set(['closed', 'aborted', 'interrupted'])

export const $meetingsBySession = atom<Record<string, MeetingProgress[]>>({})

/** 一次性新建会议配置模态（§7.7）是否打开。窗口内演示态：同时只能有一个
 *  草稿，所以是普通布尔原子而非 keyed map。 */
export const $meetingDraftOpen = atom(false)

export function openMeetingDraft() {
  $meetingDraftOpen.set(true)
}

export function closeMeetingDraft() {
  $meetingDraftOpen.set(false)
}

/** A meeting plus the session it lives in (the origin session). */
export interface MeetingWithSession {
  meeting: MeetingProgress
  sessionId: string
}

/**
 * Flat aggregate of every known meeting across all sessions, sorted for the
 * sidebar (§7.1): live/waiting rooms first, then by newest activity. Terminal
 * meetings sink to the bottom.
 */
export function allMeetings(source: Record<string, MeetingProgress[]> = $meetingsBySession.get()): MeetingWithSession[] {
  const out: MeetingWithSession[] = []

  for (const [sid, list] of Object.entries(source)) {
    for (const meeting of list) {
      out.push({ meeting, sessionId: sid })
    }
  }

  return out.sort((a, b) => {
    const aLive = !TERMINAL.has(a.meeting.status) ? 1 : 0
    const bLive = !TERMINAL.has(b.meeting.status) ? 1 : 0

    if (aLive !== bLive) {
      return bLive - aLive
    }

    return b.meeting.updatedAt - a.meeting.updatedAt
  })
}

/** Locate a meeting by id across every mirrored session, newest first. */
export function findMeetingById(meetingId: string): MeetingWithSession | null {
  const found = allMeetings().find(row => row.meeting.meetingId === meetingId)

  return found ?? null
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const str = (v: unknown) => (isStr(v) ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : [])

const asMeetingStatus = (v: unknown, fallback: MeetingStatus): MeetingStatus => {
  switch (v) {
    case 'created':
    case 'running':
    case 'suspended':
    case 'converging':
    case 'closed':
    case 'aborted':
    case 'interrupted':
      return v
    default:
      return fallback
  }
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/**
 * Budget projection from the scheduler's `meeting.budget.update` payload.
 * The scheduler emits the remaining amounts under `remaining`
 * ({rounds, seconds, tokens, spent_rounds, spent_tokens}); tolerate a flat
 * payload for resilient older/newer backends.
 */
function budgetFromPayload(payload: Record<string, unknown>): MeetingBudget {
  const remaining = asRecord(payload.remaining)
  const spentRounds = num(remaining.spent_rounds ?? payload.spent_rounds)
  const spentTokens = num(remaining.spent_tokens ?? payload.spent_tokens)

  return {
    rounds: optNum(remaining.rounds ?? payload.budget_rounds),
    seconds: optNum(remaining.seconds ?? payload.budget_seconds),
    tokens: optNum(remaining.tokens ?? payload.budget_tokens),
    spentRounds,
    spentTokens
  }
}

function conclusionFromPayload(payload: Record<string, unknown>): MeetingConclusion {
  const stats = asRecord(payload.stats)

  return {
    openItems: num(payload.open_items ?? payload.openItems),
    decisionsCount: num(payload.decisions_count ?? payload.decisionsCount),
    turns: num(stats.turns),
    tokens: num(stats.tokens),
    contract: str(payload.contract)
  }
}

function upsertMeeting(sid: string, meeting: MeetingProgress) {
  const map = $meetingsBySession.get()
  const list = map[sid] ?? []
  const idx = list.findIndex(item => item.meetingId === meeting.meetingId)

  if (idx < 0) {
    $meetingsBySession.set({ ...map, [sid]: [...list, meeting] })
    return
  }

  const prev = list[idx]!

  // A terminal meeting is the durable record the UI closes on; later straggler
  // status events must not unwind a delivered conclusion. No-op once terminal.
  if (TERMINAL.has(prev.status)) {
    return
  }

  const nextList = list.map(item => (item.meetingId === meeting.meetingId ? meeting : item))
  $meetingsBySession.set({ ...map, [sid]: nextList })
}

/**
 * Project one desktop-relevant `meeting.*` gateway event onto the per-session
 * meeting store. The backend append-only event stream is authoritative; this
 * mirror exists only to render the room — status, roster, a read-only turn
 * stream, and the budget table.
 *
 * Handled: meeting.started · meeting.turn.complete · meeting.budget.update ·
 * meeting.converging · meeting.conclusion (meeting.minutes is a no-op: the
 * minutes mirror the turn stream; the conclusion card carries the summary).
 */
export function applyMeetingEvent(sid: string, eventType: string, payload: Record<string, unknown>) {
  const meetingId = str(payload.meeting_id)

  if (!meetingId) {
    return
  }

  const map = $meetingsBySession.get()
  const list = map[sid] ?? []
  const prev = list.find(item => item.meetingId === meetingId)
  const now = Date.now()
  const base: MeetingProgress = prev ?? {
    meetingId,
    status: 'created',
    topic: '',
    originRef: null,
    standalone: false,
    seats: [],
    turns: [],
    budget: { rounds: null, seconds: null, tokens: null, spentRounds: 0, spentTokens: 0 },
    mode: 'light',
    updatedAt: now
  }

  if (eventType === 'meeting.started') {
    const seats = strList(payload.seats)
    const originRef = str(payload.origin_ref) || base.originRef
    upsertMeeting(sid, {
      ...base,
      status: asMeetingStatus(payload.status, 'running'),
      topic: str(payload.topic) || base.topic,
      originRef,
      // A room whose started frame carries no origin thread has no source
      // conversation — the backend stamps it with a synthetic meeting:<id>.
      standalone: base.standalone || !originRef,
      mode: str(payload.mode) || base.mode,
      seats: seats.length ? seats : base.seats,
      updatedAt: now
    })
    return
  }

  if (eventType === 'meeting.budget.update') {
    upsertMeeting(sid, { ...base, budget: budgetFromPayload(payload), updatedAt: now })
    return
  }

  if (eventType === 'meeting.turn.complete') {
    const seat = str(payload.seat)
    const turn: MeetingTurn = { seat, seq: num(payload.seq), tokens: num(payload.tokens), text: str(payload.text) }
    const turns = base.turns.some(t => t.seat === seat && t.seq === turn.seq) ? base.turns : [...base.turns, turn]
    const seats = [...new Set([...base.seats, seat])].filter(Boolean)
    upsertMeeting(sid, { ...base, turns, seats, status: 'running', updatedAt: now })
    return
  }

  if (eventType === 'meeting.converging') {
    upsertMeeting(sid, {
      ...base,
      status: 'converging',
      convergeReason: str(payload.reason) || base.convergeReason,
      updatedAt: now
    })
    return
  }

  if (eventType === 'meeting.minutes') {
    return
  }

  if (eventType === 'meeting.conclusion') {
    const conclusion = conclusionFromPayload(payload)
    upsertMeeting(sid, {
      ...base,
      status: 'closed',
      topic: str(payload.topic) || base.topic,
      conclusion,
      updatedAt: now
    })
  }
}

export function clearSessionMeetings(sid: string) {
  const map = $meetingsBySession.get()

  if (!(sid in map)) {
    return
  }

  const { [sid]: _drop, ...rest } = map
  $meetingsBySession.set(rest)
}

/** Meetings visible for a session, newest activity first. */
export function sessionMeetings(sid: string): MeetingProgress[] {
  return [...(($meetingsBySession.get()[sid] ?? []) as MeetingProgress[])].sort((a, b) => b.updatedAt - a.updatedAt)
}

export const activeMeetingCount = (items: readonly MeetingProgress[]) =>
  items.filter(item => !TERMINAL.has(item.status)).length
