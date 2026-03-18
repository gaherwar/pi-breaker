// __tests__/zones.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ZoneClassifier, Zone, POLL_INTERVALS } from "../extensions/zones";
import type { SystemSignals } from "../extensions/signals";

function makeSignals(overrides: Partial<SystemSignals> = {}): SystemSignals {
  return {
    swapout_rate: 0,
    swapin_rate: 0,
    decomp_rate: 0,
    pressure_level: 1,
    memorystatus_level: 50,
    swap_used_mb: 0,
    swap_free_mb: 5000,
    compression_ratio: 2.0,
    ...overrides,
  };
}

describe("ZoneClassifier", () => {
  let classifier: ZoneClassifier;

  beforeEach(() => {
    classifier = new ZoneClassifier();
  });

  // --- Single reading classification ---

  it("classifies ratio < 2 with no swap as GREEN", () => {
    classifier.update(1.5, makeSignals());
    expect(classifier.zone).toBe(Zone.GREEN);
  });

  it("classifies ratio 2-5 with swapout as YELLOW", () => {
    classifier.update(3.0, makeSignals({ swapout_rate: 100 }));
    expect(classifier.zone).toBe(Zone.YELLOW);
  });

  it("classifies ratio 5-12 with swapout as ORANGE", () => {
    classifier.update(7.0, makeSignals({ swapout_rate: 500 }));
    expect(classifier.zone).toBe(Zone.ORANGE);
  });

  it("classifies ratio > 12 as RED (not yet confirmed)", () => {
    classifier.update(15.0, makeSignals());
    expect(classifier.zone).toBe(Zone.RED);
    expect(classifier.confirmed).toBe(false);
  });

  it("classifies pressure_level 4 as RED (not yet confirmed)", () => {
    classifier.update(1.0, makeSignals({ pressure_level: 4 }));
    expect(classifier.zone).toBe(Zone.RED);
    expect(classifier.confirmed).toBe(false);
  });

  it("RED requires 3 consecutive polls to confirm", () => {
    classifier.update(15.0, makeSignals());
    expect(classifier.confirmed).toBe(false);
    classifier.update(15.0, makeSignals());
    expect(classifier.confirmed).toBe(false);
    classifier.update(15.0, makeSignals());
    expect(classifier.confirmed).toBe(true);
  });

  it("ratio 3 without swapout stays GREEN (no swap confirmation)", () => {
    classifier.update(3.0, makeSignals({ swapout_rate: 0 }));
    expect(classifier.zone).toBe(Zone.GREEN);
  });

  it("ratio 7 without swapout stays GREEN (no swap confirmation)", () => {
    classifier.update(7.0, makeSignals({ swapout_rate: 0 }));
    expect(classifier.zone).toBe(Zone.GREEN);
  });

  // --- Confirmation ---

  it("is not confirmed after 1 reading (non-RED)", () => {
    classifier.update(3.0, makeSignals({ swapout_rate: 100 }));
    expect(classifier.confirmed).toBe(false);
  });

  it("is not confirmed after 2 consecutive readings", () => {
    classifier.update(3.0, makeSignals({ swapout_rate: 100 }));
    classifier.update(3.0, makeSignals({ swapout_rate: 100 }));
    expect(classifier.confirmed).toBe(false);
  });

  it("is confirmed after 3 consecutive readings of same zone", () => {
    classifier.update(3.0, makeSignals({ swapout_rate: 100 }));
    classifier.update(3.0, makeSignals({ swapout_rate: 100 }));
    classifier.update(3.0, makeSignals({ swapout_rate: 100 }));
    expect(classifier.confirmed).toBe(true);
    expect(classifier.zone).toBe(Zone.YELLOW);
  });

  it("resets confirmation counter on zone change", () => {
    classifier.update(3.0, makeSignals({ swapout_rate: 100 })); // YELLOW
    classifier.update(3.0, makeSignals({ swapout_rate: 100 })); // YELLOW (2)
    classifier.update(1.0, makeSignals()); // GREEN — resets counter
    expect(classifier.confirmed).toBe(false);
    expect(classifier.zone).toBe(Zone.GREEN);
  });

  // --- Trend ---

  it("trend is stable with fewer than 2 readings", () => {
    classifier.update(2.0, makeSignals({ swapout_rate: 50 }));
    expect(classifier.trend).toBe("stable");
  });

  it("trend is rising when ratio increases > 15%", () => {
    for (let i = 0; i < 5; i++) {
      classifier.update(2.0 + i * 0.5, makeSignals({ swapout_rate: 100 }));
    }
    expect(classifier.trend).toBe("rising");
  });

  it("trend is falling when ratio decreases > 15%", () => {
    for (let i = 0; i < 5; i++) {
      classifier.update(5.0 - i * 0.5, makeSignals({ swapout_rate: 100 }));
    }
    expect(classifier.trend).toBe("falling");
  });

  it("trend is stable when ratio stays within 15%", () => {
    for (let i = 0; i < 5; i++) {
      classifier.update(3.0 + (i % 2) * 0.1, makeSignals({ swapout_rate: 100 }));
    }
    expect(classifier.trend).toBe("stable");
  });
});

describe("POLL_INTERVALS", () => {
  it("GREEN is 5 seconds", () => {
    expect(POLL_INTERVALS[Zone.GREEN]).toBe(5000);
  });
  it("YELLOW is 2 seconds", () => {
    expect(POLL_INTERVALS[Zone.YELLOW]).toBe(2000);
  });
  it("ORANGE is 1 second", () => {
    expect(POLL_INTERVALS[Zone.ORANGE]).toBe(1000);
  });
  it("RED is 1 second", () => {
    expect(POLL_INTERVALS[Zone.RED]).toBe(1000);
  });
});


