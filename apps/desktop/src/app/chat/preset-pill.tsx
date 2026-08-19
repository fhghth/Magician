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
import { applySessionPreset, loadPresets, presetLabel, $presetDefault, $presets, $presetsLoading, type RequestGateway } from '@/store/presets'
import type { SessionInfo } from '@/types/hermes'

const PILL = cn(
  'h-6 shrink-0 gap-1 rounded-md px-1.5 text-xs font-normal',
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)

/**
 * Chat-header agent-mode pill. Names the preset the session runs under and
 * opens a menu of every discoverable preset; picking one recomposes the
 * session on the backend (persona + tools) while the conversation stays put.
 * Mirrors the CLI's `/preset` in the desktop's own surface — the backend is
 * authoritative, so the label re-syncs from the session row on reload.
 */
export function PresetPill({ session, request }: { request: RequestGateway; session: SessionInfo | null }) {
  const { t } = useI18n()
  const copy = t.shell.statusbar.presets
  const presets = useStore($presets)
  const defaultPreset = useStore($presetDefault)
  const loading = useStore($presetsLoading)
  const [open, setOpen] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [optimisticId, setOptimisticId] = useState<string | null>(null)

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
    if (!session || value === activeId || applying) {
      return
    }
    setApplying(value)
    void applySessionPreset(session.id, value, request, copy.applyFailed).then(ok => {
      setApplying(null)
      if (ok) {
        setOptimisticId(value)
        setOpen(false)
      }
    })
  }

  return (
    <DropdownMenu onOpenChange={setOpenWithRelease} open={open}>
      <Tip label={copy.openMenu} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button aria-label={copy.ariaLabel(label)} className={PILL} type="button" variant="ghost">
            <SlidersHorizontal className="size-3 shrink-0 opacity-70" />
            <span className="max-w-28 truncate">{loading && !presets ? <GlyphSpinner className="opacity-50" spinner="braille" /> : label}</span>
            <ChevronDown className="size-2.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" className="w-72 p-1" side="bottom" sideOffset={8}>
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
                disabled={Boolean(applying)}
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
                      {preset.toolset_summary}
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
