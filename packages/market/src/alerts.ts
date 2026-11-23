export type WorkerStatus = "online" | "degraded" | "offline" | "unknown";

export type WorkerSnapshot = {
  id: string;
  name: string;
  status: WorkerStatus;
  hashrateHs: number;
};

export type AlertRule = {
  id: string;
  type: "workerOffline" | "hashrateDrop" | "profitBelow";
  threshold?: number;
  channel: "desktop" | "webhook" | "telegram";
  enabled: boolean;
  connectionId?: string;
  lastFiredAt?: number | null;
};

export type AlertHit = {
  ruleId: string;
  type: AlertRule["type"];
  vars: Record<string, string>;
};

const COOLDOWN_MS = 30 * 60 * 1000;

export function evaluateAlerts(input: {
  rules: AlertRule[];
  workers: WorkerSnapshot[];
  previousHashrateHs?: number | null;
  currentHashrateHs: number;
  netPerDay?: number | null;
  now: number;
}): AlertHit[] {
  const hits: AlertHit[] = [];
  for (const rule of input.rules) {
    if (!rule.enabled) continue;
    if (rule.lastFiredAt && input.now - rule.lastFiredAt < COOLDOWN_MS) continue;
    if (rule.type === "workerOffline") {
      const offline = input.workers.filter((worker) => worker.status === "offline");
      if (offline.length) {
        hits.push({
          ruleId: rule.id,
          type: rule.type,
          vars: { count: String(offline.length), names: offline.map((worker) => worker.name).slice(0, 5).join(", ") },
        });
      }
    } else if (rule.type === "hashrateDrop") {
      const previous = input.previousHashrateHs ?? 0;
      const threshold = rule.threshold ?? 20;
      if (previous > 0 && input.currentHashrateHs < previous * (1 - threshold / 100)) {
        const drop = Math.round((1 - input.currentHashrateHs / previous) * 100);
        hits.push({ ruleId: rule.id, type: rule.type, vars: { drop: String(drop), threshold: String(threshold) } });
      }
    } else if (rule.type === "profitBelow") {
      const threshold = rule.threshold ?? 0;
      if (input.netPerDay != null && input.netPerDay < threshold) {
        hits.push({
          ruleId: rule.id,
          type: rule.type,
          vars: { net: input.netPerDay.toFixed(2), threshold: String(threshold) },
        });
      }
    }
  }
  return hits;
}
