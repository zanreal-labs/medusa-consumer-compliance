import { describe, expect, it } from "vitest";
import { isDeletable, retentionCutoff } from "../retention";

const now = new Date("2026-10-01T00:00:00Z");

describe("retention", () => {
  it("uses the plain retention period without a running reduction", () => {
    expect(retentionCutoff({ now, retentionDays: 400, windowDays: 30 }).toISOString()).toBe("2025-08-27T00:00:00.000Z");
  });

  it("keeps what a long running reduction still needs", () => {
    const cutoff = retentionCutoff({ now, reductionStartedAt: new Date("2024-01-01T00:00:00Z"), retentionDays: 400, windowDays: 30 });
    expect(cutoff.toISOString()).toBe("2023-12-01T00:00:00.000Z");
  });

  it("never deletes an open row", () => {
    expect(isDeletable({ valid_to: null }, now)).toBe(false);
    expect(isDeletable({ valid_to: new Date("2026-09-30T00:00:00Z") }, now)).toBe(true);
    expect(isDeletable({ valid_to: now }, now)).toBe(false);
  });
});
