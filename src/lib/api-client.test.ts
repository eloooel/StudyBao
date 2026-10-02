import { afterEach, describe, expect, it, vi } from 'vitest'

import { HttpError, requestJson } from './api-client'

/**
 * The HTTP client.
 *
 * Small surface, but every branch here is a data-loss path in disguise: the whole reason this
 * module exists is `CLAUDE.md`'s "a sync failure must be visible… a silently broken sync is a
 * data-loss bug, not an inconvenience". So the tests are about the *failures* — that each one
 * rejects rather than resolving with something a caller could mistake for success.
 *
 * `fetch` is stubbed rather than mocked at the module boundary, because the interesting behaviour
 * is how this module reacts to what `fetch` actually does, including not being reachable at all.
 */
const fetchMock = vi.fn<typeof fetch>()

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(): void {
  vi.stubGlobal('fetch', fetchMock)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('requestJson', () => {
  it('returns the parsed body on success', async () => {
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse({ cards: 3 }))

    await expect(requestJson<{ cards: number }>('/api/x')).resolves.toEqual({ cards: 3 })
  })

  it('sends a JSON body and content type when one is given', async () => {
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse({}))

    await requestJson('/api/x', { method: 'POST', body: { front: 'Vitamin C' } })

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"front":"Vitamin C"}')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('sends no body and no content type on a bodyless request', async () => {
    // A GET with `Content-Type: application/json` and the literal body "undefined" is a classic
    // way to make a server reject a request that should have been fine.
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse({}))

    await requestJson('/api/x')

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.body).toBeUndefined()
    expect(init?.headers).not.toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('rejects with a network failure, naming it as one, when the server is unreachable', async () => {
    stubFetch()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await requestJson('/api/x').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(HttpError)
    // The distinction that matters to her: offline means her data is safe locally, a refusal
    // means something else. Callers branch on this.
    expect((error as HttpError).isNetworkFailure).toBe(true)
    // And it must not read like a stack trace.
    expect((error as HttpError).message).toMatch(/saved on this device/)
  })

  it('rejects with the status when the server answers and refuses', async () => {
    stubFetch()
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }))

    const error = await requestJson('/api/x').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(403)
    // A refusal is NOT a network failure — the request got there.
    expect((error as HttpError).isNetworkFailure).toBe(false)
  })

  it('treats a 200 with an unparseable body as a failure, not an empty success', async () => {
    // This is the one that would quietly corrupt a sync: a 200 whose body will not parse reading
    // as "nothing to merge" instead of "we do not know what the server said".
    stubFetch()
    fetchMock.mockResolvedValue(new Response('<html>gateway</html>', { status: 200 }))

    await expect(requestJson('/api/x')).rejects.toThrow(/could not read/)
  })

  it('reports a caller-cancelled request as cancelled, not as a failure', async () => {
    // A screen that cancels on unmount must not log a scary error every time it does.
    stubFetch()
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))

    const error = await requestJson('/api/x').catch((caught: unknown) => caught)

    expect((error as HttpError).message).toMatch(/cancelled/)
    expect((error as HttpError).isNetworkFailure).toBe(false)
  })

  it('passes an abort signal through to fetch', async () => {
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse({}))
    const controller = new AbortController()

    await requestJson('/api/x', { signal: controller.signal })

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('never resolves on failure, so a caller that forgets to check still cannot lose data', async () => {
    stubFetch()
    fetchMock.mockRejectedValue(new Error('boom'))

    // Asserted as a property rather than as one more case: resolving with undefined here is how
    // "the sync silently did nothing" would be written.
    await expect(requestJson('/api/x')).rejects.toBeInstanceOf(HttpError)
  })
})
