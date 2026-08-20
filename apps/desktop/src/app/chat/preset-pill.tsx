import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { releaseTypingFocus } from '@/components/ui/keyboard-first'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { ChevronDown, SlidersHorizontal } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $presetDefault, $presets, $presetsLoading, applySessionPreset, loadPresets, presetLabel, type RequestGateway, setDefaultPreset } from '@/store/presets'
import type { SessionInfo } from '@/types/hermes'

const PILL = cn(
  'h-6 shrink-0 gap-1 rounded-md px-1.5 text-xs font-normal',
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)

/**
 * Agent-mode pill. In a live session it names the preset the session runs
 * under and recomposes the session on the backend when changed (persona +
 * tools). With `session` null (a new/draft chat with no session yet) it names
 * and switches the config default that brand-new sessions start on — the same
 * backstage the CLI's `/preset` defaults to. The backend is authoritative, so
 * the label re-syncs from the session row / preset list on reload.
 *
 * Harness blank-session rule (deepseek-harness agent-presets): the preset is
 * only swappable while the session is still blank. Once the conversation has
 * any message (`message_count > 0`) the composition is fixed — swapping tools
 * mid-conversation would leave logged tool calls the new composition cannot
 * make — so the pill locks with an explanatory tooltip. A blank stored
 * session and a brand-new draft both stay switchable.
 */
export function PresetPill({
  request,
  session,
  tipSide = 'bottom'
}: {
  request: RequestGateway
  session: SessionInfo | null
  tipSide?: 'top' | 'bottom'
}) {
  const { t } = useI18n()
  const copy = t.shell.statusbar.presets
  const presets = useStore($presets)
  const defaultPreset = useStore($presetDefault)
  const loading = useStore($presetsLoading)
  const [open, setOpen] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [optimisticId, setOptimisticId] = useState<string | null>(null)

  // The conversation started (any message) — the preset is fixed. Matches the
  // backend's blank-session rule on preset.apply (error 4010).
  const locked = session !== null && (session.message_count ?? 0) > 0

  // A different session (or a backend-confirmed row change) re-bases the pill.
  useEffect(() => {
    setOptimisticId(null)
    setApplying(null)
  }, [session?.id, session?.agent_preset])

  useEffect(() => {
    void loadPresets(request).catch(() => undefined)
  }, [request])

  const activeId = optimisticId || session?.agent_preset || defaultPreset || ''
  const label = presetLabel(activeId, presets) ?? copy.none

  const setOpenWithRelease = (next: boolean) => {
    setOpen(next)

    if (!next) {
      releaseTypingFocus()
    }
  }

  const onPick = (value: string) => {
    if (!value || value === activeId || applying || locked) {
      return
    }

    setApplying(value)

    const landed = session
      ? applySessionPreset(session.id, value, request, copy.applyFailed)
      : setDefaultPreset(value, request, copy.applyFailed)

    void landed.then(ok => {
      setApplying(null)

      if (ok) {
        setOptimisticId(value)
        setOpen(false)
      }
    })
  }

  return (
    <DropdownMenu onOpenChange={setOpenWithRelease} open={open}>
      <Tip label={locked ? copy.locked : copy.openMenu} side={tipSide}>
        <DropdownMenuTrigger asChild disabled={locked}>
          <Button
            aria-label={copy.ariaLabel(label)}
            className={PILL}
            disabled={locked}
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="size-3 shrink-0 opacity-70" />
            <span className="max-w-28 truncate">{loading && !presets ? <GlyphSpinner className="opacity-50" spinner="braille" /> : label}</span>
            <ChevronDown className="size-2.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" className="w-72 p-1" side={tipSide} sideOffset={8}>
        <DropdownMenuLabel>{copy.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!presets || presets.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-(--ui-text-tertiary)">{copy.none}</div>
        ) : (
          <DropdownMenuRadioGroup
            onValueChange={value => {
              onPick(value)
            }}
            value={applying || activeId}
          >
            {presets.map(preset => (
              <DropdownMenuRadioItem
                className="items-start gap-2"
                disabled={Boolean(applying) || locked}
                key={preset.id}
                value={preset.id}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-xs text-foreground">
                    {applying === preset.id && <GlyphSpinner className="opacity-50" spinner="braille" />}
                    {preset.name || preset.id}
                  </span>
                  {preset.description && (
                    <span className="text-[0.6875rem] leading-snug text-(--ui-text-tertiary)">{preset.description}</span>
                  )}
                  {preset.toolset_summary && (
                    <span className="text-[0.6875rem] leading-snug text-(--ui-text-tertiary) opacity-70">
                      {copy.toolsLabel}: {preset.toolset_summary}
                    </span>
                  )}
                  {preset.skills_summary && (
                    <span className="text-[0.6875rem] leading-snug text-(--ui-text-tertiary) opacity-70">
                      {copy.skillsLabel}: {preset.skills_summary}
                    </span>
                  )}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
