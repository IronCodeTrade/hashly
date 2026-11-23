import type { MiningSnapshot, WorkerStatus } from "./types";
import { toHashrateHs } from "./units";

export const BRAIINS_URLS = {
  profile: "https://pool.braiins.com/accounts/profile/json/btc/",
  workers: "https://pool.braiins.com/accounts/workers/json/btc",
} as const;

const STATE: Record<string, WorkerStatus> = {
  ok: "online",
  low: "degraded",
  off: "offline",
  dis: "unknown",
};

export function parseBraiins(profile: unknown, workersBody: unknown, label = "Braiins Pool"): MiningSnapshot {
  const profileJson = profile as { btc?: { hash_rate_unit?: string; hash_rate_5m?: number; current_balance?: string; estimated_reward?: string } };
  const workersJson = workersBody as {
    btc?: { workers?: Record<string, { state?: string; hash_rate_unit?: string; hash_rate_5m?: number; last_share?: number }> };
  };
  const entries = Object.entries(workersJson.btc?.workers ?? {});
  const workers = entries.map(([name, worker]) => ({
    id: name,
    name,
    status: STATE[worker.state ?? ""] ?? "unknown",
    hashrateHs: toHashrateHs(Number(worker.hash_rate_5m) || 0, worker.hash_rate_unit || "Gh/s"),
    lastShareAt: worker.last_share ? new Date(worker.last_share * 1000).toISOString() : undefined,
    algorithm: "SHA-256",
  }));
  const fromWorkers = workers.reduce((sum, worker) => sum + worker.hashrateHs, 0);
  const fromProfile = toHashrateHs(Number(profileJson.btc?.hash_rate_5m) || 0, profileJson.btc?.hash_rate_unit || "Gh/s");
  const balance = Number(profileJson.btc?.current_balance);
  return {
    connectorId: "braiins",
    label,
    fetchedAt: new Date().toISOString(),
    hashrateHs: fromWorkers || fromProfile,
    unpaidBtc: Number.isFinite(balance) ? balance : undefined,
    workers,
    notes: [
      "Rewards are reported by Braiins Pool and stay in your pool account until you withdraw them there.",
      "Braiins does not offer a stable read API for buying hashpower. This connector does not sell hashrate.",
    ],
  };
}
