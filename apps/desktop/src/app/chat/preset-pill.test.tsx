import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { $presetDefault, $presets, type AgentPresetInfo, type RequestGateway } from '@/store/presets'
import type { SessionInfo } from '@/types/hermes'

import { PresetPill } from './preset-pill'

class TestResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
  HTMLElement.prototype.scrollIntoView ??= () => undefined
})

afterEach(() => {
  cleanup()
  $presets.set(null)
  $presetDefault.set('')
})

const PRESETS: AgentPresetInfo[] = [
  {
    broken: false,
    description: 'Fixed persona, file access only',
    id: 'minimal',
    name: 'Minimal',
    toolset_summary: 'file, terminal, todo',
    trust: 'system'
  },
  {
    broken: false,
    description: 'Default composition',
    id: 'standard',
    name: 'Standard',
    toolset_summary: '',
    trust: 'system'
  }
]

const SESSION: SessionInfo = {
  agent_preset: 'standard',
  ended_at: null,
  id: 's1',
  input_tokens: 0,
  is_active: true,
  last_active: 0,
  message_count: 0,
  model: null,
  output_tokens: 0,
  preview: null,
  source: null,
  started_at: 0,
  title: 'T',
  tool_call_count: 0
}

function makeRequest(overrides: { apply?: () => Promise<unknown>; list?: () => Promise<unknown> } = {}): RequestGateway {
  return vi.fn(async (_method: string, params?: Record<string, unknown>) => {
    if (_method === 'preset.list') {
      if (overrides.list) {
        return overrides.list()
      }
      return { default: 'standard', presets: PRESETS }
    }
    if (overrides.apply) {
      return overrides.apply()
    }
    return { applied: true, recomposed: true }
  }) as unknown as RequestGateway
}

describe('PresetPill', () => {
  it('names the session preset and lists every discoverable one', async () => {
    render(<PresetPill request={makeRequest()} session={SESSION} />)

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Agent mode: Standard' }), { button: 0 })

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Minimal')).toBeTruthy()
    expect(within(menu).getByText('Standard')).toBeTruthy()
    expect(within(menu).getByText('Fixed persona, file access only')).toBeTruthy()
    expect(within(menu).getByText('file, terminal, todo')).toBeTruthy()
  })

  it('switches the preset through the gateway and re-labels the pill', async () => {
    const request = makeRequest()
    render(<PresetPill request={request} session={SESSION} />)

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Agent mode: Standard' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Minimal/ }))

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('preset.apply', { session_id: 's1', preset_id: 'minimal' })
      expect(screen.getByRole('button', { name: 'Agent mode: Minimal' })).toBeTruthy()
    })
  })

  it('keeps the pill label on a failed switch', async () => {
    const request = makeRequest({
      apply: async () => {
        throw new Error('session busy')
      }
    })
    vi.spyOn(await import('@/store/notifications'), 'notifyError').mockImplementation(() => 'nid')
    render(<PresetPill request={request} session={SESSION} />)

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Agent mode: Standard' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Minimal/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Agent mode: Standard' })).toBeTruthy()
    })
  })

  it('falls back to the profile default when the session row has no preset', async () => {
    $presets.set(PRESETS)
    $presetDefault.set('standard')
    render(<PresetPill request={makeRequest()} session={{ ...SESSION, agent_preset: null }} />)

    expect(await screen.findByRole('button', { name: 'Agent mode: Standard' })).toBeTruthy()
  })

  it('renders in the active locale', async () => {
    render(
      <I18nProvider configClient={null} initialLocale="ja">
        <PresetPill request={makeRequest()} session={SESSION} />
      </I18nProvider>
    )

    expect(await screen.findByRole('button', { name: 'エージェントモード：Standard' })).toBeTruthy()
  })
})