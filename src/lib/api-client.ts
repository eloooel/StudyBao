import { logger } from './logger'

/**
 * The one place this app talks HTTP directly.
 *
 * `eslint.config.js` blocks a bare `fetch` outside `src/lib/`, and its error message names this
 * module. That message was previously pointing at a file that did not exist — nothing in the app
 * had ever called `fetch`, so the rule never fired and nobody noticed. This is the fix: the
 * referenced module is real, so the guidance is true rather than aspirational.
 *
 * ## What does and does not belong here
 *
 * **Firebase/Firestore does not.** Workflow S talks to Firestore through its own SDK, which is
 * covered by the separate `firebase/*` import rule and does not go through `fetch` at all. If you
 * are adding a Firestore call, this is the wrong file.
 *
 * What belongs here is any plain HTTP request — and there is exactly one reason this app would
 * ever make one, which is why the shape below is deliberately small rather than a general-purpose
 * client: **a request that can fail visibly**. `CLAUDE.md` is explicit that "a sync failure must
 * be visible ('not saved since…'). A silently broken sync is a data-loss bug, not an
 * inconvenience." So the job of this module is to turn every network outcome into either a value
 * or an error naming what happened, and never to swallow one.
 *
 * ## What it deliberately does not do
 *
 * - **No retries.** A retry loop that hides its attempts is how a failure becomes invisible, and
 *   this app's failure mode is data loss rather than a slow page. Callers decide.
 * - **No base URL, no auth, no interceptors.** The app has no backend by design (ADR 0006), so
 *   there is no origin to configure and no token to attach.
 * - **No caching.** Dexie is the source of truth (ADR 0001). A second cache here would be a second
 *   copy able to disagree with it.
 */

/**
 * Why a request failed.
 *
 * - `network` — never reached a server. She may be offline; her data is safe locally.
 * - `cancelled` — the caller abandoned it on purpose. Not a failure, and not worth logging.
 * - `http` — the server answered and refused.
 * - `malformed` — the server answered 2xx with a body we could not read.
 */
export type HttpFailureKind = 'network' | 'cancelled' | 'http' | 'malformed'

/** Raised for anything that stops a request producing a usable response. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly kind: HttpFailureKind,
    /** The HTTP status, when there was one. */
    readonly status?: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }

  /**
   * True when the request never reached a server — offline, DNS, or a dropped connection.
   *
   * Derived from `kind` rather than from `status === undefined`, which was the first version and
   * was wrong: a *cancelled* request also has no status, so unmounting a screen reported itself as
   * a network failure. Callers use this to tell "you are offline, your work is safe on this
   * device" from "the server answered and said no", which are different problems for her and for
   * us — and a cancellation is neither.
   */
  get isNetworkFailure(): boolean {
    return this.kind === 'network'
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  /** Caller-owned cancellation. Use for a request that a screen may abandon. */
  signal?: AbortSignal
}

/**
 * Make a request and return its parsed JSON body.
 *
 * Rejects with an `HttpError` in every failure case: a non-2xx status, an unreachable server, an
 * aborted request, or a body that is not JSON. Never resolves with `undefined` for a failure —
 * a caller that forgets to check a return value gets a rejection, not a silent no-op.
 */
export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, signal } = options

  let response: Response
  try {
    response = await fetch(url, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
    })
  } catch (error) {
    // An abort is the caller's own doing, so it is reported as itself rather than as a failure —
    // otherwise a screen that cancels on unmount would log a scary error every time.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HttpError('The request was cancelled.', 'cancelled')
    }

    // The one place a network failure is logged, so every failure has exactly one entry and no
    // caller has to remember to log it. `logger` is silent in production builds.
    const message = error instanceof Error ? error.message : 'unknown error'
    logger.warn('api-client: request failed before a response', { url, message })
    throw new HttpError("Couldn't reach the server. Your work is saved on this device.", 'network')
  }

  if (!response.ok) {
    logger.warn('api-client: non-2xx response', { url, status: response.status })
    throw new HttpError(
      `The server refused that request (${String(response.status)}).`,
      'http',
      response.status,
    )
  }

  try {
    return (await response.json()) as T
  } catch {
    // A 200 with an unparseable body is still a failure, and treating it as an empty success is
    // how a partial sync looks like a complete one.
    logger.warn('api-client: response body was not JSON', { url, status: response.status })
    throw new HttpError('The server sent something we could not read.', 'malformed', response.status)
  }
}
