import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fetchPublicMarket } from "@hashly/market";
import {
  BRAIINS_URLS,
  isPrivateHost,
  parseBraiins,
  parseNicehashRigs,
  signNicehash,
} from "@hashly/connectors";
import { readLanMiner } from "@hashly/connectors/node";
import { assertAddress } from "@hashly/wallet";
import { sendTelegram, sendWebhook } from "@hashly/pro";

const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  return req.socket.remoteAddress ?? "";
}

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function sameOrigin(req: Request): boolean {
  const origin = req.header("origin");
  if (!origin) return isLoopback(clientIp(req));
  try {
    return new URL(origin).host === req.header("host");
  } catch {
    return false;
  }
}

function limited(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = clientIp(req);
  const recent = (hits.get(key) ?? []).filter((time) => now - time < 60_000);
  if (recent.length > 60) {
    res.status(429).json({ error: "slow-down" });
    return;
  }
  recent.push(now);
  hits.set(key, recent);
  next();
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

export function createApp(staticDir?: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "hashly", holdsFunds: false });
  });
  app.get("/api/market", limited, asyncRoute(async (_req, res) => {
    res.json(await fetchPublicMarket());
  }));
  app.use("/api/connector", (req, res, next) => {
    if (!sameOrigin(req)) {
      res.status(403).json({ error: "origin" });
      return;
    }
    next();
  });
  app.use("/api/btc", (req, res, next) => {
    if (!sameOrigin(req)) {
      res.status(403).json({ error: "origin" });
      return;
    }
    next();
  });
  app.use("/api/alert", (req, res, next) => {
    if (!sameOrigin(req)) {
      res.status(403).json({ error: "origin" });
      return;
    }
    next();
  });

  app.post("/api/connector/nicehash", limited, asyncRoute(async (req, res) => {
    const { apiKey, apiSecret, organizationId, label } = req.body ?? {};
    if (!apiKey || !apiSecret || !organizationId) {
      res.status(400).json({ error: "missing" });
      return;
    }
    const path = "/main/api/v2/mining/rigs2";
    const query = "size=100&page=0";
    const timeResponse = await fetch("https://api2.nicehash.com/api/v2/time");
    if (!timeResponse.ok) {
      res.status(502).json({ error: "upstream" });
      return;
    }
    const timeJson = (await timeResponse.json()) as { serverTime?: number };
    const time = String(timeJson.serverTime ?? Date.now());
    const nonce = crypto.randomUUID();
    const signature = signNicehash({ apiKey, apiSecret, organizationId }, { time, nonce, path, query });
    const upstream = await fetch(`https://api2.nicehash.com${path}?${query}`, {
      headers: {
        "X-Time": time,
        "X-Nonce": nonce,
        "X-Organization-Id": organizationId,
        "X-Request-Id": crypto.randomUUID(),
        "X-Auth": `${apiKey}:${signature}`,
      },
    });
    if (!upstream.ok) {
      res.status(502).json({ error: "upstream" });
      return;
    }
    res.json(parseNicehashRigs(await upstream.json(), label || "NiceHash"));
  }));

  app.post("/api/connector/braiins", limited, asyncRoute(async (req, res) => {
    const token = String(req.body?.token ?? "");
    if (token.length < 8) {
      res.status(400).json({ error: "missing" });
      return;
    }
    const headers = { "Pool-Auth-Token": token };
    const [profileRes, workersRes] = await Promise.all([
      fetch(BRAIINS_URLS.profile, { headers }),
      fetch(BRAIINS_URLS.workers, { headers }),
    ]);
    if (!profileRes.ok || !workersRes.ok) {
      res.status(502).json({ error: "upstream" });
      return;
    }
    res.json(parseBraiins(await profileRes.json(), await workersRes.json(), req.body?.label || "Braiins Pool"));
  }));

  app.post("/api/connector/cgminer", limited, asyncRoute(async (req, res) => {
    const host = String(req.body?.host ?? "");
    const port = Number(req.body?.port ?? 4028);
    if (!isPrivateHost(host)) {
      res.status(400).json({ error: "host-not-private" });
      return;
    }
    try {
      res.json(await readLanMiner(host, port, req.body?.label));
    } catch {
      res.status(502).json({ error: "miner-unreachable" });
    }
  }));

  app.get("/api/btc/utxos", limited, asyncRoute(async (req, res) => {
    const network = req.query.network === "mainnet" ? "mainnet" : "testnet";
    const address = String(req.query.address ?? "");
    try {
      assertAddress(address, network);
    } catch {
      res.status(400).json({ error: "bad-address" });
      return;
    }
    const base = network === "mainnet" ? "https://mempool.space/api" : "https://mempool.space/testnet/api";
    const upstream = await fetch(`${base}/address/${encodeURIComponent(address)}/utxo`);
    if (!upstream.ok) {
      res.status(502).json({ error: "upstream" });
      return;
    }
    const rows = (await upstream.json()) as Array<{ txid: string; vout: number; value: number }>;
    res.json(rows.map((row) => ({ txid: row.txid, vout: row.vout, valueSats: row.value })));
  }));

  app.post("/api/btc/broadcast", limited, asyncRoute(async (req, res) => {
    const network = req.body?.network === "mainnet" ? "mainnet" : "testnet";
    const hex = String(req.body?.hex ?? "");
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 20 || hex.length > 200_000) {
      res.status(400).json({ error: "bad-tx" });
      return;
    }
    const base = network === "mainnet" ? "https://mempool.space/api" : "https://mempool.space/testnet/api";
    const upstream = await fetch(`${base}/tx`, { method: "POST", body: hex });
    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(502).json({ error: "rejected" });
      return;
    }
    res.json({ txid: text.trim() });
  }));

  app.post("/api/alert/telegram", limited, asyncRoute(async (req, res) => {
    await sendTelegram({ token: String(req.body?.token ?? ""), chatId: String(req.body?.chatId ?? ""), text: String(req.body?.text ?? "") });
    res.json({ ok: true });
  }));

  app.post("/api/alert/webhook", limited, asyncRoute(async (req, res) => {
    await sendWebhook(String(req.body?.url ?? ""), req.body?.payload ?? {});
    res.json({ ok: true });
  }));

  if (staticDir) {
    app.use(express.static(staticDir, { index: "index.html" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(staticDir, "index.html"), (error) => {
        if (error) next();
      });
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const code = error instanceof Error ? error.message : "error";
    const safe = ["webhook-https", "bad-telegram-token", "bad-chat", "webhook-failed", "telegram-failed"].includes(code) ? code : "error";
    if (!res.headersSent) res.status(400).json({ error: safe });
  });
  return app;
}

export function startServer(opts: { port?: number; host?: string; staticDir?: string } = {}): Promise<{ port: number; server: Server }> {
  const app = createApp(opts.staticDir);
  const server = createServer(app);
  const host = opts.host ?? process.env.HOST ?? "127.0.0.1";
  const port = opts.port ?? Number(process.env.PORT ?? 8787);
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : port;
      resolve({ port: actual, server });
    });
  });
}

if (process.env.HASHLY_SERVER === "1") {
  const staticDir = process.env.HASHLY_STATIC_DIR;
  startServer({ staticDir }).then(({ port }) => {
    console.log(`Hashly listening on ${process.env.HOST ?? "127.0.0.1"}:${port}`);
  });
}
