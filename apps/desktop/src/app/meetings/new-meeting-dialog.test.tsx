import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $meetingDraftOpen, openMeetingDraft } from '@/store/meeting'
import { $meetingPresets } from '@/store/meeting-presets'
import { $sessions } from '@/store/session'
import type { SessionInfo } from '@/types/hermes'

import { NewMeetingDialog } from './new-meeting-dialog'

const requestGateway = vi.fn()

beforeEach(() => {
  $meetingDraftOpen.set(false)
  $sessions.set([
    { id: 'sess-1', message_count: 1, source: 'cli', started_at: 0, title: 'Chat one', last_active: 1 } as SessionInfo
  ])
  $meetingPresets.set([
    {
      id: 'p-1',
      name: 'Lin',
      role: 'advocate',
      objective: 'Defend the proposal',
      model: ''
    },
    {
      id: 'p-2',
      name: 'Yuki',
      role: '自定义评审',
      objective: '审查可行性',
      model: 'deepseek-v4-pro'
    }
  ])
  requestGateway.mockReset().mockResolvedValue({ meeting_id: 'm-1' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderDialog() {
  act(() => {
    openMeetingDraft()
  })

  return render(
    <MemoryRouter>
      <NewMeetingDialog requestGateway={requestGateway as never} />
    </MemoryRouter>
  )
}

describe('NewMeetingDialog presets', () => {
  it('shows the preset picker with an empty hint when no presets exist', () => {
    $meetingPresets.set([])

    renderDialog()

    // The select falls back to the empty-state copy; the apply button is inert.
    expect((screen.getByLabelText('Presets') as HTMLSelectElement).value).toBe('')
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('applies a preset by appending a filled seat with its role mapped to the enum', () => {
    renderDialog()

    fireEvent.change(screen.getByLabelText('Presets'), { target: { value: 'p-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    // The new row carries name/objective and the enum-mapped advocate role…
    expect(screen.getAllByDisplayValue('Lin')).toHaveLength(2)
    expect(screen.getAllByDisplayValue('Defend the proposal')).toHaveLength(1)
    expect((screen.getAllByRole('combobox', { name: 'Role' }).at(-1) as HTMLSelectElement).value).toBe('advocate')
  })

  it('falls back to the expert role when the preset role is not an enum value', () => {
    renderDialog()

    fireEvent.change(screen.getByLabelText('Presets'), { target: { value: 'p-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getAllByDisplayValue('Yuki')).toHaveLength(2)
    expect((screen.getAllByRole('combobox', { name: 'Role' }).at(-1) as HTMLSelectElement).value).toBe('expert')
  })

  it('submits the preset-filled seat in the meeting.create payload', async () => {
    renderDialog()

    fireEvent.change(screen.getByLabelText('Source chat'), { target: { value: 'sess-1' } })
    fireEvent.change(screen.getByPlaceholderText('What is this room about?'), {
      target: { value: 'Proposal review' }
    })
    fireEvent.change(screen.getByLabelText('Presets'), { target: { value: 'p-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    fireEvent.click(screen.getByRole('button', { name: 'Start meeting' }))

    await vi.waitFor(() => expect(requestGateway).toHaveBeenCalledTimes(1))

    const payload = requestGateway.mock.calls[0]![1] as { seats: { name: string; objective: string; role: string }[] }

    expect(payload.seats).toEqual(
      expect.arrayContaining([{ name: 'Lin', objective: 'Defend the proposal', role: 'advocate' }])
    )
  })

  it('starts a standalone meeting without a source chat', async () => {
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('What is this room about?'), {
      target: { value: 'Standalone review' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start meeting' }))

    await vi.waitFor(() => expect(requestGateway).toHaveBeenCalledTimes(1))

    const payload = requestGateway.mock.calls[0]![1] as { session_id?: string; topic?: string }

    // No chat selected — the create payload must not pin a session, and the
    // button is enabled with just a topic (the origin is optional).
    expect(payload.session_id).toBe('')
    expect(payload.topic).toBe('Standalone review')
  })
})
