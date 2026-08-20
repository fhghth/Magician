import { useCallback, useRef, useState } from 'react'

import { activateLocalModel, type ApiStreamHandle, pullModel } from '@/hermes'
import { useI18n } from '@/i18n'

/** A pull in flight (or its terminal error), driven by the backend SSE stream. */
export interface ModelPullState {
  /** Tag currently being pulled, null when idle. */
  pulling: string | null
  /** 0..100 progress from the last SSE event. */
  progress: number
  /** Human label from the stream (e.g. "pulling manifest"). */
  label: string
  /** Terminal error message (from a failed pull OR a failed auto-activate). */
  error: string | null
}

/**
 * Pull a model tag from Ollama.com through the backend's SSE stream, then
 * auto-activate it once installed so it shows up in the model catalog
 * (activation is what makes a local model visible to the picker — see
 * ollama_runtime.activate_model). One pull at a time; `cancel` aborts.
 * `onDone` fires on every terminal outcome (success or error).
 */
export function useModelPull(onDone?: (err: Error | null, tag: string) => void) {
  const { t } = useI18n()
  const copy = t.modelPicker
  const [state, setState] = useState<ModelPullState>({ pulling: null, progress: 0, label: '', error: null })
  const handleRef = useRef<ApiStreamHandle<unknown> | null>(null)
  // Latest callback — never re-registered, so streams started by an older
  // closure still report to the current handler.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const finish = useCallback((err: Error | null, tag: string) => {
    onDoneRef.current?.(err, tag)
  }, [])

  const pull = useCallback(
    async (tag: string) => {
      const trimmed = tag.trim()

      if (!trimmed || handleRef.current) {
        return
      }

      setState({ pulling: trimmed, progress: 0, label: copy.pulling(trimmed), error: null })

      try {
        const handle = await pullModel(trimmed)
        handleRef.current = handle
        handle.onEvent(data => {
          const ev = data as { completed?: number; progress?: number; status?: string; total?: number }

          const percent =
            (ev.progress != null ? ev.progress : ev.total && ev.completed != null ? ev.completed / ev.total : 0) * 100

          setState(prev =>
            prev.pulling === trimmed ? { ...prev, label: ev.status ?? prev.label, progress: percent } : prev
          )
        })
        handle.onDone(async err => {
          handleRef.current = null

          if (err) {
            setState({ pulling: null, progress: 0, label: '', error: err.message })
            finish(err, trimmed)

            return
          }

          try {
            // Installed but not yet visible: activate so the catalog picker
            // lists it (providers.ollama + model.default point at it).
            await activateLocalModel(trimmed)
            setState({ pulling: null, progress: 0, label: '', error: null })
            finish(null, trimmed)
          } catch (activateErr) {
            const message = activateErr instanceof Error ? activateErr.message : String(activateErr)
            setState({ pulling: null, progress: 0, label: '', error: message })
            finish(new Error(message), trimmed)
          }
        })
      } catch (err) {
        handleRef.current = null
        const message = err instanceof Error ? err.message : String(err)
        setState({ pulling: null, progress: 0, label: '', error: message })
        finish(new Error(message), trimmed)
      }
    },
    [copy, finish]
  )

  const cancel = useCallback(() => {
    handleRef.current?.dispose()
    handleRef.current = null
    setState({ pulling: null, progress: 0, label: '', error: null })
  }, [])

  return { ...state, cancel, pull }
}
