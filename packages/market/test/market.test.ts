import { describe, expect, it } from "vitest";
import { FALLBACK_MARKET, estimateProfit, evaluateAlerts, parseMarketPayload, recommend } from "../src/index";

describe("profitability", () => {
  const market = { ...FALLBACK_MARKET, difficulty: 1e14, btc: { USD: 100_000, EUR: 90_000, PLN: 400_000 } };

  it("computes power cost exactly and a deterministic BTC estimate", () => {
    const estimate = estimateProfit({
      hashrateThs: 100,
      watts: 3_000,
      electricityPerKwh: 0.5,
      currency: "USD",
      poolFeePct: 0,
      market,
    });
    expect(estimate.powerPerDay).toBeCloseTo(36, 8);
    const network = (1e14 * 2 ** 32) / 600;
    const btc = ((100e12) / network) * 144 * 3.125;
    expect(estimate.btcPerDay).toBeCloseTo(btc, 10);
    expect(estimate.breakEvenElectricity).toBeCloseTo(estimate.revenuePerDay / 72, 8);
  });

  it("ranks lower pool fees first and says so when every estimate is negative", () => {
    const ranked = recommend({
      hashrateThs: 100,
      watts: 3_000,
      electricityPerKwh: 0.05,
      currency: "USD",
      poolFeePct: 1,
      market,
    });
    expect(ranked.ranked[0]?.feePct).toBeLessThanOrEqual(ranked.ranked[1]?.feePct ?? 100);
    expect(ranked.disclaimer.toLowerCase()).toContain("not a promise");

    const bleak = recommend({
      hashrateThs: 1,
      watts: 10_000,
      electricityPerKwh: 2,
      currency: "USD",
      poolFeePct: 2,
      market,
    });
    expect(bleak.allNegative).toBe(true);
    expect(bleak.bestId).toBeNull();
  });

  it("parses public market payloads and ignores incomplete ones", () => {
    expect(
      parseMarketPayload(
        { bitcoin: { usd: 1, eur: 2, pln: 3 } },
        { currentDifficulty: 5 },
        "2026-02-02T00:00:00.000Z",
      )?.difficulty,
    ).toBe(5);
    expect(parseMarketPayload({}, {})).toBeNull();
  });
});

describe("alerts", () => {
  const rules = [
    { id: "off", type: "workerOffline" as const, channel: "desktop" as const, enabled: true },
    { id: "drop", type: "hashrateDrop" as const, threshold: 25, channel: "desktop" as const, enabled: true },
    { id: "profit", type: "profitBelow" as const, threshold: 0, channel: "telegram" as const, enabled: true },
  ];

  it("fires offline, drop, and profit alerts, then respects the cooldown", () => {
    const hits = evaluateAlerts({
      rules,
      workers: [{ id: "a", name: "rig-a", status: "offline", hashrateHs: 0 }],
      previousHashrateHs: 100,
      currentHashrateHs: 50,
      netPerDay: -1,
      now: 1_000_000,
    });
    expect(hits.map((hit) => hit.type)).toEqual(["workerOffline", "hashrateDrop", "profitBelow"]);
    const quiet = evaluateAlerts({
      rules: rules.map((rule) => ({ ...rule, lastFiredAt: 900_000 })),
      workers: [{ id: "a", name: "rig-a", status: "offline", hashrateHs: 0 }],
      previousHashrateHs: 100,
      currentHashrateHs: 50,
      netPerDay: -1,
      now: 1_000_000,
    });
    expect(quiet).toHaveLength(0);
  });
});
