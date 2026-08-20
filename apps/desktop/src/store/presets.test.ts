import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  $presetDefault,
  $presets,
  $presetsLoading,
  type AgentPresetInfo,
  applySessionPreset,
  loadPresets,
  presetLabel,
  setDefaultPreset
} from './presets'
import { $sessions, setSessions } from './session'

const MINIMAL: AgentPresetInfo = {
  broken: false,
  description: 'Fixed persona, file access only',
  id: 'minimal',
  name: 'Minimal',
  toolset_summary: 'file, terminal, todo',
  skills_summary: '(no skills)',
  trust: 'system'
}

const STANDARD: AgentPresetInfo = {
  broken: false,
  description: 'Default',
  id: 'standard',
  name: 'Standard',
  toolset_summary: '',
  skills_summary: '(default skills)',
  trust: 'system'
}

function request(calls: { method: string; params?: Record<string, unknown> }[]) {
  return async <T>(method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params })

    return {} as T
  }
}

describe('presets store', () => {
  beforeEach(() => {
    $presets.set(null)
    $presetDefault.set('')
    $presetsLoading.set(false)
    setSessions([])
  })

  it('loads the catalog once and caches it', async () => {
    const calls: { method: string; params?: Record<string, unknown> }[] = []

    await loadPresets(async <T>(method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params })

      return { presets: [MINIMAL, STANDARD], default: 'standard' } as T
    })
    await loadPresets(async <T>(method: string) => ({} as T))

    expect(calls).toEqual([{ method: 'preset.list', params: {} }])
    expect($presets.get()).toEqual([MINIMAL, STANDARD])
    expect($presetDefault.get()).toBe('standard')
  })

  it('stays null on failure so the next open retries', async () => {
    await expect(
      loadPresets(async () => {
        throw new Error('gateway closed')
      })
    ).rejects.toThrow('gateway closed')

    expect($presets.get()).toBeNull()
    expect($presetsLoading.get()).toBe(false)
  })

  it('labels presets by published name and falls back to the id', () => {
    expect(presetLabel('minimal', [MINIMAL, STANDARD])).toBe('Minimal')
    expect(presetLabel('nope', [MINIMAL, STANDARD])).toBe('nope')
    expect(presetLabel(null, [MINIMAL, STANDARD])).toBeNull()
    expect(presetLabel('', [MINIMAL, STANDARD])).toBeNull()
    expect(presetLabel('minimal', null)).toBe('minimal')
  })

  it('applies a preset to the session row optimistically', async () => {
    setSessions([{ id: 's1', title: 'T', started_at: 0, last_active: 0, is_active: true, ended_at: null, input_tokens: 0, message_count: 0, model: null, output_tokens: 0, preview: null, source: null, tool_call_count: 0 }])
    const calls: { method: string; params?: Record<string, unknown> }[] = []
    const ok = await applySessionPreset('s1', 'minimal', request(calls), 'fail')

    expect(ok).toBe(true)
    expect(calls).toEqual([{ method: 'preset.apply', params: { session_id: 's1', preset_id: 'minimal' } }])
    expect($sessions.get()[0].agent_preset).toBe('minimal')
  })

  it('reports failure and leaves the row untouched', async () => {
    setSessions([{ id: 's1', title: 'T', started_at: 0, last_active: 0, is_active: true, ended_at: null, input_tokens: 0, message_count: 0, model: null, output_tokens: 0, preview: null, source: null, tool_call_count: 0 }])
    const notifyError = vi.spyOn(await import('./notifications'), 'notifyError').mockImplementation(() => 'nid')

    const ok = await applySessionPreset('s1', 'minimal', async () => {
      throw new Error('busy')
    }, 'fail message')

    expect(ok).toBe(false)
    expect($sessions.get()[0].agent_preset).toBeUndefined()
    expect(notifyError).toHaveBeenCalledWith(expect.any(Error), 'fail message')
  })

  it('pins the default preset for new chats via config.set', async () => {
    $presetDefault.set('standard')
    const calls: { method: string; params?: Record<string, unknown> }[] = []
    const ok = await setDefaultPreset('minimal', request(calls), 'fail')

    expect(ok).toBe(true)
    expect(calls).toEqual([{ method: 'config.set', params: { key: 'agent_presets.default', value: 'minimal' } }])
    expect($presetDefault.get()).toBe('minimal')
  })

  it('rolls the default back and notifies on a failed pin', async () => {
    $presetDefault.set('standard')
    const notifyError = vi.spyOn(await import('./notifications'), 'notifyError').mockImplementation(() => 'nid')

    const ok = await setDefaultPreset('minimal', async () => {
      throw new Error('socket closed')
    }, 'fail message')

    expect(ok).toBe(false)
    expect($presetDefault.get()).toBe('standard')
    expect(notifyError).toHaveBeenCalledWith(expect.any(Error), 'fail message')
  })
})