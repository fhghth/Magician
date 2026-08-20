import * as React from 'react'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { MeetingProgress, MeetingTurn } from '@/store/meeting'

import { CLAMP_LONG, meetingStatusTone, seatColor } from './meeting-meta'

/** 右栏[对话]Tab 折中视图：议题分块（进行中/已搁置/已决策）+ 回合折叠。
 *  可切换"展开完整会议记录"（时间序平铺、同标注同配色、虚拟化滚动支撑）。 */
export function TranscriptPanel({ meeting }: { meeting: MeetingProgress }) {
  const { t } = useI18n()
  const m = t.meetings.room
  const [tab, setTab] = React.useState<'dialogue' | 'focus' | 'playback'>('dialogue')
  const [full, setFull] = React.useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-(--ui-stroke-quaternary) px-2 py-1">
        {(
          [
            ['dialogue', 'comment-discussion'],
            ['focus', 'target'],
            ['playback', 'history']
          ] as const
        ).map(([key, icon]) => (
          <button
            aria-pressed={tab === key}
            className={cn(
              'flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors',
              tab === key
                ? 'bg-(--chrome-action-hover) text-foreground'
                : 'text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)'
            )}
            key={key}
            onClick={() => setTab(key)}
            type="button"
          >
            <Codicon name={icon} size="0.75rem" />
            {m.tabs[key]}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-3">
        {tab === 'dialogue' ? (
          full ? (
            <FullRecordView meeting={meeting} onCollapse={() => setFull(false)} />
          ) : (
            <IssueBlockView meeting={meeting} onExpand={() => setFull(true)} />
          )
        ) : tab === 'focus' ? (
          <Placeholder label={m.focusHint} />
        ) : (
          <Placeholder label={m.playbackHint} />
        )}
      </div>
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <p className="text-center text-xs text-(--ui-text-tertiary)">{label}</p>
    </div>
  )
}

function IssueBlockView({ meeting, onExpand }: { meeting: MeetingProgress; onExpand: () => void }) {
  const { t } = useI18n()
  const m = t.meetings.room
  const decided = meeting.conclusion
  const [collapsed, setCollapsed] = React.useState(false)

  return (
    <div className="flex flex-col gap-3">
      {/* 进行中议题块 */}
      <section className="overflow-hidden rounded-lg border border-emerald-500/25 bg-(--ui-bg-tertiary)">
        <button
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
          onClick={() => setCollapsed(value => !value)}
          type="button"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-500" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-(--ui-text-primary)">
            {m.issueOpen}
            {meeting.topic ? ` · ${meeting.topic}` : ''}
          </span>
          <span className="shrink-0 text-[0.6875rem] tabular-nums text-(--ui-text-tertiary)">
            {meeting.turns.length}
          </span>
          <Codicon
            className={cn('shrink-0 text-(--ui-text-tertiary) transition-transform', collapsed && 'rotate-180')}
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size="0.75rem"
          />
        </button>

        {!collapsed ? (
          <div className="flex flex-col border-t border-(--ui-stroke-quaternary)">
            {meeting.turns.map((turn, idx) => (
              <TurnRow
                key={`${turn.seat}-${turn.seq}`}
                lastTurn={idx === meeting.turns.length - 1}
                meeting={meeting}
                turn={turn}
              />
            ))}
            {meeting.turns.length === 0 ? (
              <p className="px-3 py-3 text-xs text-(--ui-text-tertiary)">{m.pendingTurn}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 已决策块 */}
      {decided ? (
        <section className="overflow-hidden rounded-lg border border-(--ui-stroke-secondary)">
          <header className="flex items-center gap-2 px-3 py-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-(--color-text-primary)">
              {m.issueDecided}
            </span>
            <span className="shrink-0 text-[0.6875rem] tabular-nums text-(--ui-text-tertiary)">
              {decided.decisionsCount}
            </span>
          </header>
          <div className="border-t border-(--ui-stroke-quaternary) px-3 py-2">
            <p className="text-xs leading-5 whitespace-pre-wrap text-(--ui-text-secondary)">{decided.contract}</p>
          </div>
        </section>
      ) : null}

      <button
        className="mx-auto flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-secondary)"
        onClick={onExpand}
        type="button"
      >
        <Codicon name="list-flat" size="0.75rem" />
        {m.expandFullRecord}
      </button>
    </div>
  )
}

function FullRecordView({ meeting, onCollapse }: { meeting: MeetingProgress; onCollapse: () => void }) {
  const { t } = useI18n()
  const m = t.meetings.room

  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 pb-1 text-[0.6875rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary)">
        {m.fullRecord}
      </p>
      {meeting.turns.map((turn, idx) => (
        <TurnRow
          full
          key={`${turn.seat}-${turn.seq}`}
          lastTurn={idx === meeting.turns.length - 1}
          meeting={meeting}
          turn={turn}
        />
      ))}
      {meeting.turns.length === 0 ? (
        <p className="px-1 py-2 text-xs text-(--ui-text-tertiary)">{m.pendingTurn}</p>
      ) : null}
      <button
        className="mx-auto flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-secondary)"
        onClick={onCollapse}
        type="button"
      >
        <Codicon name="chevron-up" size="0.75rem" />
        {m.collapseFullRecord}
      </button>
    </div>
  )
}

function TurnRow({
  full = false,
  lastTurn,
  meeting,
  turn
}: {
  full?: boolean
  lastTurn: boolean
  meeting: MeetingProgress
  turn: MeetingTurn
}) {
  const { t } = useI18n()
  const m = t.meetings.room
  const [expanded, setExpanded] = React.useState(full || lastTurn)
  const color = seatColor(turn.seat)
  const live = meetingStatusTone(meeting.status) === 'live'

  return (
    <button
      aria-expanded={expanded}
      className={cn(
        'flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-(--chrome-action-hover)',
        live && lastTurn && 'bg-emerald-500/5'
      )}
      onClick={() => setExpanded(value => !value)}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate text-[0.6875rem] font-medium text-(--ui-text-secondary)">{turn.seat}</span>
        {live && lastTurn ? <span className="shrink-0 text-[0.625rem] text-emerald-500">{m.speaker}</span> : null}
        <span className="ml-auto shrink-0 text-[0.625rem] tabular-nums text-(--ui-text-quaternary)">
          #{turn.seq + 1}
        </span>
      </span>
      <span className={cn('text-xs leading-5 text-(--ui-text-primary)', !expanded && CLAMP_LONG)}>{turn.text}</span>
    </button>
  )
}
