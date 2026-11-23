import type { MiningSnapshot, WorkerStatus } from "./types";

const ALLOWED = new Set(["summary", "devs", "pools", "version", "coin"]);

export function assertCgminerCommand(command: string): string {
  const clean = command.trim().toLowerCase();
  if (!ALLOWED.has(clean)) throw new Error("command-not-allowed");
  return clean;
}

export function isPrivateHost(host: string): boolean {
  const value = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value.endsWith(".local")) return true;
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function statusFrom(value: string | undefined, hashrate: number): WorkerStatus {
  const text = (value ?? "").toLowerCase();
  if (text.includes("dead") || text.includes("sick")) return "offline";
  if (text.includes("alive") && hashrate <= 0) return "degraded";
  if (text.includes("alive")) return "online";
  return "unknown";
}

export function parseCgminer(summaryText: string, devsText = "", label = "LAN rig"): MiningSnapshot {
  const summary = JSON.parse(summaryText.replaceAll("\u0000", "")) as {
    SUMMARY?: Array<Record<string, number>>;
  };
  const row = summary.SUMMARY?.[0] ?? {};
  const mhs = Number(row["MHS 5s"] ?? row["MHS av"] ?? row["GHS 5s"] ?? 0);
  const unitHs = row["GHS 5s"] != null && row["MHS 5s"] == null ? mhs * 1e9 : mhs * 1e6;
  let workers: MiningSnapshot["workers"] = [];
  if (devsText.trim()) {
    const devs = JSON.parse(devsText.replaceAll("\u0000", "")) as {
      DEVS?: Array<Record<string, string | number>>;
    };
    workers = (devs.DEVS ?? []).map((dev, index) => {
      const devMhs = Number(dev["MHS 5s"] ?? dev["MHS av"] ?? 0);
      return {
        id: String(dev.ID ?? index),
        name: String(dev.Name ?? dev.ID ?? `device-${index}`),
        status: statusFrom(String(dev.Status ?? ""), devMhs),
        hashrateHs: devMhs * 1e6,
        algorithm: "SHA-256",
      };
    });
  }
  return {
    connectorId: "cgminer",
    label,
    fetchedAt: new Date().toISOString(),
    hashrateHs: workers.length ? workers.reduce((sum, worker) => sum + worker.hashrateHs, 0) : unitHs,
    workers,
    notes: ["Read from the miner API on your LAN. Hashly sent summary/devs only and cannot change pools."],
  };
}
