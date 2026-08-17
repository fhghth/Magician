import { atom } from 'nanostores'

/**
 * 人物模板库（§7.8 设置页"会议"配置区）：
 * localStorage `meeting:presets:` 全局 scope（非 profile 级）——模板库是用户
 * 跨配置重用的"会议<-角色/目标"素材，与新会议模态（§7.7 每席位引用）共享。
 * 变化很小，无需 schema 迁移：旧值容忍脏数据（字符串化 + 丢弃无 name 项）。
 */
export const MEETING_PRESETS_STORAGE_KEY = 'meeting:presets:'

export interface MeetingPreset {
  id: string
  name: string
  role: string
  objective: string
  model: string
}

export interface MeetingPresetInput {
  name: string
  role: string
  objective: string
  model: string
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Coerce raw localStorage rows into valid presets: drop nameless junk. */
export function sanitizePresets(raw: unknown): MeetingPreset[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const out: MeetingPreset[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const rec = entry as Record<string, unknown>
    const name = asString(rec.name).trim()

    if (!name) {
      continue
    }

    out.push({
      id: asString(rec.id) || cryptoRandomId(),
      name,
      role: asString(rec.role).trim(),
      objective: asString(rec.objective).trim(),
      model: asString(rec.model).trim()
    })
  }

  return out
}

export const cryptoRandomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const load = (): MeetingPreset[] => {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    return sanitizePresets(JSON.parse(window.localStorage.getItem(MEETING_PRESETS_STORAGE_KEY) ?? 'null'))
  } catch {
    return []
  }
}

const save = (presets: MeetingPreset[]) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (presets.length === 0) {
      window.localStorage.removeItem(MEETING_PRESETS_STORAGE_KEY)
    } else {
      window.localStorage.setItem(MEETING_PRESETS_STORAGE_KEY, JSON.stringify(presets))
    }
  } catch {
    // best-effort: storage may be unavailable, presets still work in-memory
  }
}

export const $meetingPresets = atom<MeetingPreset[]>(load())

export function setMeetingPresets(presets: MeetingPreset[]) {
  $meetingPresets.set(presets)
  save(presets)
}

export function addMeetingPreset(input: MeetingPresetInput): MeetingPreset {
  const preset: MeetingPreset = {
    id: cryptoRandomId(),
    name: input.name.trim(),
    role: input.role.trim(),
    objective: input.objective.trim(),
    model: input.model.trim()
  }
  setMeetingPresets([...$meetingPresets.get(), preset])

  return preset
}

export function updateMeetingPreset(id: string, patch: Partial<MeetingPresetInput>) {
  const prev = $meetingPresets.get()
  const next = prev.map(preset => (preset.id === id ? { ...preset, ...patch, id: preset.id } : preset))
  setMeetingPresets(next)
}

export function removeMeetingPreset(id: string) {
  setMeetingPresets($meetingPresets.get().filter(preset => preset.id !== id))
}

export function getMeetingPreset(id: string): MeetingPreset | undefined {
  return $meetingPresets.get().find(preset => preset.id === id)
}
