import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activeMeetingCount,
  allMeetings,
  applyMeetingEvent,
  $meetingsBySession,
  clearSessionMeetings,
  findMeetingById,
  sessionMeetings
} from './meeting'

const listFor = (sid: string) => $meetingsBySession.get()[sid] ?? []

describe('meeting store', () => {
  beforeEach(() => $meetingsBySession.set({}))

  it('seeds a room from meeting.started', () => {
    applyMeetingEvent('s1', 'meeting.started', {
      meeting_id: 'm1',
      topic: '会诊 A',
      origin_ref: 'thread:s1',
      mode: 'light',
      status: 'running',
      seats: ['s0', 's1']
    })

    const room = listFor('s1')[0]
    expect(room?.meetingId).toBe('m1')
    expect(room?.status).toBe('running')
    expect(room?.topic).toBe('会诊 A')
    expect(room?.originRef).toBe('thread:s1')
    expect(room?.seats).toEqual(['s0', 's1'])
    // A room bound to an origin thread is not standalone.
    expect(room?.standalone).toBe(false)
  })

  it('flags a room standalone when its started frame has no origin thread', () => {
    applyMeetingEvent('meeting:m1', 'meeting.started', {
      meeting_id: 'm1',
      topic: '独立评审',
      status: 'running'
    })

    const room = listFor('meeting:m1')[0]
    // No origin thread → the stored ref stays null and the room is standalone.
    expect(room?.originRef).toBeNull()
    expect(room?.standalone).toBe(true)
  })

  it('keeps the standalone flag through the conclusion frame', () => {
    applyMeetingEvent('meeting:m1', 'meeting.started', { meeting_id: 'm1', topic: '独立评审' })
    applyMeetingEvent('meeting:m1', 'meeting.conclusion', { meeting_id: 'm1', topic: '独立评审', contract: '纪要' })

    const room = listFor('meeting:m1')[0]
    expect(room?.standalone).toBe(true)
    expect(room?.status).toBe('closed')
  })

  it('accumulates a read-only turn stream from meeting.turn.complete', () => {
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'm1', seats: ['s0', 's1'] })
    applyMeetingEvent('s1', 'meeting.turn.complete', {
      meeting_id: 'm1',
      seat: 's0',
      seq: 1,
      tokens: 3,
      text: 'first view'
    })
    applyMeetingEvent('s1', 'meeting.turn.complete', {
      meeting_id: 'm1',
      seat: 's1',
      seq: 1,
      tokens: 4,
      text: 'counter view'
    })

    const room = listFor('s1')[0]
    expect(room?.turns).toEqual([
      { seat: 's0', seq: 1, tokens: 3, text: 'first view' },
      { seat: 's1', seq: 1, tokens: 4, text: 'counter view' }
    ])
    // Roster grows from announced seats, seats not present fall back to seen speakers.
    expect(room?.seats).toEqual(['s0', 's1'])
  })

  it('dedups replayed turn.complete events', () => {
    applyMeetingEvent('s1', 'meeting.turn.complete', { meeting_id: 'm1', seat: 's0', seq: 1, tokens: 3, text: 'v1' })
    applyMeetingEvent('s1', 'meeting.turn.complete', { meeting_id: 'm1', seat: 's0', seq: 1, tokens: 3, text: 'v1' })

    expect(listFor('s1')[0]?.turns).toHaveLength(1)
  })

  it('tracks the budget projection from meeting.budget.update', () => {
    applyMeetingEvent('s1', 'meeting.budget.update', {
      meeting_id: 'm1',
      remaining: { rounds: 2, seconds: 100, tokens: 400, spent_rounds: 1, spent_tokens: 12 }
    })

    const room = listFor('s1')[0]
    expect(room?.budget.rounds).toBe(2)
    expect(room?.budget.tokens).toBe(400)
    expect(room?.budget.spentRounds).toBe(1)
    expect(room?.budget.spentTokens).toBe(12)
  })

  it('marks a room converging with its reason', () => {
    applyMeetingEvent('s1', 'meeting.converging', { meeting_id: 'm1', reason: 'budget:rounds' })

    const room = listFor('s1')[0]
    expect(room?.status).toBe('converging')
    expect(room?.convergeReason).toBe('budget:rounds')
  })

  it('closes the room on meeting.conclusion and pins the packet summary', () => {
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'm1', topic: '会诊股', status: 'running' })
    applyMeetingEvent('s1', 'meeting.converging', { meeting_id: 'm1', reason: 'budget:rounds' })
    applyMeetingEvent('s1', 'meeting.conclusion', {
      meeting_id: 'm1',
      topic: '会诊股',
      contract: '会议纪要 — 会诊股\n[s0] a\n',
      open_items: 1,
      decisions_count: 2,
      stats: { turns: 3, tokens: 12 }
    })

    const room = listFor('s1')[0]
    expect(room?.status).toBe('closed')
    expect(room?.conclusion?.openItems).toBe(1)
    expect(room?.conclusion?.decisionsCount).toBe(2)
    expect(room?.conclusion?.turns).toBe(3)
    expect(room?.conclusion?.tokens).toBe(12)
    expect(room?.conclusion?.contract).toContain('[s0] a')
  })

  it('ignores meeting events without a meeting_id', () => {
    applyMeetingEvent('s1', 'meeting.started', { topic: 'no id' })

    expect(listFor('s1')).toHaveLength(0)
  })

  it('keeps meeting rows per session', () => {
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'm1' })
    applyMeetingEvent('s2', 'meeting.started', { meeting_id: 'm2' })

    expect(listFor('s1')[0]?.meetingId).toBe('m1')
    expect(listFor('s2')[0]?.meetingId).toBe('m2')
    expect(listFor('s1')).toHaveLength(1)
  })

  it('counts only live rooms', () => {
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'm1' })
    applyMeetingEvent('s1', 'meeting.converging', { meeting_id: 'm2' })
    applyMeetingEvent('s1', 'meeting.conclusion', { meeting_id: 'm3', contract: 'x' })

    expect(activeMeetingCount(listFor('s1'))).toBe(2)
  })

  it('clears a session', () => {
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'm1' })
    clearSessionMeetings('s1')

    expect(listFor('s1')).toHaveLength(0)
  })

  it('sorts session meetings newest-first', () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000)
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'old' })
    nowSpy.mockReturnValue(2_000)
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'new' })
    nowSpy.mockRestore()

    expect(sessionMeetings('s1').map(m => m.meetingId)).toEqual(['new', 'old'])
  })

  it('keeps a concluded meeting stable under straggler events', () => {
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'm1', topic: 'done' })
    applyMeetingEvent('s1', 'meeting.conclusion', {
      meeting_id: 'm1',
      topic: 'done',
      contract: '纪要',
      open_items: 0
    })

    applyMeetingEvent('s1', 'meeting.budget.update', { meeting_id: 'm1', remaining: { rounds: 9 } })

    const room = listFor('s1')[0]
    expect(room?.status).toBe('closed')
    expect(room?.conclusion?.contract).toBe('纪要')
    expect(room?.budget.rounds).toBeNull()
  })

  it('flattens every session into allMeetings with live rooms first', () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000)
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'old-closed' })
    nowSpy.mockReturnValue(1_100)
    applyMeetingEvent('s1', 'meeting.conclusion', { meeting_id: 'old-closed', contract: 'x' })
    nowSpy.mockReturnValue(2_000)
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'live-s1' })
    nowSpy.mockReturnValue(3_000)
    applyMeetingEvent('s2', 'meeting.started', { meeting_id: 'live-s2' })
    nowSpy.mockRestore()

    const rows = allMeetings()
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.meeting.meetingId)).toEqual(['live-s2', 'live-s1', 'old-closed'])
    expect(rows[0]?.sessionId).toBe('s2')
  })

  it('locates a meeting across sessions by id', () => {
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'm1', topic: '会诊股' })

    const row = findMeetingById('m1')
    expect(row?.sessionId).toBe('s1')
    expect(row?.meeting.topic).toBe('会诊股')
    expect(findMeetingById('missing')).toBeNull()
  })

  it('resolve latest-wins when ids collide across sessions', () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000)
    applyMeetingEvent('s1', 'meeting.started', { meeting_id: 'dup', topic: 'from s1' })
    nowSpy.mockReturnValue(2_000)
    applyMeetingEvent('s2', 'meeting.started', { meeting_id: 'dup', topic: 'from s2' })
    nowSpy.mockRestore()

    const row = findMeetingById('dup')
    expect(row?.sessionId).toBe('s2')
  })
})
