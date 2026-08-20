import { beforeEach, describe, expect, it } from 'vitest'

import {
  $meetingPresets,
  addMeetingPreset,
  getMeetingPreset,
  MEETING_PRESETS_STORAGE_KEY,
  removeMeetingPreset,
  sanitizePresets,
  updateMeetingPreset
} from './meeting-presets'

const reset = () => {
  window.localStorage.removeItem(MEETING_PRESETS_STORAGE_KEY)
  $meetingPresets.set([])
}

beforeEach(() => {
  reset()
})

describe('sanitizePresets', () => {
  it('drops nameless/non-object rows and coerces string fields', () => {
    const presets = sanitizePresets([
      { id: 'a', name: 'Moderator', role: 'facilitator', objective: 'ok order', model: 'gpt-5.2' },
      { name: '   ' },
      'shape',
      { id: 'b', name: 'Lean', role: 3, objective: null, model: '' },
      null
    ])

    expect(presets).toHaveLength(2)
    expect(presets[0]).toEqual({
      id: 'a',
      name: 'Moderator',
      role: 'facilitator',
      objective: 'ok order',
      model: 'gpt-5.2'
    })
    expect(presets[1]).toMatchObject({ id: 'b', name: 'Lean', role: '', objective: '', model: '' })
  })

  it('generates an id when a row lacks one', () => {
    const [preset] = sanitizePresets([{ name: 'no-id' }])

    expect(preset?.id).toBeTruthy()
  })

  it('returns an empty list for non-array input', () => {
    expect(sanitizePresets({ name: 'x' })).toEqual([])
    expect(sanitizePresets(null)).toEqual([])
  })
})

describe('CRUD round-trip through localStorage', () => {
  it('adds, reads, updates, and removes a preset', () => {
    const added = addMeetingPreset({ name: 'techout', role: 'facilitator', objective: 'Lead', model: '' })

    expect(getMeetingPreset(added.id)).toEqual(added)
    expect(JSON.parse(window.localStorage.getItem(MEETING_PRESETS_STORAGE_KEY) ?? '[]')).toHaveLength(1)

    updateMeetingPreset(added.id, { role: 'expert', objective: 'Fact-check', model: 'kimi-k2' })

    expect(getMeetingPreset(added.id)).toMatchObject({
      id: added.id,
      role: 'expert',
      objective: 'Fact-check',
      model: 'kimi-k2'
    })

    removeMeetingPreset(added.id)

    expect(getMeetingPreset(added.id)).toBeUndefined()
    expect($meetingPresets.get()).toHaveLength(0)
    expect(window.localStorage.getItem(MEETING_PRESETS_STORAGE_KEY)).toBeNull()
  })

  it('keeps the id stable across updates', () => {
    const added = addMeetingPreset({ name: 'Moderator', role: '', objective: '', model: '' })
    updateMeetingPreset(added.id, { name: 'Moderator 2' })

    expect(getMeetingPreset(added.id)).toMatchObject({ id: added.id, name: 'Moderator 2' })
  })
})
