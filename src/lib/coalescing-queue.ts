/**
 * Collect variant ids from a burst of events and flush them once.
 *
 * A single admin save emits several events (product, variants, prices) within
 * milliseconds, and a price list edit can emit hundreds. Recording on each
 * would query the pricing module hundreds of times for the same answer. The
 * queue waits for `quietMs` of silence (capped at `maxWaitMs` from the first
 * event) and flushes once; flushes never overlap. A whole-catalog request
 * absorbs any pending ids.
 *
 * In-memory by design: a lost burst (process restart) is picked up by the
 * hourly sweep, which is the backstop for every path an event cannot cover.
 */
export interface CoalescingQueueOptions {
  flush: (variantIds: string[] | null) => Promise<void>;
  onError: (error: unknown) => void;
  quietMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface CoalescingQueue {
  add: (variantIds: readonly string[]) => void;
  addAll: () => void;
  settled: () => Promise<void>;
}

export function createCoalescingQueue(options: CoalescingQueueOptions): CoalescingQueue {
  const {
    clearTimer = clearTimeout,
    flush,
    maxWaitMs = 30_000,
    now = Date.now,
    onError,
    quietMs = 2_000,
    setTimer = setTimeout,
  } = options;
  const pending = new Set<string>();
  let all = false;
  let timer: unknown;
  let burstStartedAt = 0;
  let running: Promise<void> = Promise.resolve();

  const fire = (): void => {
    timer = undefined;
    if (!all && pending.size === 0) {
      return;
    }
    const ids = all ? null : [...pending];
    all = false;
    pending.clear();
    running = running.then(() => flush(ids)).catch(onError);
  };

  const schedule = (): void => {
    if (timer !== undefined) {
      clearTimer(timer);
    }
    const remaining = maxWaitMs - (now() - burstStartedAt);
    timer = setTimer(fire, Math.max(0, Math.min(quietMs, remaining)));
    (timer as { unref?: () => void } | undefined)?.unref?.();
  };

  const start = (): void => {
    if (!all && pending.size === 0) {
      burstStartedAt = now();
    }
  };

  return {
    add: (variantIds) => {
      if (variantIds.length === 0) {
        return;
      }
      start();
      if (!all) {
        variantIds.forEach((id) => pending.add(id));
      }
      schedule();
    },
    addAll: () => {
      start();
      all = true;
      pending.clear();
      schedule();
    },
    settled: async () => {
      await running;
    },
  };
}
