import { atom } from 'nanostores'

import { notifyError } from './notifications'
import { setSessions } from './session'

/** One discoverable agent preset, as served by the gateway's `preset.list`. */
export interface AgentPresetInfo {
  broken: boolean
  description: string
  id: string
  name: string
  skills_summary: string
  toolset_summary: string
  trust: string
}

export interface PresetListResult {
  default: string
  presets: AgentPresetInfo[]
}

export type RequestGateway = <T>(method: string, params?: Record<string, unknown>) => Promise<T>

/** Cached `preset.list` result. Null until the first successful fetch; the
 *  backend is authoritative, so this is a cache, not a store of record. */
export const $presets = atom<AgentPresetInfo[] | null>(null)
export const $presetDefault = atom('')
export const $presetsLoading = atom(false)

let loadInFlight: Promise<void> | null = null

/** Fetch the preset catalog once per process; concurrent callers share one
 *  request. A failed fetch stays null so the next open retries. */
export function loadPresets(request: RequestGateway): Promise<void> {
  if ($presets.get() !== null) {
    return Promise.resolve()
  }
  if (loadInFlight) {
    return loadInFlight
  }
  $presetsLoading.set(true)
  loadInFlight = (async () => {
    try {
      const out = await request<PresetListResult>('preset.list', {})
      $presets.set(Array.isArray(out.presets) ? out.presets : [])
      $presetDefault.set(typeof out.default === 'string' ? out.default : '')
    } finally {
      $presetsLoading.set(false)
      loadInFlight = null
    }
  })()
  return loadInFlight
}

/** Human label for a preset id — the published name when known, else the id. */
export function presetLabel(presetId: string | undefined | null, presets: AgentPresetInfo[] | null): string | null {
  if (!presetId) {
    return null
  }
  const found = presets?.find(preset => preset.id === presetId)
  return (found?.name || presetId).trim() || null
}

/** Apply a preset to a live session. Paints the session row optimistically
 *  (the backend recomposes the agent and emits session.info to confirm), and
 *  surfaces failures non-destructively. Returns true when the request landed. */
export async function applySessionPreset(
  sessionId: string,
  presetId: string,
  request: RequestGateway,
  failMessage: string
): Promise<boolean> {
  try {
    await request('preset.apply', { session_id: sessionId, preset_id: presetId })
    setSessions(rows => rows.map(row => (row.id === sessionId ? { ...row, agent_preset: presetId } : row)))
    return true
  } catch (error) {
    notifyError(error, failMessage)
    return false
  }
}

/** Pin the preset used for brand-new sessions (no session exists yet — the
 *  draft/new-chat surface). Writes `agent_presets.default` in config.yaml via
 *  config.set, optimistic against `$presetDefault` with rollback on failure. */
export async function setDefaultPreset(
  presetId: string,
  request: RequestGateway,
  failMessage: string
): Promise<boolean> {
  const previous = $presetDefault.get()
  $presetDefault.set(presetId)
  try {
    await request('config.set', { key: 'agent_presets.default', value: presetId })
    return true
  } catch (error) {
    $presetDefault.set(previous)
    notifyError(error, failMessage)
    return false
  }
}
