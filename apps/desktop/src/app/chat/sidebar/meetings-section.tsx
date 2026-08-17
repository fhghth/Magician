import { useStore } from '@nanostores/react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'

import { Codicon } from '@/components/ui/codicon'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { allMeetings, type MeetingWithSession, openMeetingDraft, $meetingsBySession } from '@/store/meeting'
import { $sessions } from '@/store/session'

import { meetingRoute, MEETING_ROUTE, navigateToWorkspacePage } from '../../routes'
import { budgetBarFraction, meetingStatusLabel, meetingStatusTone } from '../../meetings/meeting-meta'

export const SIDEBAR_MEETING_TONE_CLASS: Record<string, string> = {
  live: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  warn: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  done: 'bg-muted text-muted-foreground',
  bad: 'bg-destructive/12 text-destructive'
}

/** §7.1 会议分区：会议列表项 + 状态chip/预算细条/来源对话 + 新建入口。
 *  全部会议跨会话聚合（$meetingsBySession 的扁平视图）。 */
export function MeetingSidebarSection() {
  const { t } = useI18n()
  const m = t.meetings
  const navigate = useNavigate()
  const meetings = useStore($meetingsBySession)

  const bySession = useStore($meetingsBySession)
  const rows = useMemo(() => allMeetings(), [bySession])
  const sessions = useStore($sessions)

  const sourceLabel = (row: MeetingWithSession) => {
    if (row.meeting.standalone) {
      return m.standalone
    }

    const session = sessions.find(s => s.id === row.sessionId)

    return session?.title || (session ? `#${row.sessionId.slice(0, 8)}` : row.sessionId.slice(0, 8))
  }

  const openRoom = (row: MeetingWithSession) => navigateToWorkspacePage(navigate, meetingRoute(row.meeting.meetingId))

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1 pt-2">
      <SidebarGroupContent>
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="px-1 text-[0.6875rem] font-medium tracking-wide text-(--ui-text-tertiary) uppercase">
            {m.sectionTitle}
          </span>
          <Tip label={m.create}>
            <button
              aria-label={m.create}
              className="grid size-5 place-items-center rounded-sm text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={() => {
                openMeetingDraft()
                navigate(MEETING_ROUTE)
              }}
              type="button"
            >
              <Codicon name="add" size="0.8125rem" />
            </button>
          </Tip>
        </div>

        {rows.length === 0 ? (
          <div className="flex min-h-14 flex-col items-start justify-center gap-1 rounded-md px-2 py-2">
            <span className="text-xs text-(--ui-text-tertiary)">{m.noMeetings}</span>
            <button
              className="text-xs text-(--ui-text-secondary) underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                openMeetingDraft()
                navigate(MEETING_ROUTE)
              }}
              type="button"
            >
              {m.create}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-px">
            {rows.map(row => (
              <MeetingRow
                key={row.meeting.meetingId}
                onOpen={() => openRoom(row)}
                row={row}
                sourceLabel={sourceLabel(row)}
              />
            ))}
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function MeetingRow({
  onOpen,
  row,
  sourceLabel
}: {
  onOpen: () => void
  row: MeetingWithSession
  sourceLabel: string
}) {
  const { t } = useI18n()
  const m = t.meetings
  const { meeting } = row
  const tone = meetingStatusTone(meeting.status)
  const fraction = budgetBarFraction(meeting.budget)

  return (
    <Tip label={meeting.topic || meeting.meetingId}>
      <button
        aria-label={meeting.topic || meeting.meetingId}
        className="flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-(--ui-control-hover-background) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={onOpen}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              tone === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-(--ui-text-quaternary)'
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-[0.8125rem] text-(--ui-text-secondary) group-hover/meeting:text-foreground">
            {meeting.topic || meeting.meetingId}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 pl-3 text-[0.6875rem] text-(--ui-text-tertiary)">
          <span className={cn('shrink-0 rounded px-1 py-px', SIDEBAR_MEETING_TONE_CLASS[tone])}>
            {meetingStatusLabel(m, meeting.status)}
          </span>
          <span className="truncate">{m.from(sourceLabel)}</span>
          <span className="ml-auto flex w-12 shrink-0 items-center gap-1">
            <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-(--ui-stroke-quaternary)">
              <span
                className={cn(
                  'block h-full rounded-full',
                  tone === 'done' ? 'bg-(--ui-text-quaternary)' : 'bg-emerald-500/70'
                )}
                style={{ width: `${Math.round(fraction * 100)}%` }}
              />
            </span>
          </span>
        </span>
      </button>
    </Tip>
  )
}
