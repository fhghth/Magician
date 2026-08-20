import { useStore } from '@nanostores/react'
import * as React from 'react'
import { useNavigate } from 'react-router'

import type { GatewayRequester } from '@/app/contrib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $meetingDraftOpen, closeMeetingDraft } from '@/store/meeting'
import { $meetingPresets } from '@/store/meeting-presets'
import { $sessions } from '@/store/session'
import type { SessionInfo } from '@/types/hermes'

import { meetingRoute } from '../routes'

interface MeetingCreateResponse {
  error?: string
  meeting_id?: string
  origin_sid?: string
  standalone?: boolean
}

export const MEETING_ROLES = ['facilitator', 'advocate', 'critic', 'expert', 'observer'] as const
export type MeetingRole = (typeof MEETING_ROLES)[number]

interface DraftSeat {
  name: string
  objective: string
  role: MeetingRole
}

const sessionLabel = (session: SessionInfo) => session.title || `#${session.id.slice(0, 8)}`

const capInt = (value: string): number | null => {
  const n = Number(value)

  return value && Number.isFinite(n) && n > 0 ? n : null
}

/** 将模板里的自由文本角色映射到席位角色枚举；匹配不到时回落为 expert
 *  （与"添加空席位"的默认角色一致）。 */
const mapPresetRole = (role: string): MeetingRole => {
  const hit = MEETING_ROLES.find(r => r === role.trim().toLowerCase())

  return hit ?? 'expert'
}

/** §7.7 新建会议配置（一次性模态）：议题/模式/席位（姓名+角色+目标）/预算
 *  三顶/来源对话。人物模板（§7.8 setting → meeting:presets:）可一键追加
 *  一个已填好姓名/角色/目标的席位。每席模型透传属 M1.1 后端阶段，此面板
 *  先提示默认继承会话模型。确定后调 `meeting.create` 并进入独立会议模式。 */
export function NewMeetingDialog({ requestGateway }: { requestGateway: GatewayRequester }) {
  const { t } = useI18n()
  const m = t.meetings
  const open = useStore($meetingDraftOpen)
  const navigate = useNavigate()

  const sessions = useStore($sessions)
  const presets = useStore($meetingPresets)

  const recentSessions = React.useMemo(
    () => [...sessions].sort((a, b) => (b.last_active ?? 0) - (a.last_active ?? 0)).slice(0, 12),
    [sessions]
  )

  const [sessionId, setSessionId] = React.useState('')
  const [presetId, setPresetId] = React.useState('')
  const [topic, setTopic] = React.useState('')
  const [mode, setMode] = React.useState<'light' | 'full'>('light')
  const [budgetRounds, setBudgetRounds] = React.useState('')
  const [budgetSeconds, setBudgetSeconds] = React.useState('')
  const [budgetTokens, setBudgetTokens] = React.useState('')

  const [seats, setSeats] = React.useState<DraftSeat[]>([
    { name: '', objective: '', role: 'facilitator' },
    { name: '', objective: '', role: 'advocate' },
    { name: '', objective: '', role: 'critic' }
  ])

  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  const canCreate = !submitting && Boolean(topic.trim()) && seats.length > 0

  const applyPreset = () => {
    const preset = presets.find(p => p.id === presetId)

    if (!preset) {
      return
    }

    setSeats(prev => [...prev, { name: preset.name, objective: preset.objective, role: mapPresetRole(preset.role) }])
  }

  const close = () => {
    if (!submitting) {
      closeMeetingDraft()
      setError('')
    }
  }

  const start = async () => {
    if (!canCreate) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const result = await requestGateway<MeetingCreateResponse>('meeting.create', {
        budget_rounds: capInt(budgetRounds),
        budget_seconds: capInt(budgetSeconds),
        budget_tokens: capInt(budgetTokens),
        mode,
        seats: seats.map((seat, idx) => ({
          name: seat.name.trim() || `${m.roles[seat.role]}${seats.length > 1 ? ` ${idx + 1}` : ''}`,
          objective: seat.objective.trim(),
          role: seat.role
        })),
        session_id: sessionId,
        // A cross-profile pick (app-global remote mode) must resolve against
        // that profile's state.db, not the launch profile's.
        profile: sessions.find(s => s.id === sessionId)?.profile || '',
        topic: topic.trim()
      })

      if (!result?.meeting_id) {
        setError(result?.error || m.draft.createFailed)

        return
      }

      closeMeetingDraft()
      navigate(meetingRoute(result.meeting_id))
    } catch (err) {
      setError(err instanceof Error ? err.message : m.draft.createFailed)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <Dialog
      onOpenChange={next => {
        if (!next) {
          close()
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.draft.title}</DialogTitle>
          <DialogDescription>{m.draft.description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={e => {
            e.preventDefault()
            void start()
          }}
        >
          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-1.5">
            <span className="text-sm text-(--ui-text-secondary)">{m.draft.topicLabel}</span>
            <Input
              autoFocus
              onChange={e => setTopic(e.target.value)}
              placeholder={m.draft.topicPlaceholder}
              value={topic}
            />

            <span className="text-sm text-(--ui-text-secondary)">{m.draft.modeLabel}</span>
            <div className="flex gap-1.5" role="radiogroup">
              {(['light', 'full'] as const).map(key => (
                <button
                  aria-checked={mode === key}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                    mode === key
                      ? 'border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground'
                      : 'border-transparent text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
                  )}
                  key={key}
                  onClick={() => setMode(key)}
                  role="radio"
                  type="button"
                >
                  {key === 'light' ? m.draft.modeLight : m.draft.modeFull}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-(--ui-text-secondary)">{m.draft.seatsLabel}</span>
              <Button
                className="h-6 gap-1 px-2 text-xs"
                onClick={() => setSeats(prev => [...prev, { name: '', objective: '', role: 'expert' }])}
                type="button"
                variant="outline"
              >
                {m.draft.addSeat}
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="w-14 shrink-0 text-xs font-medium text-(--ui-text-secondary)">
                {m.draft.presetLabel}
              </span>
              <select
                aria-label={m.draft.presetLabel}
                className="min-w-0 flex-1 rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1.5 text-xs"
                onChange={e => setPresetId(e.target.value)}
                value={presetId}
              >
                {presets.length === 0 ? (
                  <option value="">{m.draft.presetEmpty}</option>
                ) : (
                  <>
                    <option value="">{m.draft.presetPlaceholder}</option>
                    {presets.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <Button
                className="h-6 px-2 text-xs"
                disabled={!presetId}
                onClick={applyPreset}
                type="button"
                variant="outline"
              >
                {m.draft.presetAdd}
              </Button>
            </div>

            <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_7.5rem_minmax(0,1.2fr)] gap-1.5">
              {seats.map((seat, idx) => (
                <React.Fragment key={idx}>
                  <Input
                    aria-label={m.draft.nameRow}
                    onChange={e =>
                      setSeats(prev => prev.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s)))
                    }
                    placeholder={m.draft.nameRow}
                    value={seat.name}
                  />
                  <Input
                    aria-label={m.draft.objectiveLabel}
                    onChange={e =>
                      setSeats(prev => prev.map((s, i) => (i === idx ? { ...s, objective: e.target.value } : s)))
                    }
                    placeholder={m.draft.objectiveLabel}
                    value={seat.objective}
                  />
                  <select
                    aria-label={m.draft.roleLabel}
                    className="rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1.5 text-xs"
                    onChange={e =>
                      setSeats(prev =>
                        prev.map((s, i) => (i === idx ? { ...s, role: e.target.value as MeetingRole } : s))
                      )
                    }
                    value={seat.role}
                  >
                    {MEETING_ROLES.map(role => (
                      <option key={role} value={role}>
                        {m.roles[role]}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label={m.draft.removeSeat}
                    className="grid h-7 place-items-center rounded-md text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground disabled:opacity-40"
                    disabled={seats.length <= 2}
                    onClick={() => setSeats(prev => prev.filter((_, i) => i !== idx))}
                    type="button"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </React.Fragment>
              ))}
            </div>

            <p className="text-xs text-(--ui-text-tertiary)">{m.draft.modelLegacyHint}</p>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-14 shrink-0 text-sm text-(--ui-text-secondary)">{m.draft.budgetLabel}</span>
            <Input
              aria-label={m.budget.roundsLabel}
              className="w-24 px-2"
              min="1"
              onChange={e => setBudgetRounds(e.target.value)}
              placeholder={m.draft.unbounded}
              type="number"
              value={budgetRounds}
            />
            <Input
              aria-label={m.budget.secondsLabel}
              className="w-24 px-2"
              min="1"
              onChange={e => setBudgetSeconds(e.target.value)}
              placeholder={m.draft.unbounded}
              type="number"
              value={budgetSeconds}
            />
            <Input
              aria-label={m.budget.tokensLabel}
              className="w-24 px-2"
              min="1"
              onChange={e => setBudgetTokens(e.target.value)}
              placeholder={m.draft.unbounded}
              type="number"
              value={budgetTokens}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-14 shrink-0 text-sm text-(--ui-text-secondary)">{m.draft.sourceLabel}</span>
            <select
              aria-label={m.draft.sourceLabel}
              className="min-w-0 flex-1 rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1.5 text-xs"
              onChange={e => setSessionId(e.target.value)}
              value={sessionId}
            >
              {recentSessions.length === 0 ? (
                <option value="">{m.draft.sourceEmpty}</option>
              ) : (
                <>
                  <option value="">{m.draft.sourceNone}</option>
                  {recentSessions.map(session => (
                    <option key={session.id} value={session.id}>
                      {sessionLabel(session)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>

        <DialogFooter>
          <Button disabled={submitting} onClick={close} variant="ghost">
            {t.common.cancel}
          </Button>
          <Button disabled={!canCreate} onClick={() => void start()}>
            {submitting ? m.draft.creating : m.draft.createButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
