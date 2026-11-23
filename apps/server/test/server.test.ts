import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../src/index";

let server: Server | null = null;

async function listen(): Promise<number> {
  const app = createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no-port");
  return address.port;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  if (!server) return;
  await new Promise((resolve) => server?.close(resolve));
  server = null;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubUpstream(handler: (url: string) => Response | Promise<Response>): void {
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("http://127.0.0.1") || String(url).startsWith("http://localhost")) return real(url, init);
    return handler(String(url));
  });
}

describe("local server", () => {
  it("serves health and market data without storing a balance", async () => {
    stubUpstream((url) => {
      if (url.includes("coingecko")) return json({ bitcoin: { usd: 10, eur: 9, pln: 40 } });
      if (url.includes("mining/hashrate")) return json({ currentDifficulty: 123 });
      return json({}, 404);
    });
    const port = await listen();
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(await health.json()).toMatchObject({ ok: true, holdsFunds: false });
    const market = await fetch(`http://127.0.0.1:${port}/api/market`);
    expect(await market.json()).toMatchObject({ live: true, difficulty: 123 });
  });

  it("refuses a public miner host and a cross-site connector call", async () => {
    const port = await listen();
    const badHost = await fetch(`http://127.0.0.1:${port}/api/connector/cgminer`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ host: "8.8.8.8", port: 4028 }),
    });
    expect(badHost.status).toBe(400);
    const foreign = await fetch(`http://127.0.0.1:${port}/api/connector/cgminer`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ host: "127.0.0.1", port: 4028 }),
    });
    expect(foreign.status).toBe(403);
  });

  it("reads NiceHash and Braiins through mocked upstreams", async () => {
    stubUpstream((target) => {
      if (target.includes("/api/v2/time")) return json({ serverTime: 1_543_597_115_712 });
      if (target.includes("/mining/rigs2")) {
        return json({ unpaidAmount: "0.1", miningRigs: [{ rigId: "1", name: "a", minerStatus: "MINING", stats: [{ speedAccepted: 1e12 }] }] });
      }
      if (target.includes("/accounts/profile")) return json({ btc: { hash_rate_unit: "Gh/s", hash_rate_5m: 10, current_balance: "0.2" } });
      if (target.includes("/accounts/workers")) {
        return json({ btc: { workers: { "user.a": { state: "ok", hash_rate_unit: "Gh/s", hash_rate_5m: 10 } } } });
      }
      return json({}, 404);
    });
    const port = await listen();
    const origin = { "content-type": "application/json", origin: `http://127.0.0.1:${port}` };
    const nice = await fetch(`http://127.0.0.1:${port}/api/connector/nicehash`, {
      method: "POST",
      headers: origin,
      body: JSON.stringify({ apiKey: "k", apiSecret: "s", organizationId: "org" }),
    });
    expect(nice.status).toBe(200);
    expect((await nice.json()).hashrateHs).toBe(1e12);
    const braiins = await fetch(`http://127.0.0.1:${port}/api/connector/braiins`, {
      method: "POST",
      headers: origin,
      body: JSON.stringify({ token: "profile-token" }),
    });
    expect(braiins.status).toBe(200);
    expect((await braiins.json()).connectorId).toBe("braiins");
  });

  it("rejects a bad testnet address before any lookup", async () => {
    const port = await listen();
    const response = await fetch(`http://127.0.0.1:${port}/api/btc/utxos?network=testnet&address=http://evil.example`, {
      headers: { origin: `http://127.0.0.1:${port}` },
    });
    expect(response.status).toBe(400);
  });
});
