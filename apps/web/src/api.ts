import type { MiningSnapshot } from "@hashly/connectors";
import type { MarketData } from "@hashly/market";
import { FALLBACK_MARKET } from "@hashly/market";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("upstream");
  return response.json() as Promise<T>;
}

export async function loadMarket(): Promise<MarketData> {
  try {
    const response = await fetch("/api/market");
    if (!response.ok) return { ...FALLBACK_MARKET, fetchedAt: new Date().toISOString() };
    return (await response.json()) as MarketData;
  } catch {
    return { ...FALLBACK_MARKET, fetchedAt: new Date().toISOString() };
  }
}

export function fetchNicehash(body: Record<string, string>): Promise<MiningSnapshot> {
  return post("/api/connector/nicehash", body);
}

export function fetchBraiins(body: Record<string, string>): Promise<MiningSnapshot> {
  return post("/api/connector/braiins", body);
}

export function fetchCgminer(body: Record<string, string>): Promise<MiningSnapshot> {
  return post("/api/connector/cgminer", body);
}

export async function fetchUtxos(address: string, network: "testnet" | "mainnet") {
  const response = await fetch(`/api/btc/utxos?network=${network}&address=${encodeURIComponent(address)}`);
  if (!response.ok) throw new Error("upstream");
  return (await response.json()) as Array<{ txid: string; vout: number; valueSats: number }>;
}

export async function broadcastTx(hex: string, network: "testnet" | "mainnet"): Promise<string> {
  const response = await fetch("/api/btc/broadcast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hex, network }),
  });
  if (!response.ok) throw new Error("upstream");
  const body = (await response.json()) as { txid: string };
  return body.txid;
}

export async function relayAlert(channel: "telegram" | "webhook", body: Record<string, unknown>): Promise<void> {
  const response = await fetch(channel === "telegram" ? "/api/alert/telegram" : "/api/alert/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("upstream");
}
