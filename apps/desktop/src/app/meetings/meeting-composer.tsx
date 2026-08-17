import * as React from 'react'

import type { GatewayRequester } from '@/app/contrib/types'
import { Codicon } from '@/components/ui/codicon'
import { isMissingRpcMethod } from '@/lib/gateway-rpc'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { MeetingProgress } from '@/store/meeting'

import { seatColor } from './meeting-meta'
const TERMINAL: ReadonlySet<MeetingProgress['status']> = new Set(['closed', 'aborted', 'interrupted'])

/**
 * §7.2 会议输入语义：提示语为"插话/旁听者语气"，四个快速标记前缀
 * （同意/追问/关键点/否决），Enter 直接发送 meeting.interject。
 * 假数据阶段：事件类型缺失（旧后端）时提示"该后端不支持"而非崩溃。
 */
export function MeetingComposer({
  meeting,
  requestGateway
}: {
  meeting: MeetingProgress
  requestGateway: GatewayRequester
}) {
  const { t } = useI18n()
  const m = t.meetings.composer
  const [text, setText] = React.useState('')
  const [note, setNote] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const terminal = TERMINAL.has(meeting.status)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)

  const send = async (textToSend: string) => {
    const value = textToSend.trim()

    if (!value || terminal) {
      return
    }

    setSending(true)
    setNote('')

    try {
      await requestGateway('meeting.interject', {
        meeting_id: meeting.meetingId,
        text: value
      })
      setText('')
      inputRef.current?.focus()
    } catch (error) {
      setNote(
        isMissingRpcMethod(error) ? m.interjectUnavailable : error instanceof Error ? error.message : String(error)
      )
    } finally {
      setSending(false)
    }
  }

  const prefix = (label: string) => () => {
    setText(prev => (prev.startsWith(label) ? prev : `${label} ${prev}`))
    inputRef.current?.focus()
  }

  return (
    <div className="shrink-0 border-t border-(--ui-stroke-quaternary) bg-(--ui-bg-tertiary)">
      {note ? (
        <p className="px-3 pt-1.5 text-[0.6875rem] text-destructive" role="alert">
          {note}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1 px-3 pt-2">
        {(
          [
            ['agree', m.agree],
            ['explore', m.explore],
            ['keyPoint', m.keyPoint],
            ['reject', m.reject]
          ] as const
        ).map(([key, label]) => (
          <button
            className="rounded-full border border-(--ui-stroke-secondary) px-2 py-0.5 text-[0.6875rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)"
            disabled={terminal}
            key={key}
            onClick={prefix(label)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          aria-label={m.placeholder}
          autoComplete="off"
          className="max-h-24 min-h-[2rem] flex-1 resize-none rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-2 py-1 text-xs leading-5 text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:border-ring focus:outline-none disabled:opacity-50"
          disabled={terminal || sending}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send(text)
            }
          }}
          placeholder={m.placeholder}
          ref={inputRef}
          rows={1}
          value={text}
        />
        <button
          aria-label={m.interjectHint}
          className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={terminal || sending || !text.trim()}
          onClick={() => void send(text)}
          type="button"
        >
          <Codicon name="arrow-up" size="0.75rem" />
        </button>
      </div>
    </div>
  )
}

/** §7.3 排队薄条：当前发言席 + 下一发言席。假数据阶段以席位顺序推进。 */
export function MeetingQueueStrip({ meeting }: { meeting: MeetingProgress }) {
  const { t } = useI18n()
  const rm = t.meetings.room
  const cm = t.meetings.composer
  const seats = meeting.seats
  const last = meeting.turns[meeting.turns.length - 1]

  if (seats.length === 0) {
    return null
  }

  const lastIdx = last ? seats.indexOf(last.seat) : -1
  const next = lastIdx >= 0 ? seats[(lastIdx + 1) % seats.length]! : seats[0]!

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-(--ui-stroke-quaternary) px-3 py-1.5">
      <span className="text-[0.625rem] uppercase tracking-wide text-(--ui-text-quaternary)">{cm.queued}</span>
      <span className="flex min-w-0 items-center gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
        {last ? (
          <>
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: seatColor(last.seat) }}
            />
            <span className="truncate">{last.seat}</span>
          </>
        ) : (
          <span className="truncate">{rm.waitingTurn}</span>
        )}
      </span>
      <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="arrow-right" size="0.625rem" />
      <span className="flex min-w-0 items-center gap-1 text-[0.6875rem] text-(--ui-text-secondary)">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: seatColor(next) }} />
        <span className="truncate">{next}</span>
        <span className="shrink-0 text-(--ui-text-quaternary)">{rm.queueNext(next)}</span>
      </span>
    </div>
  )
}
