import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getGlobalModelOptions, saveHermesConfig } from '@/hermes'
import { useI18n } from '@/i18n'
import { Users } from '@/lib/icons'
import { modelOptionsQueryKey } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'
import {
  $meetingPresets,
  addMeetingPreset,
  type MeetingPresetInput,
  removeMeetingPreset,
  updateMeetingPreset
} from '@/store/meeting-presets'
import { $activeGatewayProfile } from '@/store/profile'

import { setHermesConfigCache, useHermesConfigRecord } from '../hooks/use-config-record'
import { CONTROL_TEXT, EMPTY_SELECT_VALUE } from './constants'
import { getNested, setNested } from './helpers'
import { withActive } from './model-settings'
import { ListRow, SettingsSection } from './primitives'

export const MEETING_MODEL_PROVIDER_KEY = 'meeting.model.provider'
export const MEETING_MODEL_DEFAULT_KEY = 'meeting.model.default'

/**
 * §7.8 "会议"设置区：默认会议模型（config.yaml ``meeting:`` 段的 UI 编辑口）
 * ＋ 人物模板库（localStorage ``meeting:presets:`` 全局 scope，供新会议模态
 * 一键填充席位）。模型 provider 复用主模型页的模型目录（getGlobalModelOptions）；
 * "继承主模型"清空字段，让后端回退到会话/全局模型解析。保存乐观、失败回滚。
 */
export function MeetingSettings() {
  const { t } = useI18n()
  const m = t.settings.meetings
  const { data: config } = useHermesConfigRecord()
  const profile = useStore($activeGatewayProfile)
  const presets = useStore($meetingPresets)

  const { data: options, isLoading } = useQuery({
    queryKey: modelOptionsQueryKey(profile, null),
    queryFn: () => getGlobalModelOptions(),
    staleTime: 60_000
  })

  const providers = options?.providers ?? []
  const meetingProvider = String(getNested(config ?? {}, MEETING_MODEL_PROVIDER_KEY) ?? '')
  const meetingModel = String(getNested(config ?? {}, MEETING_MODEL_DEFAULT_KEY) ?? '')
  const providerRow = providers.find(row => row.slug === meetingProvider)
  const providerModels = providerRow?.models ?? []
  const inheritSelected = !meetingProvider

  // 已保存的 provider 不在目录里（自定义端点/旧配置）时仍显示它，避免昏暗的空触发器。
  const mainProviderOptions =
    meetingProvider && !providers.some(row => row.slug === meetingProvider)
      ? [{ name: meetingProvider, slug: meetingProvider, models: [] }, ...providers]
      : providers

  // 人物模板库编辑态：纯本地状态；模板数据只存于 meeting-presets store。
  const [editingId, setEditingId] = useState<null | string>(null)
  const [draft, setDraft] = useState<MeetingPresetInput>({ name: '', role: '', objective: '', model: '' })

  const saveMeetingModel = async (patch: { provider: string; default: string }) => {
    if (!config) {
      return
    }

    const prev = config
    const next = setNested(
      setNested(config, MEETING_MODEL_PROVIDER_KEY, patch.provider),
      MEETING_MODEL_DEFAULT_KEY,
      patch.default
    )
    setHermesConfigCache(next)

    try {
      await saveHermesConfig(next)
    } catch (err) {
      setHermesConfigCache(prev)
      notifyError(err, m.saveFailed)
    }
  }

  const onProviderChange = (next: string) => {
    const provider = next === EMPTY_SELECT_VALUE ? '' : next
    void saveMeetingModel({ provider, default: '' })
  }

  const onModelChange = (model: string) => {
    void saveMeetingModel({ provider: meetingProvider, default: model })
  }

  const beginAdd = () => {
    setEditingId('__new__')
    setDraft({ name: '', role: '', objective: '', model: '' })
  }

  const beginEdit = (id: string) => {
    const preset = presets.find(p => p.id === id)

    if (!preset) {
      return
    }

    setEditingId(id)
    setDraft({ name: preset.name, role: preset.role, objective: preset.objective, model: preset.model })
  }

  const commitPreset = () => {
    const name = draft.name.trim()

    if (!name) {
      return
    }

    const patch = { ...draft, name }

    if (editingId && editingId !== '__new__') {
      updateMeetingPreset(editingId, patch)
    } else {
      addMeetingPreset(patch)
    }

    setEditingId(null)
  }

  const removePreset = (id: string) => {
    if (window.confirm(m.deleteConfirm)) {
      removeMeetingPreset(id)
    }
  }

  const presetInputs = (
    <div className="mt-1.5 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-1.5">
      <Input
        aria-label={m.presetName}
        onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
        placeholder={m.presetName}
        value={draft.name}
      />
      <Input
        aria-label={m.presetRole}
        onChange={e => setDraft(prev => ({ ...prev, role: e.target.value }))}
        placeholder={m.presetRole}
        value={draft.role}
      />
      <Input
        aria-label={m.presetObjective}
        onChange={e => setDraft(prev => ({ ...prev, objective: e.target.value }))}
        placeholder={m.presetObjective}
        value={draft.objective}
      />
      <Input
        aria-label={m.presetModel}
        onChange={e => setDraft(prev => ({ ...prev, model: e.target.value }))}
        placeholder={m.presetModel}
        value={draft.model}
      />
    </div>
  )

  return (
    <div className="grid gap-6">
      <SettingsSection icon={Users} title={m.modelTitle}>
        <p className="pb-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
          {m.modelDesc}
        </p>
        {isLoading ? (
          <div className="flex gap-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-8 w-56" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              disabled={!providers.length}
              onValueChange={onProviderChange}
              value={meetingProvider || EMPTY_SELECT_VALUE}
            >
              <SelectTrigger className={cn('min-w-44', CONTROL_TEXT)}>
                <SelectValue placeholder={m.provider} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_SELECT_VALUE}>{m.inheritMain}</SelectItem>
                {mainProviderOptions.map(row => (
                  <SelectItem key={row.slug} value={row.slug}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {inheritSelected ? (
              <span className="text-xs text-muted-foreground">{m.inheritMain}</span>
            ) : (
              <Select
                disabled={!meetingProvider || !providerModels.length}
                onValueChange={onModelChange}
                value={meetingModel}
              >
                <SelectTrigger className={cn('min-w-56', CONTROL_TEXT)}>
                  <SelectValue placeholder={m.model} />
                </SelectTrigger>
                <SelectContent>
                  {withActive(providerModels, meetingModel).map(model => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        aside={
          <Button disabled={editingId !== null} onClick={beginAdd} size="sm" variant="textStrong">
            {m.addPreset}
          </Button>
        }
        icon={Users}
        title={m.presetsTitle}
      >
        {presets.length === 0 && editingId !== '__new__' && (
          <div className="py-2 text-sm text-muted-foreground">{m.emptyPresets}</div>
        )}

        <div className="grid gap-1">
          {presets.map(preset => (
            <ListRow
              action={
                editingId === preset.id ? (
                  <div className="flex gap-1.5">
                    <Button disabled={!draft.name.trim()} onClick={commitPreset} size="sm">
                      {t.common.save}
                    </Button>
                    <Button onClick={() => setEditingId(null)} size="sm" variant="ghost">
                      {t.common.cancel}
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button onClick={() => beginEdit(preset.id)} size="sm" variant="text">
                      {m.editPreset}
                    </Button>
                    <Button onClick={() => removePreset(preset.id)} size="sm" variant="text">
                      {t.common.delete}
                    </Button>
                  </div>
                )
              }
              below={editingId === preset.id ? presetInputs : undefined}
              description={[preset.role, preset.objective, preset.model].filter(Boolean).join(' · ') || m.presetName}
              key={preset.id}
              title={preset.name}
            />
          ))}

          {editingId === '__new__' && (
            <ListRow
              action={
                <div className="flex gap-1.5">
                  <Button disabled={!draft.name.trim()} onClick={commitPreset} size="sm">
                    {t.common.save}
                  </Button>
                  <Button onClick={() => setEditingId(null)} size="sm" variant="ghost">
                    {t.common.cancel}
                  </Button>
                </div>
              }
              below={presetInputs}
              title={m.presetName}
            />
          )}
        </div>
      </SettingsSection>
    </div>
  )
}
