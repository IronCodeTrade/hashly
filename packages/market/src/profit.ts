/** Block subsidy used until the 2028 halving. Callers may override it. */
export const DEFAULT_BLOCK_REWARD_BTC = 3.125;
export const BLOCKS_PER_DAY = 144;

export type Currency = "USD" | "EUR" | "PLN";

export type MarketData = {
  live: boolean;
  source: string;
  fetchedAt: string;
  btc: Record<Currency, number>;
  difficulty: number;
  blockRewardBtc: number;
  notes: string[];
};

export const FALLBACK_MARKET: MarketData = {
  live: false,
  source: "bundled-fallback",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  btc: { USD: 95_000, EUR: 88_000, PLN: 380_000 },
  difficulty: 110_000_000_000_000,
  blockRewardBtc: DEFAULT_BLOCK_REWARD_BTC,
  notes: [
    "Bundled fallback prices and difficulty. They are not live and not a quote.",
  ],
};

export type ProfitInput = {
  hashrateThs: number;
  watts: number;
  electricityPerKwh: number;
  currency: Currency;
  poolFeePct: number;
  market: MarketData;
  uptimePct?: number;
};

export type ProfitEstimate = {
  btcPerDay: number;
  revenuePerDay: number;
  powerPerDay: number;
  poolFeePerDay: number;
  netPerDay: number;
  netPerMonth: number;
  hashpricePerThDay: number;
  breakEvenElectricity: number;
  profitable: boolean;
  networkHashrateHs: number;
};

export function networkHashrateHs(difficulty: number): number {
  return (difficulty * 2 ** 32) / 600;
}

export function estimateProfit(input: ProfitInput): ProfitEstimate {
  if (!(input.hashrateThs >= 0) || !(input.watts >= 0) || !(input.electricityPerKwh >= 0)) {
    throw new Error("bad-input");
  }
  if (input.poolFeePct < 0 || input.poolFeePct > 100) throw new Error("bad-fee");
  if (!(input.market.difficulty > 0) || !(input.market.btc[input.currency] > 0)) throw new Error("bad-market");
  const uptime = (input.uptimePct ?? 100) / 100;
  if (uptime < 0 || uptime > 1) throw new Error("bad-input");
  const hashrateHs = input.hashrateThs * 1e12;
  const networkHs = networkHashrateHs(input.market.difficulty);
  const grossBtc = networkHs === 0 ? 0 : (hashrateHs / networkHs) * BLOCKS_PER_DAY * input.market.blockRewardBtc * uptime;
  const price = input.market.btc[input.currency];
  const grossFiat = grossBtc * price;
  const poolFee = grossFiat * (input.poolFeePct / 100);
  const revenue = grossFiat - poolFee;
  const power = (input.watts / 1000) * 24 * input.electricityPerKwh * uptime;
  const net = revenue - power;
  const perTh = input.hashrateThs > 0 ? (grossBtc * price) / input.hashrateThs : 0;
  const kwhPerDay = (input.watts / 1000) * 24 * uptime;
  return {
    btcPerDay: grossBtc * (1 - input.poolFeePct / 100),
    revenuePerDay: revenue,
    powerPerDay: power,
    poolFeePerDay: poolFee,
    netPerDay: net,
    netPerMonth: net * 30,
    hashpricePerThDay: perTh,
    breakEvenElectricity: kwhPerDay > 0 ? revenue / kwhPerDay : 0,
    profitable: net > 0,
    networkHashrateHs: networkHs,
  };
}

export type Venue = {
  id: string;
  name: string;
  feePct: number;
  note: string;
  sourceUrl: string;
};

/**
 * Published fee assumptions for ranking only. They are not offers, and Hashly
 * does not sell hashrate or route miners to a pool.
 */
export const VENUES: Venue[] = [
  {
    id: "custom",
    name: "Pool fee you entered",
    feePct: 0,
    note: "Uses the fee in the calculator.",
    sourceUrl: "",
  },
  {
    id: "braiins",
    name: "Braiins Pool FPPS",
    feePct: 2.5,
    note: "Published FPPS fee. Braiins OS+ has often been advertised at 0%. Confirm on the pool site before you rely on it.",
    sourceUrl: "https://braiins.com/pool",
  },
  {
    id: "nicehash",
    name: "NiceHash mining fee",
    feePct: 2,
    note: "A typical published NiceHash mining fee. You connect your own account. Hashly does not sell or buy hashrate.",
    sourceUrl: "https://www.nicehash.com/support/mining-help/earnings-and-payments/what-are-nicehash-mining-fees",
  },
];

export type Recommendation = {
  ranked: Array<Venue & { netPerDay: number; profitable: boolean }>;
  bestId: string | null;
  allNegative: boolean;
  disclaimer: string;
};

export function recommend(input: Omit<ProfitInput, "poolFeePct"> & { poolFeePct: number }): Recommendation {
  const venues = VENUES.map((venue) => (venue.id === "custom" ? { ...venue, feePct: input.poolFeePct } : venue));
  const ranked = venues
    .map((venue) => {
      const estimate = estimateProfit({ ...input, poolFeePct: venue.feePct });
      return { ...venue, netPerDay: estimate.netPerDay, profitable: estimate.profitable };
    })
    .sort((a, b) => b.netPerDay - a.netPerDay);
  const best = ranked[0];
  const allNegative = ranked.every((venue) => !venue.profitable);
  return {
    ranked,
    bestId: allNegative || !best ? null : best.id,
    allNegative,
    disclaimer:
      "This ranks public fee assumptions on your hashrate and power cost. It is an estimate. Price, difficulty, downtime, and fees move. It is not a promise of profit and not a recommendation to buy hashrate.",
  };
}
