import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  activateLocalModel,
  createModel,
  getLocalModels,
  getLocalRuntimes,
  importGguf,
  ollamaInstall,
  pullModel,
  pullModelFromUrl,
  removeLocalModel,
  setModelThinking,
  startOllama,
  stopOllama,
  type ApiStreamHandle,
  type OllamaInstallProgress,
  type OllamaPullProgress
} from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Check, Cpu, Download, FolderOpen, Globe, Loader2, Pause, Play, Plus, Trash2, X, Zap } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { OllamaModel, OllamaRuntimeStatus } from '@/types/hermes'

import { EmptyState, Pill, SectionHeading, SettingsContent, SettingsSkeleton } from './primitives'

const REFRESH_INTERVAL_MS = 5000

// Ollama install SSE stages are fixed internal keys; map them to display text.
const INSTALL_STAGE_LABELS: Record<string, string> = {
  download: 'Downloading',
  extract: 'Extracting',
  done: 'Done'
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return ''
  }

  if (bytes >= 1024 ** 4) {
    return `${(bytes / 1024 ** 4).toFixed(1)} TB`
  }

  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }

  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  }

  return `${(bytes / 1024).toFixed(0)} KB`
}

interface StreamProgress {
  label: string
  percent: number
}

function ProgressBar({ label, percent }: StreamProgress) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="tabular-nums">{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  )
}

interface LocalModelsSettingsProps {
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
}

type BusyAction = 'install' | 'start' | 'stop' | null

export function LocalModelsSettings({ onConfigSaved, onMainModelChanged }: LocalModelsSettingsProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [currentModel, setCurrentModel] = useState('')
  const [currentIsLocal, setCurrentIsLocal] = useState(false)
  const [runtime, setRuntime] = useState<OllamaRuntimeStatus | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<StreamProgress | null>(null)
  const [pullProgress, setPullProgress] = useState<StreamProgress | null>(null)
  const [urlProgress, setUrlProgress] = useState<StreamProgress | null>(null)
  const [tag, setTag] = useState('')
  const [ggufPath, setGgufPath] = useState('')
  const [ggufName, setGgufName] = useState('')
  const [url, setUrl] = useState('')
  const [urlName, setUrlName] = useState('')
  const [importing, setImporting] = useState(false)
  const [createName, setCreateName] = useState('')
  const [modelfile, setModelfile] = useState('')
  const [creating, setCreating] = useState(false)
  const refreshTimer = useRef<number | null>(null)
  const streamRef = useRef<null | ApiStreamHandle<unknown>>(null)

  // Any active SSE stream suppresses the silent 5s poll (it would clobber the
  // optimistic progress state mid-flight). The stream's onDone refreshes.
  const streaming = Boolean(installProgress || pullProgress || urlProgress)

  async function refresh() {
    try {
      const [list, runtimeInfo] = await Promise.all([getLocalModels(), getLocalRuntimes()])
      setModels(list.models)
      setCurrentModel(list.current.model)
      setCurrentIsLocal(list.current.is_local)
      setRuntime(runtimeInfo.ollama)
    } catch (err) {
      // Polling failures (backend restarting, brief connection blips) must not
      // toast on every 5s tick — only surface the first (initial load) failure.
      if (loading) {
        notifyError(err, t.settings.localModels.sectionTitle)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()

    refreshTimer.current = window.setInterval(() => {
      if (!streamRef.current) {
        void refresh()
      }
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (refreshTimer.current) {
        window.clearInterval(refreshTimer.current)
        refreshTimer.current = null
      }
      streamRef.current?.dispose()
      streamRef.current = null
    }
  }, [])

  // Wire a stream: register the handle, feed progress state, and on terminal
  // outcome clear progress + refresh. Returns the handle for dispose.
  async function runStream<T>(
    start: () => Promise<ApiStreamHandle<T>>,
    setProgress: (p: StreamProgress | null) => void,
    onDone: (err: null | Error) => void
  ) {
    try {
      const handle = await start()
      streamRef.current = handle as ApiStreamHandle<unknown>
      handle.onEvent(data => setProgress(progressFromEvent(data)))
      handle.onDone(err => {
        streamRef.current = null
        setProgress(null)
        onDone(err)
      })

      return handle
    } catch (err) {
      streamRef.current = null
      setProgress(null)
      onDone(err instanceof Error ? err : new Error(String(err)))

      return null
    }
  }

  function progressFromEvent(data: unknown): StreamProgress {
    const ev = data as { stage?: string; progress?: number; completed?: number; total?: number; status?: string }
    const percent =
      (ev.progress != null ? ev.progress : ev.total && ev.completed != null ? ev.completed / ev.total : 0) * 100

    if (ev.stage != null) {
      return { label: INSTALL_STAGE_LABELS[ev.stage] ?? ev.stage, percent }
    }

    return { label: ev.status ?? '', percent }
  }

  async function handleInstall() {
    const lm = t.settings.localModels
    setBusy('install')
    setInstallProgress({ label: lm.installing, percent: 0 })

    const handle = await runStream<OllamaInstallProgress>(
      () => ollamaInstall(),
      setInstallProgress,
      err => {
        setBusy(null)
        if (err) {
          notifyError(err, lm.install)
          void refresh()
        }
      }
    )

    if (!handle) {
      return
    }

    handle.onDone(err => {
      if (!err) {
        notify({ kind: 'success', message: lm.install })
        void refresh()
      }
    })
  }

  async function handleStart() {
    setBusy('start')

    try {
      const result = await startOllama()
      setRuntime(result.status)
      triggerHaptic('success')
      void refresh()
    } catch (err) {
      notifyError(err, t.settings.localModels.start)
    } finally {
      setBusy(null)
    }
  }

  async function handleStop() {
    setBusy('stop')

    try {
      const result = await stopOllama()
      setRuntime(result.status)
      triggerHaptic('selection')
      void refresh()
    } catch (err) {
      notifyError(err, t.settings.localModels.stop)
    } finally {
      setBusy(null)
    }
  }

  async function handlePull() {
    const modelTag = tag.trim()

    if (!modelTag) {
      return
    }

    setPullProgress({ label: t.settings.localModels.pulling, percent: 0 })

    const handle = await runStream<OllamaPullProgress>(
      () => pullModel(modelTag),
      setPullProgress,
      err => {
        if (err) {
          notifyError(err, t.settings.localModels.pull)
          void refresh()
        }
      }
    )

    if (!handle) {
      return
    }

    handle.onDone(err => {
      if (!err) {
        setTag('')
        notify({ kind: 'success', message: modelTag })
        void refresh()
      }
    })
  }

  async function handlePullFromUrl() {
    const modelUrl = url.trim()

    if (!modelUrl) {
      return
    }

    setUrlProgress({ label: t.settings.localModels.importing, percent: 0 })

    const handle = await runStream<OllamaPullProgress>(
      () => pullModelFromUrl(modelUrl, urlName.trim() || undefined),
      setUrlProgress,
      err => {
        if (err) {
          notifyError(err, t.settings.localModels.importUrl)
          void refresh()
        }
      }
    )

    if (!handle) {
      return
    }

    handle.onDone(err => {
      if (!err) {
        setUrl('')
        setUrlName('')
        notify({ kind: 'success', message: t.settings.localModels.importUrl })
        void refresh()
      }
    })
  }

  async function handlePickGguf() {
    const picked = await window.hermesDesktop?.selectPaths({
      title: t.settings.localModels.ggufTitle,
      filters: [{ name: 'GGUF / Safetensors model', extensions: ['gguf', 'safetensors'] }],
      multiple: false
    })

    const filePath = picked?.[0]

    if (filePath) {
      setGgufPath(filePath)
    }
  }

  async function handleImportGguf() {
    if (!ggufPath) {
      return
    }

    setImporting(true)

    try {
      await importGguf({ file_path: ggufPath, name: ggufName.trim() || undefined })
      setGgufPath('')
      setGgufName('')
      triggerHaptic('success')
      notify({ kind: 'success', message: t.settings.localModels.importFile })
      void refresh()
    } catch (err) {
      notifyError(err, t.settings.localModels.importFile)
    } finally {
      setImporting(false)
    }
  }

  async function handleActivate(model: OllamaModel) {
    setActingId(model.id)

    try {
      const result = await activateLocalModel(model.id)
      setCurrentModel(result.model)
      setCurrentIsLocal(true)
      onMainModelChanged?.(result.provider, result.model)
      onConfigSaved?.()
      triggerHaptic('success')
    } catch (err) {
      notifyError(err, t.settings.localModels.activate)
    } finally {
      setActingId(null)
    }
  }

  async function handleThinking(model: OllamaModel, enabled: boolean) {
    setActingId(model.id)

    try {
      const result = await setModelThinking(model.id, enabled)
      setModels(prev => prev.map(m => (m.id === model.id ? { ...m, thinking: result.thinking } : m)))
      triggerHaptic('selection')
    } catch (err) {
      notifyError(err, t.settings.localModels.thinking)
    } finally {
      setActingId(null)
    }
  }

  async function handleRemove(model: OllamaModel) {
    if (!window.confirm(t.settings.localModels.removeConfirm(model.name))) {
      return
    }

    setActingId(model.id)

    try {
      await removeLocalModel(model.id)
      setModels(prev => prev.filter(m => m.id !== model.id))
      onConfigSaved?.()
      triggerHaptic('success')
    } catch (err) {
      notifyError(err, t.settings.localModels.remove)
    } finally {
      setActingId(null)
    }
  }

  async function handleCreate() {
    const modelName = createName.trim()
    const modelfileText = modelfile.trim()

    if (!modelName || !modelfileText) {
      return
    }

    setCreating(true)

    try {
      await createModel({ name: modelName, modelfile: modelfileText })
      setCreateName('')
      setModelfile('')
      triggerHaptic('success')
      notify({ kind: 'success', message: modelName })
      void refresh()
    } catch (err) {
      notifyError(err, t.settings.localModels.create)
    } finally {
      setCreating(false)
    }
  }

  function cancelStream(setProgress: (p: StreamProgress | null) => void) {
    streamRef.current?.dispose()
    streamRef.current = null
    setProgress(null)
  }

  if (loading) {
    return <SettingsSkeleton sections={[{ heading: true, rows: 2 }]} />
  }

  const lm = t.settings.localModels
  const runtimeAvailable = Boolean(runtime?.available)
  const runtimeRunning = Boolean(runtime?.running)
  const acting = (model: OllamaModel) => actingId === model.id

  return (
    <SettingsContent>
      <div className="space-y-6">
        <section>
          <SectionHeading
            icon={Cpu}
            meta={runtimeAvailable ? (runtimeRunning ? lm.running : lm.stopped) : undefined}
            title={lm.runtimeTitle}
          />
          <div className="grid gap-3 rounded-md border border-border/50 p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {runtimeAvailable ? (
                <>
                  <span className="font-medium text-foreground">{lm.version(runtime?.version || '')}</span>
                  {runtime?.managed && <span>{lm.managed}</span>}
                  {runtime?.host && runtime?.port ? (
                    <span className="font-mono">
                      {runtime.host}:{runtime.port}
                    </span>
                  ) : null}
                  {runtimeRunning && runtime?.gpu ? <span className="max-w-full truncate">{runtime.gpu}</span> : null}
                </>
              ) : (
                <span>{lm.notInstalled}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{lm.runtimeDesc}</p>
            <div className="flex flex-wrap items-center gap-2">
              {!runtimeAvailable ? (
                <Button disabled={busy !== null} onClick={() => void handleInstall()} size="sm">
                  {busy === 'install' ? <Loader2 className="animate-spin" /> : <Download />}
                  {busy === 'install' ? lm.installing : lm.install}
                </Button>
              ) : runtimeRunning ? (
                <Button disabled={busy !== null} onClick={() => void handleStop()} size="sm" variant="outline">
                  {busy === 'stop' ? <Loader2 className="animate-spin" /> : <Pause />}
                  {busy === 'stop' ? lm.stopping : lm.stop}
                </Button>
              ) : (
                <Button disabled={busy !== null} onClick={() => void handleStart()} size="sm">
                  {busy === 'start' ? <Loader2 className="animate-spin" /> : <Play />}
                  {busy === 'start' ? lm.starting : lm.start}
                </Button>
              )}
              {installProgress && (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ProgressBar {...installProgress} />
                  <Button
                    aria-label={lm.cancel}
                    className="shrink-0"
                    disabled={busy !== 'install'}
                    onClick={() => cancelStream(setInstallProgress)}
                    size="icon-sm"
                    title={lm.cancel}
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <SectionHeading
            icon={FolderOpen}
            meta={models.length ? `${models.length}` : undefined}
            title={lm.modelsTitle}
          />
          <p className="mb-2 text-xs text-muted-foreground">{lm.modelsDesc}</p>
          <div className="divide-y divide-border/40 rounded-md border border-border/50">
            {models.length ? (
              models.map(model => (
                <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={model.id}>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{model.name}</span>
                      {model.quant && <Pill>{model.quant}</Pill>}
                      {currentIsLocal && currentModel === model.id && (
                        <Pill tone="primary">
                          <Zap className="size-3" />
                          {lm.active}
                        </Pill>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {model.parameter_size && <span>{model.parameter_size}</span>}
                      {formatBytes(model.size) && <span>{formatBytes(model.size)}</span>}
                      {model.capabilities.includes('tools') && <Pill>{lm.capTools}</Pill>}
                      {model.capabilities.includes('vision') && <Pill>{lm.capVision}</Pill>}
                      {model.capabilities.includes('thinking') && <Pill>{lm.thinking}</Pill>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {model.capabilities.includes('thinking') && (
                      <div className="flex items-center gap-1.5" title={lm.thinkingDesc}>
                        <span className="hidden text-xs text-muted-foreground xl:inline">{lm.thinking}</span>
                        <Switch
                          aria-label={lm.thinking}
                          checked={model.thinking !== false}
                          disabled={acting(model)}
                          onCheckedChange={on => void handleThinking(model, on)}
                          size="xs"
                        />
                      </div>
                    )}
                    {!currentIsLocal || currentModel !== model.id ? (
                      <Button
                        disabled={acting(model)}
                        onClick={() => void handleActivate(model)}
                        size="sm"
                        variant="outline"
                      >
                        {acting(model) ? <Loader2 className="animate-spin" /> : <Zap />}
                        {lm.activate}
                      </Button>
                    ) : null}
                    <Button
                      className="hover:text-destructive"
                      disabled={acting(model)}
                      onClick={() => void handleRemove(model)}
                      size="icon-sm"
                      title={lm.remove}
                      variant="ghost"
                    >
                      {acting(model) ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState description={lm.emptyDesc} title={lm.emptyTitle} />
            )}
          </div>
        </section>

        <section>
          <SectionHeading icon={Plus} title={lm.pullTitle} />
          <div className="grid gap-3 rounded-md border border-border/50 p-3">
            <p className="text-xs text-muted-foreground">{lm.pullDesc}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-border/50 bg-transparent px-2 text-sm outline-none focus:border-primary/60"
                onChange={event => setTag(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !streaming && tag.trim()) {
                    void handlePull()
                  }
                }}
                placeholder={lm.tagPlaceholder}
                spellCheck={false}
                value={tag}
              />
              <Button disabled={!tag.trim() || Boolean(pullProgress)} onClick={() => void handlePull()} size="sm">
                {pullProgress ? <Loader2 className="animate-spin" /> : <Download />}
                {pullProgress ? lm.pulling : lm.pull}
              </Button>
              {pullProgress && (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ProgressBar {...pullProgress} />
                  <Button
                    aria-label={lm.cancel}
                    className="shrink-0"
                    onClick={() => cancelStream(setPullProgress)}
                    size="icon-sm"
                    title={lm.cancel}
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <SectionHeading icon={FolderOpen} title={lm.ggufTitle} />
          <div className="grid gap-3 rounded-md border border-border/50 p-3">
            <p className="text-xs text-muted-foreground">{lm.ggufDesc}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={importing} onClick={() => void handlePickGguf()} size="sm" variant="outline">
                <FolderOpen />
                {ggufPath ? ggufPath.split(/[\\/]/).pop() : lm.chooseFile}
              </Button>
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-border/50 bg-transparent px-2 text-sm outline-none focus:border-primary/60"
                onChange={event => setGgufName(event.target.value)}
                placeholder={lm.namePlaceholder}
                spellCheck={false}
                value={ggufName}
              />
              <Button disabled={!ggufPath || importing} onClick={() => void handleImportGguf()} size="sm">
                {importing ? <Loader2 className="animate-spin" /> : <Check />}
                {importing ? lm.importing : lm.importFile}
              </Button>
            </div>
          </div>
        </section>

        <section>
          <SectionHeading icon={Globe} title={lm.urlTitle} />
          <div className="grid gap-3 rounded-md border border-border/50 p-3">
            <p className="text-xs text-muted-foreground">{lm.urlDesc}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-border/50 bg-transparent px-2 font-mono text-xs outline-none focus:border-primary/60"
                onChange={event => setUrl(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !urlProgress && url.trim()) {
                    void handlePullFromUrl()
                  }
                }}
                placeholder={lm.urlPlaceholder}
                spellCheck={false}
                value={url}
              />
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-border/50 bg-transparent px-2 text-sm outline-none focus:border-primary/60"
                onChange={event => setUrlName(event.target.value)}
                placeholder={lm.namePlaceholder}
                spellCheck={false}
                value={urlName}
              />
              <Button disabled={!url.trim() || Boolean(urlProgress)} onClick={() => void handlePullFromUrl()} size="sm">
                {urlProgress ? <Loader2 className="animate-spin" /> : <Download />}
                {urlProgress ? lm.importing : lm.importUrl}
              </Button>
              {urlProgress && (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ProgressBar {...urlProgress} />
                  <Button
                    aria-label={lm.cancel}
                    className="shrink-0"
                    onClick={() => cancelStream(setUrlProgress)}
                    size="icon-sm"
                    title={lm.cancel}
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <SectionHeading icon={Plus} title={lm.createTitle} />
          <details className="rounded-md border border-border/50">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
              {lm.createDesc}
            </summary>
            <div className="grid gap-3 border-t border-border/40 p-3">
              <input
                className="h-8 w-full rounded-md border border-border/50 bg-transparent px-2 text-sm outline-none focus:border-primary/60"
                onChange={event => setCreateName(event.target.value)}
                placeholder={lm.namePlaceholder}
                spellCheck={false}
                value={createName}
              />
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-border/50 bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-primary/60"
                onChange={event => setModelfile(event.target.value)}
                placeholder={lm.modelfilePlaceholder}
                spellCheck={false}
                value={modelfile}
              />
              <div className="flex justify-end">
                <Button
                  disabled={!createName.trim() || !modelfile.trim() || creating}
                  onClick={() => void handleCreate()}
                  size="sm"
                >
                  {creating ? <Loader2 className="animate-spin" /> : <Check />}
                  {creating ? lm.creating : lm.create}
                </Button>
              </div>
            </div>
          </details>
        </section>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', runtimeRunning ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
          {runtimeRunning ? lm.running : lm.stopped}
        </div>
      </div>
    </SettingsContent>
  )
}
