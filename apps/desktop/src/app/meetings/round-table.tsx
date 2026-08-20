import * as React from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { MeetingProgress } from '@/store/meeting'

import { CLAMP_LONG, meetingStatusLabel, meetingStatusTone, seatColor } from './meeting-meta'

const TONE_CLASS: Record<string, string> = {
  live: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  warn: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  done: 'bg-muted text-muted-foreground',
  bad: 'bg-destructive/12 text-destructive'
}

/**
 * §7.6 圆桌栖息地。三档显式枚举，禁 CSS 自适应：
 * - 2–4 席：两列环绕中心议题块（环抱式）
 * - 5–7 席：三列展板式（议题块顶置）
 * - ≥8 席 / 断点横条态：横向滚动条（min-w-40 固定席卡）
 */
export function RoundTable({ meeting, strip = false }: { meeting: MeetingProgress; strip?: boolean }) {
  const { t } = useI18n()
  const m = t.meetings.room
  const seats = meeting.seats
  const tone = meetingStatusTone(meeting.status)

  if (seats.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="text-sm text-(--ui-text-secondary)">{meeting.topic || meeting.meetingId}</p>
          <p className="text-xs text-(--ui-text-tertiary)">{m.emptyTable}</p>
        </div>
      </div>
    )
  }

  const columns = seats.length >= 5 ? 3 : 2
  const stripMode = strip || seats.length > 7

  if (stripMode) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <CenterBlock meeting={meeting} tone={tone} />
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
          {seats.map((seat, idx) => (
            <SeatCard className="w-40 shrink-0" key={seat} meeting={meeting} name={seat} seq={idx} />
          ))}
        </div>
      </div>
    )
  }

  // 环绕式 / 网格式：独立议题块 + 席位围绕
  const half = Math.ceil(seats.length / 2)
  const topRow = seats.slice(0, half)
  const bottomRow = seats.slice(half)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      {seats.length >= 5 ? (
        <>
          <CenterBlock meeting={meeting} tone={tone} />
          <div className={cn('grid gap-2', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {seats.map((seat, idx) => (
              <SeatCard key={seat} meeting={meeting} name={seat} seq={idx} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
            {topRow.map((seat, idx) => (
              <SeatCard key={seat} meeting={meeting} name={seat} seq={idx} />
            ))}
          </div>
          <CenterBlock meeting={meeting} tone={tone} />
          <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
            {bottomRow.map((seat, idx) => (
              <SeatCard key={seat} meeting={meeting} name={seat} seq={half + idx} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CenterBlock({ meeting, tone }: { meeting: MeetingProgress; tone: string }) {
  const { t } = useI18n()
  const m = t.meetings.room
  const latest = meeting.turns[meeting.turns.length - 1]

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-bg-tertiary) px-4 py-3 text-center">
      <span className={cn('rounded px-1.5 py-px text-[0.625rem] font-medium', TONE_CLASS[tone])}>
        {meetingStatusLabel(t.meetings, meeting.status)}
      </span>
      <p className="line-clamp-2 max-w-md text-sm font-medium text-(--ui-text-primary)">{meeting.topic}</p>
      {latest ? (
        <p className="line-clamp-1 max-w-md text-[0.6875rem] text-(--ui-text-tertiary)">
          {m.collapsedSeat(latest.seat)} · {m.pendingTurn}
        </p>
      ) : null}
    </div>
  )
}

function SeatCard({
  className,
  meeting,
  seq,
  name
}: {
  className?: string
  meeting: MeetingProgress
  seq: number
  name: string
}) {
  const { t } = useI18n()
  const m = t.meetings.room
  const color = seatColor(name)
  const turns = meeting.turns.filter(turn => turn.seat === name)
  const latest = turns[turns.length - 1]
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div
      className={cn(
        'flex min-h-24 flex-col gap-1 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-tertiary) p-2',
        latest && 'border-emerald-500/30',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 truncate text-xs font-medium text-(--ui-text-primary)">{name}</span>
        <span className="ml-auto shrink-0 text-[0.625rem] tabular-nums text-(--ui-text-tertiary)">{turns.length}</span>
      </div>

      {latest ? (
        <>
          <button
            aria-expanded={expanded}
            className={cn(
              'rounded-sm px-1 text-left text-[0.6875rem] leading-4 text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)',
              !expanded && CLAMP_LONG
            )}
            onClick={() => setExpanded(open => !open)}
            type="button"
          >
            {latest.text}
          </button>
          {latest.tokens > 0 ? (
            <p className="px-1 text-[0.625rem] text-(--ui-text-tertiary)">{m.seatThinking(latest.tokens)}</p>
          ) : null}
        </>
      ) : (
        <p className="px-1 text-[0.625rem] text-(--ui-text-quaternary)">{m.waitingTurn}</p>
      )}
    </div>
  )
}
