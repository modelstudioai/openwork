/**
 * Minimal Chrome DevTools Protocol (CDP) client.
 *
 * Zero external dependencies: uses Bun's built-in `fetch` (for HTTP target
 * discovery) and the global `WebSocket` client (for the CDP message channel).
 *
 * It connects directly to a *page* target's `webSocketDebuggerUrl`, which means
 * `Runtime`, `Page`, and `DOM` domains are usable immediately without going
 * through `Target.attachToTarget`.
 */

export interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** List all inspectable targets exposed by a `--remote-debugging-port` endpoint. */
export async function listTargets(port: number): Promise<CdpTarget[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) {
    throw new Error(`CDP /json/list failed with HTTP ${res.status}`);
  }
  return (await res.json()) as CdpTarget[];
}

/** Returns true once the CDP HTTP endpoint answers (i.e. the browser is up). */
export async function isEndpointReady(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

export interface WaitForOptions {
  timeoutMs?: number;
  pollMs?: number;
  message?: string;
}

/**
 * A connected CDP session bound to a single page target. The public surface is
 * intentionally small and DOM-centric — enough to drive a real UI flow and
 * assert on what the user would see.
 */
export class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private closed = false;

  private constructor(
    private readonly ws: WebSocket,
    readonly target: CdpTarget,
  ) {}

  /** Open a CDP session against a page target's debugger WebSocket URL. */
  static attach(target: CdpTarget): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      const session = new CdpSession(ws, target);

      const onOpenError = (event: Event) => {
        reject(new Error(`CDP WebSocket error: ${(event as ErrorEvent)?.message ?? 'unknown'}`));
      };

      ws.addEventListener('open', () => {
        ws.removeEventListener('error', onOpenError);
        resolve(session);
      });
      ws.addEventListener('error', onOpenError);
      ws.addEventListener('message', (event: MessageEvent) => {
        session.handleMessage(typeof event.data === 'string' ? event.data : '');
      });
      ws.addEventListener('close', () => session.handleClose());
    });
  }

  private handleMessage(raw: string): void {
    if (!raw) return;
    let obj: { id?: number; error?: { message?: string }; result?: unknown };
    try {
      obj = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof obj.id !== 'number') return; // event, not a command reply
    const entry = this.pending.get(obj.id);
    if (!entry) return;
    this.pending.delete(obj.id);
    clearTimeout(entry.timer);
    if (obj.error) {
      entry.reject(new Error(obj.error.message ?? 'CDP command failed'));
    } else {
      entry.resolve(obj.result);
    }
  }

  private handleClose(): void {
    this.closed = true;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('CDP session closed before reply'));
    }
    this.pending.clear();
  }

  /** Send a raw CDP command and await its reply. */
  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 30000,
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error('CDP session is closed'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Evaluate a JS expression in the page and return its value (JSON-serialized).
   * Pass an IIFE for multi-statement logic. Promises are awaited.
   */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<{
      result?: { value?: T };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'unknown error';
      throw new Error(`evaluate failed: ${detail}`);
    }
    return result.result?.value as T;
  }

  /** Poll an expression until it is truthy, or throw on timeout. */
  async waitForFunction(expression: string, options: WaitForOptions = {}): Promise<void> {
    const { timeoutMs = 15000, pollMs = 200, message } = options;
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < timeoutMs) {
      try {
        if (await this.evaluate<boolean>(`!!(${expression})`)) return;
      } catch (err) {
        lastError = err;
      }
      await Bun.sleep(pollMs);
    }
    const suffix = lastError ? ` (last error: ${String(lastError)})` : '';
    throw new Error(message ?? `waitForFunction timed out after ${timeoutMs}ms: ${expression}${suffix}`);
  }

  /** Wait until a CSS selector matches at least one element. */
  waitForSelector(selector: string, options: WaitForOptions = {}): Promise<void> {
    return this.waitForFunction(`document.querySelector(${JSON.stringify(selector)})`, {
      message: `selector not found within timeout: ${selector}`,
      ...options,
    });
  }

  /** Wait for a selector, then click the first matching element. */
  async click(selector: string, options: WaitForOptions = {}): Promise<void> {
    await this.waitForSelector(selector, options);
    const clicked = await this.evaluate<boolean>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`,
    );
    if (!clicked) throw new Error(`click target disappeared: ${selector}`);
  }

  /** Read `textContent` of the first matching element (null if absent). */
  getText(selector: string): Promise<string | null> {
    return this.evaluate<string | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent : null; })()`,
    );
  }

  title(): Promise<string> {
    return this.evaluate<string>('document.title');
  }

  url(): Promise<string> {
    return this.evaluate<string>('location.href');
  }

  /** Capture a PNG screenshot of the page and write it to `filePath`. */
  async screenshot(filePath: string): Promise<void> {
    await this.send('Page.enable');
    const { data } = await this.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await Bun.write(filePath, Buffer.from(data, 'base64'));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
    this.closed = true;
  }
}
