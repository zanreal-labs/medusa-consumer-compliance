import { describe, expect, it } from "vitest";
import { MAX_PENDING_WITHDRAWALS_PER_ORDER, withdrawalCreationBlock } from "../withdrawal";

const now = new Date("2026-10-20T12:00:00Z");
const future = new Date("2026-10-20T13:00:00Z");
const past = new Date("2026-10-20T11:00:00Z");

describe("withdrawalCreationBlock", () => {
  it("allows the first request on an order", () => {
    expect(withdrawalCreationBlock([], now)).toBeNull();
  });

  it("refuses once the open pending requests reach the cap", () => {
    const pending = Array.from({ length: MAX_PENDING_WITHDRAWALS_PER_ORDER }, () => ({
      confirmation_expires_at: future,
      status: "pending_confirmation",
      whole_order: true,
    }));
    expect(withdrawalCreationBlock(pending, now)).toBe("too_many_pending");
    expect(withdrawalCreationBlock(pending.slice(1), now)).toBeNull();
  });

  it("does not count pending requests whose confirmation window has passed", () => {
    const stale = Array.from({ length: 10 }, () => ({
      confirmation_expires_at: past,
      status: "pending_confirmation",
      whole_order: true,
    }));
    expect(withdrawalCreationBlock(stale, now)).toBeNull();
  });

  it("refuses a new request once the whole order is withdrawn", () => {
    expect(
      withdrawalCreationBlock([{ confirmation_expires_at: null, status: "confirmed", whole_order: true }], now),
    ).toBe("already_withdrawn");
    expect(
      withdrawalCreationBlock([{ confirmation_expires_at: null, status: "processed", whole_order: true }], now),
    ).toBe("already_withdrawn");
  });

  it("still allows withdrawing the rest after a partial withdrawal", () => {
    expect(
      withdrawalCreationBlock([{ confirmation_expires_at: null, status: "confirmed", whole_order: false }], now),
    ).toBeNull();
  });
});
