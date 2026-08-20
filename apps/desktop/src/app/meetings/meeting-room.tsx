import * as React from 'react'
import { useNavigate } from 'react-router'

import type { GatewayRequester } from '@/app/contrib/types'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { findMeetingById } from '@/store/meeting'

import { MEETING_ROUTE, navigateToWorkspacePage, sessionRoute } from '../routes'

import { MeetingComposer, MeetingQueueStrip } from './meeting-composer'
import { budgetBarFraction, meetingStatusLabel, meetingStatusTone } from './meeting-meta'
import { RoundTable } from './round-table'
import { TranscriptPanel } from './transcript-panel'

const CONTROLS_UNAVAILABLE = 'M1.1'

/**
 * §7.4 独立会议房：头部条 + 圆桌栖息地 + 右栏（对话/焦点/回放）。
 * 断点（§7.6）：<1280px（63.99rem）右栏收抽屉浮层，<1024px 圆桌退横条。
 * M1.1 前头部控制键为禁用占位，仅返回可用。
 */
export function MeetingRoom({ meetingId, requestGateway }: { meetingId: string; requestGateway: GatewayRequester }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const row = findMeetingById(meetingId)
  const narrow = useMediaQuery('(max-width: 63.99rem)')
  const [panelOpen, setPanelOpen] = React.useState(!narrow)

  React.useEffect(() => {
    setPanelOpen(!narrow)
  }, [narrow])

  if (!row) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-sm text-(--ui-text-secondary)">{t.meetings.emptyTitle}</p>
          <Button onClick={() => navigate(-1)} size="sm" variant="outline">
            {t.common.back}
          </Button>
        </div>
      </div>
    )
  }

  const { meeting } = row

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-(--ui-bg-primary)">
      <MeetingHeaderBar
        meetingId={meeting.meetingId}
        onBack={() =>
          navigateToWorkspacePage(navigate, meeting.standalone ? MEETING_ROUTE : sessionRoute(row.sessionId))
        }
        onTogglePanel={() => setPanelOpen(open => !open)}
        panelOpen={panelOpen}
        showPanelToggle={narrow}
      />

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <RoundTable meeting={meeting} strip={narrow} />
        </main>

        {narrow && panelOpen ? (
          <div className="absolute inset-x-0 top-0 z-20 flex h-full flex-col bg-(--ui-bg) shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-(--ui-stroke-quaternary) px-3 py-2">
              <span className="text-xs font-medium">{t.meetings.room.tabs.dialogue}</span>
              <button
                aria-label={t.common.close}
                className="grid size-6 place-items-center rounded-sm text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)"
                onClick={() => setPanelOpen(false)}
                type="button"
              >
                <Codicon name="close" size="0.75rem" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <TranscriptPanel meeting={meeting} />
            </div>
            <MeetingQueueStrip meeting={meeting} />
            <MeetingComposer meeting={meeting} requestGateway={requestGateway} />
          </div>
        ) : narrow ? null : (
          <aside className="flex w-80 shrink-0 flex-col border-l border-(--ui-stroke-quaternary) bg-(--ui-bg-tertiary)">
            <div className="min-h-0 flex-1">
              <TranscriptPanel meeting={meeting} />
            </div>
            <MeetingQueueStrip meeting={meeting} />
            <MeetingComposer meeting={meeting} requestGateway={requestGateway} />
          </aside>
        )}
      </div>
    </div>
  )
}

interface MeetingHeaderBarProps {
  meetingId: string
  onBack: () => void
  onTogglePanel: () => void
  panelOpen: boolean
  showPanelToggle: boolean
}

function MeetingHeaderBar({ meetingId, onBack, onTogglePanel, panelOpen, showPanelToggle }: MeetingHeaderBarProps) {
  const { t } = useI18n()
  const m = t.meetings.room
  const row = findMeetingById(meetingId)

  if (!row) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-(--ui-stroke-quaternary) px-3">
        <Button aria-label={t.common.back} onClick={onBack} size="icon-xs" variant="ghost">
          <Codicon name="chevron-left" />
        </Button>
      </div>
    )
  }

  const { meeting } = row
  const tone = meetingStatusTone(meeting.status)
  const fraction = budgetBarFraction(meeting.budget)
  const last = meeting.turns[meeting.turns.length - 1]

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-(--ui-stroke-quaternary) px-3">
      <Button
        aria-label={t.common.back}
        className="text-(--ui-text-tertiary)"
        onClick={onBack}
        size="icon-xs"
        variant="ghost"
      >
        <Codicon name="chevron-left" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="min-w-0 truncate text-sm font-medium text-foreground">{meeting.topic || meeting.meetingId}</h1>
        <HeaderChip tone={tone}>{meetingStatusLabel(t.meetings, meeting.status)}</HeaderChip>
        <span className="hidden shrink-0 items-center gap-1.5 md:flex">
          <span className="h-1 w-14 overflow-hidden rounded-full bg-(--ui-stroke-quaternary)">
            <span
              className={cn(
                'block h-full rounded-full',
                tone === 'live' ? 'bg-emerald-500/70' : 'bg-(--ui-text-quaternary)'
              )}
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </span>
          <span className="text-[0.6875rem] tabular-nums text-(--ui-text-tertiary)">
            {t.meetings.roundsSpent(meeting.budget.spentRounds, meeting.budget.rounds ?? 0)}
          </span>
        </span>
      </div>

      {last ? (
        <span className="hidden min-w-0 items-center gap-1.5 lg:flex">
          <span className="shrink-0 text-xs font-medium text-(--ui-text-secondary)">{m.speaker}</span>
          <span className="max-w-40 truncate text-xs text-(--ui-text-tertiary)">{last.seat}</span>
        </span>
      ) : null}

      {showPanelToggle ? (
        <Button
          aria-label={m.tabs.dialogue}
          className="text-(--ui-text-tertiary)"
          onClick={onTogglePanel}
          size="icon-xs"
          title={panelOpen ? m.collapseFullRecord : m.expandFullRecord}
          variant="ghost"
        >
          <Codicon name="comment-discussion" />
        </Button>
      ) : null}

      <span className="flex shrink-0 items-center gap-0.5">
        <HeaderControl disabled icon="debug-pause" label={m.pause} />
        <HeaderControl disabled icon="debug-continue" label={m.resume} />
        <HeaderControl disabled icon="debug-step-over" label={m.takeover} />
        <HeaderControl disabled icon="circle-slash" label={m.veto} />
        <HeaderControl disabled icon="microphone" label={m.monologue} />
        <HeaderControl disabled icon="debug-stop" label={m.end} />
      </span>
    </div>
  )
}

function HeaderChip({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-px text-[0.6875rem] font-medium',
        tone === 'live' && 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
        tone === 'warn' && 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
        tone === 'done' && 'bg-muted text-muted-foreground',
        tone === 'bad' && 'bg-destructive/12 text-destructive'
      )}
    >
      {children}
    </span>
  )
}

function HeaderControl({ disabled, icon, label }: { disabled?: boolean; icon: string; label: string }) {
  return (
    <Tip label={label}>
      <Button
        aria-label={label}
        className="text-(--ui-text-tertiary)"
        disabled={disabled}
        size="icon-xs"
        title={disabled ? CONTROLS_UNAVAILABLE : undefined}
        variant="ghost"
      >
        <Codicon name={icon} />
      </Button>
    </Tip>
  )
}
