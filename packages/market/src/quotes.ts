import { DEFAULT_BLOCK_REWARD_BTC, FALLBACK_MARKET, type MarketData } from "./profit";

type FetchLike = typeof fetch;

function numberFrom(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseMarketPayload(priceJson: unknown, difficultyJson: unknown, fetchedAt = new Date().toISOString()): MarketData | null {
  const price = priceJson as { bitcoin?: { usd?: unknown; eur?: unknown; pln?: unknown } };
  const usd = numberFrom(price?.bitcoin?.usd);
  const eur = numberFrom(price?.bitcoin?.eur);
  const pln = numberFrom(price?.bitcoin?.pln);
  const body = difficultyJson as { difficulty?: unknown; currentDifficulty?: unknown };
  const difficulty = numberFrom(body?.currentDifficulty) ?? numberFrom(body?.difficulty);
  if (!usd || !eur || !pln || !difficulty) return null;
  return {
    live: true,
    source: "coingecko+mempool.space",
    fetchedAt,
    btc: { USD: usd, EUR: eur, PLN: pln },
    difficulty,
    blockRewardBtc: DEFAULT_BLOCK_REWARD_BTC,
    notes: ["Public market data. Not a quote from Hashly."],
  };
}

export async function fetchPublicMarket(fetchImpl: FetchLike = fetch): Promise<MarketData> {
  try {
    const [priceRes, diffRes] = await Promise.all([
      fetchImpl("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,pln"),
      fetchImpl("https://mempool.space/api/v1/mining/hashrate/3d"),
    ]);
    if (!priceRes.ok || !diffRes.ok) return { ...FALLBACK_MARKET, fetchedAt: new Date().toISOString() };
    const parsed = parseMarketPayload(await priceRes.json(), await diffRes.json());
    return parsed ?? { ...FALLBACK_MARKET, fetchedAt: new Date().toISOString() };
  } catch {
    return { ...FALLBACK_MARKET, fetchedAt: new Date().toISOString() };
  }
}
