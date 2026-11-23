import { useSyncExternalStore } from "react";
import { messages } from "@hashly/i18n";
import { demoSnapshots, type MiningSnapshot } from "@hashly/connectors";
import type { Locale } from "@hashly/i18n";
import { resolveAccess, type Access } from "@hashly/license";
import { FALLBACK_MARKET, evaluateAlerts, type AlertHit, type AlertRule, type Currency, type MarketData } from "@hashly/market";
import type { BrandConfig } from "@hashly/pro";
import {
  PASSPHRASE_CHECK,
  PRODUCTION_KDF,
  b64ToBytes,
  bytesToB64,
  decryptWithKey,
  deriveKey,
  encryptWithKey,
  viewWallet,
  wipe,
  type AccountView,
  type VaultBlob,
  type WalletRecord,
} from "@hashly/wallet";
import { fetchBraiins, fetchCgminer, fetchNicehash, loadMarket, relayAlert } from "./api";

const STORAGE_KEY = "hashly.v1";

export type Connection = {
  id: string;
  connectorId: "nicehash" | "braiins" | "cgminer";
  label: string;
  secret: VaultBlob;
};

export type Persisted = {
  v: 1;
  locale: Locale;
  currency: Currency;
  autoLockMinutes: number;
  proxyUrl: string;
  btcNetwork: "testnet" | "mainnet";
  trialStartedAt: number;
  trialMaxSeen: number;
  licenseToken: string;
  verifier: VaultBlob | null;
  wallet: VaultBlob | null;
  connections: Connection[];
  alerts: AlertRule[];
  alertSecrets: Record<string, VaultBlob>;
  automationMinutes: number;
  brand: BrandConfig | null;
};

type Runtime = {
  ready: boolean;
  unlocked: boolean;
  demo: boolean;
  busy: boolean;
  error: string;
  notice: string;
  view: AccountView | null;
  snapshots: MiningSnapshot[];
  market: MarketData;
  hits: AlertHit[];
  previousHashrate: number | null;
};

const empty = (): Persisted => ({
  v: 1,
  locale: "pl",
  currency: "PLN",
  autoLockMinutes: 5,
  proxyUrl: "",
  btcNetwork: "testnet",
  trialStartedAt: Date.now(),
  trialMaxSeen: Date.now(),
  licenseToken: "",
  verifier: null,
  wallet: null,
  connections: [],
  alerts: [],
  alertSecrets: {},
  automationMinutes: 15,
  brand: null,
});

let persisted = load();
let runtime: Runtime = {
  ready: true,
  unlocked: false,
  demo: false,
  busy: false,
  error: "",
  notice: "",
  view: null,
  snapshots: [],
  market: FALLBACK_MARKET,
  hits: [],
  previousHashrate: null,
};
const session = { key: null as Uint8Array | null };
const listeners = new Set<() => void>();
let cached = { persisted, runtime, access: null as unknown as Access };

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.v !== 1) return empty();
    return { ...empty(), ...parsed, trialStartedAt: parsed.trialStartedAt || Date.now() };
  } catch {
    return empty();
  }
}

function publish(): void {
  cached = { persisted, runtime, access: access() };
  listeners.forEach((listener) => listener());
}

function emit(): void {
  persisted.trialMaxSeen = Math.max(persisted.trialMaxSeen, Date.now());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  publish();
}

function patchRuntime(patch: Partial<Runtime>): void {
  runtime = { ...runtime, ...patch };
  publish();
}

function seal(value: unknown): VaultBlob {
  if (!session.key) throw new Error("locked");
  const blob = encryptWithKey(value, session.key);
  blob.t = PRODUCTION_KDF.t;
  blob.m = PRODUCTION_KDF.m;
  blob.p = PRODUCTION_KDF.p;
  blob.dkLen = PRODUCTION_KDF.dkLen;
  return blob;
}

function openRecord(): WalletRecord | null {
  if (!session.key || !persisted.wallet) return null;
  return decryptWithKey<WalletRecord>(persisted.wallet, session.key);
}

export function access(): Access {
  const now = Math.max(Date.now(), persisted.trialMaxSeen);
  return resolveAccess({
    now,
    trialStartedAt: persisted.trialStartedAt,
    trialMaxSeen: persisted.trialMaxSeen,
    token: persisted.licenseToken || null,
    publicKeyHex: import.meta.env.VITE_HASHLY_LICENSE_PUBLIC_KEY || undefined,
  });
}

cached = { persisted, runtime, access: access() };

export function snapshot() {
  return cached;
}

export function useT() {
  const { persisted } = useHashly();
  return messages(persisted.locale);
}

export function useHashly() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
  );
}

export async function createLock(password: string): Promise<void> {
  patchRuntime({ busy: true, error: "" });
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt, PRODUCTION_KDF);
    const verifier = encryptWithKey(PASSPHRASE_CHECK, key);
    verifier.salt = bytesToB64(salt);
    verifier.t = PRODUCTION_KDF.t;
    verifier.m = PRODUCTION_KDF.m;
    verifier.p = PRODUCTION_KDF.p;
    verifier.dkLen = PRODUCTION_KDF.dkLen;
    session.key = key;
    persisted = { ...persisted, verifier };
    patchRuntime({ unlocked: true, busy: false, demo: false });
    emit();
  } catch (error) {
    patchRuntime({ busy: false, error: error instanceof Error ? error.message : "generic" });
    throw error;
  }
}

export async function unlock(password: string): Promise<void> {
  if (!persisted.verifier) throw new Error("bad-passphrase");
  patchRuntime({ busy: true, error: "" });
  try {
    const key = await deriveKey(password, b64ToBytes(persisted.verifier.salt), persisted.verifier);
    const check = decryptWithKey<string>(persisted.verifier, key);
    if (check !== PASSPHRASE_CHECK) {
      wipe(key);
      throw new Error("bad-passphrase");
    }
    session.key = key;
    const record = openRecord();
    patchRuntime({ unlocked: true, busy: false, demo: false, view: record ? viewWallet(record) : null, error: "" });
    emit();
    await refreshMarket();
    if (persisted.connections.length) await refreshMining();
  } catch (error) {
    patchRuntime({ busy: false, unlocked: false, error: error instanceof Error ? error.message : "bad-passphrase" });
    throw error;
  }
}

export function lock(): void {
  wipe(session.key);
  session.key = null;
  patchRuntime({ unlocked: false, view: null, snapshots: runtime.demo ? runtime.snapshots : [], hits: [] });
}

export async function enterDemo(): Promise<void> {
  patchRuntime({ demo: true, snapshots: demoSnapshots(), error: "", notice: "" });
  await refreshMarket();
}

export function exitDemo(): void {
  patchRuntime({ demo: false, snapshots: [], hits: [] });
}

export function saveWallet(record: WalletRecord): AccountView {
  persisted = { ...persisted, wallet: seal(record) };
  const view = viewWallet(record);
  patchRuntime({ view, notice: "saved" });
  emit();
  return view;
}

export function withWallet<T>(fn: (record: WalletRecord) => T): T {
  const record = openRecord();
  if (!record) throw new Error("locked");
  try {
    return fn(record);
  } finally {
    record.mnemonic = undefined;
    record.bip39Passphrase = undefined;
  }
}

export function updateSettings(patch: Partial<Persisted>): void {
  persisted = { ...persisted, ...patch };
  emit();
  if (patch.proxyUrl != null && window.hashly) {
    void window.hashly.setProxy(patch.proxyUrl);
  }
}

export async function refreshMarket(): Promise<void> {
  patchRuntime({ market: await loadMarket() });
}

export async function addConnection(connectorId: Connection["connectorId"], label: string, secret: Record<string, string>): Promise<void> {
  const gate = access();
  if (persisted.connections.length >= gate.limits.connectors) throw new Error("plan-required");
  const connection: Connection = {
    id: crypto.randomUUID(),
    connectorId,
    label: label || connectorId,
    secret: seal(secret),
  };
  persisted = { ...persisted, connections: [...persisted.connections, connection] };
  emit();
  await refreshMining();
}

export function removeConnection(id: string): void {
  const removed = persisted.connections.find((item) => item.id === id);
  persisted = { ...persisted, connections: persisted.connections.filter((item) => item.id !== id) };
  emit();
  patchRuntime({ snapshots: runtime.snapshots.filter((item) => item.label !== removed?.label) });
}

export async function refreshMining(): Promise<void> {
  if (runtime.demo) {
    patchRuntime({ snapshots: demoSnapshots() });
    return;
  }
  if (!session.key) return;
  patchRuntime({ busy: true, error: "" });
  const gate = access();
  const next: MiningSnapshot[] = [];
  for (const connection of persisted.connections.slice(0, gate.limits.connectors)) {
    try {
      const creds = decryptWithKey<Record<string, string>>(connection.secret, session.key);
      const snapshot =
        connection.connectorId === "nicehash"
          ? await fetchNicehash({ ...creds, label: connection.label })
          : connection.connectorId === "braiins"
            ? await fetchBraiins({ ...creds, label: connection.label })
            : await fetchCgminer({ ...creds, label: connection.label });
      next.push(snapshot);
    } catch {
      next.push({
        connectorId: connection.connectorId,
        label: connection.label,
        fetchedAt: new Date().toISOString(),
        hashrateHs: 0,
        workers: [],
        notes: ["upstream"],
      });
    }
  }
  const hashrate = next.reduce((sum, item) => sum + item.hashrateHs, 0);
  const hits = evaluateAlerts({
    rules: persisted.alerts.filter((rule) => gate.limits.channels.includes(rule.channel)).slice(0, gate.limits.alertRules),
    workers: next.flatMap((item) => item.workers),
    previousHashrateHs: runtime.previousHashrate,
    currentHashrateHs: hashrate,
    now: Date.now(),
  });
  if (hits.length) {
    persisted = {
      ...persisted,
      alerts: persisted.alerts.map((rule) => (hits.some((hit) => hit.ruleId === rule.id) ? { ...rule, lastFiredAt: Date.now() } : rule)),
    };
    void dispatchHits(hits, gate);
  }
  patchRuntime({ busy: false, snapshots: next, hits, previousHashrate: hashrate });
  emit();
}

async function dispatchHits(hits: AlertHit[], gate: Access): Promise<void> {
  for (const hit of hits) {
    const rule = persisted.alerts.find((item) => item.id === hit.ruleId);
    if (!rule) continue;
    const text = `${hit.type}: ${Object.values(hit.vars).join(" ")}`.slice(0, 300);
    if (rule.channel === "desktop") {
      if (window.hashly) await window.hashly.notify("Hashly", text);
      else if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Hashly", { body: text });
    } else if (gate.can("advancedAlerts") && session.key) {
      try {
        const secret = persisted.alertSecrets[rule.id] ? decryptWithKey<Record<string, string>>(persisted.alertSecrets[rule.id], session.key) : {};
        if (rule.channel === "telegram") {
          await relayAlert("telegram", { token: secret.token, chatId: secret.chatId, text });
        } else if (rule.channel === "webhook" && secret.url) {
          await relayAlert("webhook", { url: secret.url, payload: { text, type: hit.type } });
        }
      } catch {
        patchRuntime({ error: "upstream" });
      }
    }
  }
}

export function saveAlert(rule: AlertRule, secret?: Record<string, string>): void {
  const gate = access();
  const exists = persisted.alerts.some((item) => item.id === rule.id);
  const count = exists ? persisted.alerts.length : persisted.alerts.length + 1;
  if (count > gate.limits.alertRules || !gate.limits.channels.includes(rule.channel)) throw new Error("plan-required");
  const alerts = exists ? persisted.alerts.map((item) => (item.id === rule.id ? rule : item)) : [...persisted.alerts, rule];
  const alertSecrets = { ...persisted.alertSecrets };
  if (secret) alertSecrets[rule.id] = seal(secret);
  persisted = { ...persisted, alerts, alertSecrets };
  emit();
}

export function removeAlert(id: string): void {
  const alertSecrets = { ...persisted.alertSecrets };
  delete alertSecrets[id];
  persisted = { ...persisted, alerts: persisted.alerts.filter((item) => item.id !== id), alertSecrets };
  emit();
}

export function reportedHashrateThs(): number {
  return runtime.snapshots.reduce((sum, item) => sum + item.hashrateHs, 0) / 1e12;
}
