import { describe, expect, it } from "vitest";
import { createCoalescingQueue } from "../coalescing-queue";

function harness() {
  let clock = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 0;
  const flushed: (string[] | null)[] = [];
  const queue = createCoalescingQueue({
    clearTimer: (handle) => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index !== -1) {
        timers.splice(index, 1);
      }
    },
    flush: async (ids) => {
      flushed.push(ids);
    },
    maxWaitMs: 1000,
    now: () => clock,
    onError: () => undefined,
    quietMs: 100,
    setTimer: (fn, ms) => {
      nextId += 1;
      timers.push({ at: clock + ms, fn, id: nextId });
      return nextId;
    },
  });
  const advance = async (ms: number) => {
    clock += ms;
    for (const timer of [...timers].filter((entry) => entry.at <= clock)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.fn();
    }
    await queue.settled();
  };
  return { advance, flushed, queue };
}

describe("coalescing queue", () => {
  it("flushes a burst once after a quiet period", async () => {
    const { advance, flushed, queue } = harness();
    queue.add(["a"]);
    await advance(50);
    queue.add(["b", "a"]);
    await advance(99);
    expect(flushed).toEqual([]);
    await advance(1);
    expect(flushed).toEqual([["a", "b"]]);
  });

  it("caps the wait for a continuous stream", async () => {
    const { advance, flushed, queue } = harness();
    for (let i = 0; i < 20; i += 1) {
      queue.add([`v${i}`]);
      await advance(60);
    }
    expect(flushed.length).toBeGreaterThanOrEqual(1);
  });

  it("lets a whole-catalog request absorb pending ids", async () => {
    const { advance, flushed, queue } = harness();
    queue.add(["a"]);
    queue.addAll();
    queue.add(["b"]);
    await advance(100);
    expect(flushed).toEqual([null]);
  });
});
