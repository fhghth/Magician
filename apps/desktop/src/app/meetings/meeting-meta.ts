import type { Translations } from '@/i18n'
import type { MeetingBudget, MeetingStatus } from '@/store/meeting'

export type MeetingTone = 'bad' | 'done' | 'live' | 'warn'

/** Status → tinted chip tone (§7.1). Live rooms are the loud ones; waiting
 *  (created) reads as a soft variant so a rows list not shout. */
export function meetingStatusTone(status: MeetingStatus): MeetingTone {
  switch (status) {
    case 'created':
    case 'running':
      return 'live'
    case 'suspended':
    case 'converging':
      return 'warn'
    case 'closed':
      return 'done'
    default:
      return 'bad'
  }
}

export function meetingStatusLabel(t: Translations['meetings'], status: MeetingStatus): string {
  return t.status[status]
}

const SEAT_PALETTE = ['#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#8b5cf6']

/** Stable per-seat accent so the same seat keeps the same colour across the
 *  room, the transcript and the full record. Hash only: no randomness. */
export function seatColor(name: string): string {
  let h = 0

  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }

  return SEAT_PALETTE[h % SEAT_PALETTE.length]!
}

/** Round-progress bar fraction (0..1). Falls back to spent tokens when the
 *  room has no round cap; 1 when nothing is bounded. */
export function budgetBarFraction(budget: MeetingBudget): number {
  if (!budget) {
    return 1
  }

  const rounds = budget.rounds
  const tokens = budget.tokens

  if (rounds && rounds > 0) {
    return Math.min(1, budget.spentRounds / rounds)
  }

  if (tokens && tokens > 0) {
    return Math.min(1, budget.spentTokens / tokens)
  }

  return 1
}

/** Two-line clamp toggle state shared by transcript chunks and seat bubbles. */
export const CLAMP_LONG = 'line-clamp-2'
