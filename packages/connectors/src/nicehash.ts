import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { MiningSnapshot, WorkerStatus } from "./types";

export type NicehashCredentials = {
  apiKey: string;
  apiSecret: string;
  organizationId: string;
};

const RIGS_PATH = "/main/api/v2/mining/rigs2";

export function assertNicehashReadPath(path: string): void {
  const clean = path.split("?")[0] ?? "";
  if (clean !== RIGS_PATH && !/^\/main\/api\/v2\/mining\/rig2\/[A-Za-z0-9_-]+$/.test(clean)) {
    throw new Error("path-not-allowed");
  }
}

/** Byte layout from the official NiceHash signing example. */
export function nicehashSigningInput(input: {
  apiKey: string;
  time: string;
  nonce: string;
  organizationId: string;
  method?: string;
  path: string;
  query?: string;
}): Uint8Array {
  assertNicehashReadPath(input.path);
  const fields = [
    input.apiKey,
    input.time,
    input.nonce,
    "",
    input.organizationId,
    "",
    (input.method ?? "GET").toUpperCase(),
    input.path,
    input.query ?? "",
  ];
  return utf8ToBytes(fields.join("\u0000"));
}

export function signNicehash(credentials: NicehashCredentials, input: { time: string; nonce: string; path: string; query?: string }): string {
  const mac = hmac(
    sha256,
    utf8ToBytes(credentials.apiSecret),
    nicehashSigningInput({ ...credentials, ...input }),
  );
  return bytesToHex(mac);
}

function statusFrom(minerStatus: string, hashrate: number): WorkerStatus {
  const value = minerStatus.toUpperCase();
  if (["OFFLINE", "STOPPED", "DISABLED", "ERROR"].includes(value)) return "offline";
  if (value === "MINING" && hashrate <= 0) return "degraded";
  if (value === "MINING") return "online";
  return "unknown";
}

export function parseNicehashRigs(body: unknown, label = "NiceHash"): MiningSnapshot {
  const json = body as {
    unpaidAmount?: string;
    miningRigs?: Array<{
      rigId?: string;
      name?: string;
      minerStatus?: string;
      unpaidAmount?: string;
      stats?: Array<{ speedAccepted?: number; algorithm?: { description?: string } }>;
    }>;
  };
  const rigs = json.miningRigs ?? [];
  const workers = rigs.map((rig, index) => {
    const hashrateHs = (rig.stats ?? []).reduce((sum, stat) => sum + (Number(stat.speedAccepted) || 0), 0);
    return {
      id: rig.rigId || `rig-${index}`,
      name: rig.name || rig.rigId || `Rig ${index + 1}`,
      status: statusFrom(rig.minerStatus ?? "UNKNOWN", hashrateHs),
      hashrateHs,
      algorithm: rig.stats?.[0]?.algorithm?.description,
    };
  });
  const unpaid = json.unpaidAmount ?? rigs.find((rig) => rig.unpaidAmount)?.unpaidAmount;
  return {
    connectorId: "nicehash",
    label,
    fetchedAt: new Date().toISOString(),
    hashrateHs: workers.reduce((sum, worker) => sum + worker.hashrateHs, 0),
    unpaidBtc: unpaid != null && unpaid !== "" ? Number(unpaid) : undefined,
    workers,
    notes: ["Unpaid amount is reported by NiceHash. It is not a Hashly balance."],
  };
}
