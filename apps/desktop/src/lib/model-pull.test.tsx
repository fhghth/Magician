import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activateLocalModel, type ApiStreamHandle, pullModel } from '@/hermes'
import { I18nProvider } from '@/i18n'

import { useModelPull } from './model-pull'

vi.mock('@/hermes', () => ({
  activateLocalModel: vi.fn(),
  pullModel: vi.fn()
}))

const mockedPullModel = vi.mocked(pullModel)
const mockedActivate = vi.mocked(activateLocalModel)

/** A controllable SSE handle: tests drive events and completion by hand. */
function makeHandle() {
  const listeners = { done: new Set<(err: Error | null) => void>(), events: new Set<(data: unknown) => void>() }

  const handle: ApiStreamHandle<unknown> = {
    dispose: vi.fn(),
    onDone: cb => {
      listeners.done.add(cb)

      return () => listeners.done.delete(cb)
    },
    onEvent: cb => {
      listeners.events.add(cb)

      return () => listeners.events.delete(cb)
    }
  }

  return {
    handle,
    done: (err: Error | null) => {
      for (const cb of [...listeners.done]) {
        cb(err)
      }
    },
    emit: (data: unknown) => {
      for (const cb of [...listeners.events]) {
        cb(data)
      }
    }
  }
}

function renderPull(onDone?: (err: Error | null, tag: string) => void) {
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider initialLocale="en">{children}</I18nProvider>

  return renderHook(() => useModelPull(onDone), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useModelPull', () => {
  it('streams progress events into state while pulling', async () => {
    const { handle, emit } = makeHandle()
    mockedPullModel.mockResolvedValue(handle as never)
    const { result } = renderPull()

    await act(async () => {
      void result.current.pull('qwen3:8b')
    })
    await waitFor(() => expect(result.current.pulling).toBe('qwen3:8b'))

    act(() => emit({ completed: 512, total: 1024, status: 'downloading' }))
    expect(result.current.progress).toBe(50)
    expect(result.current.label).toBe('downloading')
  })

  it('auto-activates the model on clean completion and reports onDone(null, tag)', async () => {
    const { handle, done } = makeHandle()
    mockedPullModel.mockResolvedValue(handle as never)
    mockedActivate.mockResolvedValue({ provider: 'ollama', model: 'qwen3:8b', base_url: '' } as never)
    const onDone = vi.fn()
    const { result } = renderPull(onDone)

    await act(async () => {
      void result.current.pull('qwen3:8b')
    })
    await waitFor(() => expect(result.current.pulling).toBe('qwen3:8b'))

    await act(async () => {
      done(null)
    })

    expect(mockedActivate).toHaveBeenCalledWith('qwen3:8b')
    await waitFor(() => expect(result.current.pulling).toBeNull())
    expect(onDone).toHaveBeenCalledWith(null, 'qwen3:8b')
  })

  it('surfaces pull failures without activating', async () => {
    const { handle, done } = makeHandle()
    mockedPullModel.mockResolvedValue(handle as never)
    const onDone = vi.fn()
    const { result } = renderPull(onDone)

    await act(async () => {
      void result.current.pull('missing:model')
    })
    await waitFor(() => expect(result.current.pulling).toBe('missing:model'))

    await act(async () => {
      done(new Error('runtime not installed'))
    })

    await waitFor(() => expect(result.current.error).toBe('runtime not installed'))
    expect(mockedActivate).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledWith(expect.any(Error), 'missing:model')
  })

  it('surfaces an activate failure as an error with onDone(Error, tag)', async () => {
    const { handle, done } = makeHandle()
    mockedPullModel.mockResolvedValue(handle as never)
    mockedActivate.mockRejectedValue(new Error('server unreachable'))
    const onDone = vi.fn()
    const { result } = renderPull(onDone)

    await act(async () => {
      void result.current.pull('qwen3:8b')
    })
    await waitFor(() => expect(result.current.pulling).toBe('qwen3:8b'))

    await act(async () => {
      done(null)
    })

    await waitFor(() => expect(result.current.error).toBe('server unreachable'))
    expect(onDone).toHaveBeenCalledWith(expect.any(Error), 'qwen3:8b')
  })

  it('cancel disposes the stream and resets state', async () => {
    const { handle } = makeHandle()
    mockedPullModel.mockResolvedValue(handle as never)
    const { result } = renderPull()

    await act(async () => {
      void result.current.pull('qwen3:8b')
    })
    await waitFor(() => expect(result.current.pulling).toBe('qwen3:8b'))

    act(() => result.current.cancel())
    expect(handle.dispose).toHaveBeenCalled()
    expect(result.current.pulling).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('rejects a second pull while one is in flight', async () => {
    const { handle } = makeHandle()
    mockedPullModel.mockResolvedValue(handle as never)
    const { result } = renderPull()

    await act(async () => {
      void result.current.pull('qwen3:8b')
    })
    await waitFor(() => expect(result.current.pulling).toBe('qwen3:8b'))

    await act(async () => {
      void result.current.pull('another:model')
    })

    expect(mockedPullModel).toHaveBeenCalledTimes(1)
  })
})
