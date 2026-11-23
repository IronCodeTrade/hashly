import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { utf8ToBytes } from "@noble/hashes/utils";
import {
  assertCgminerCommand,
  assertNicehashReadPath,
  demoSnapshots,
  isPrivateHost,
  nicehashSigningInput,
  parseBraiins,
  parseCgminer,
  parseNicehashRigs,
  signNicehash,
} from "../src/index";

describe("NiceHash", () => {
  it("matches an independent HMAC of the documented zero-byte layout", () => {
    const credentials = {
      apiKey: "4ebd366d-76f4-4400-a3b6-e51515d054d6",
      apiSecret: "fd8a1652-728b-42fe-82b8-f623e56da8850750f5bf-ce66-4ca7-8b84-93651abc723b",
      organizationId: "da41b3bc-3d0b-4226-b7ea-aee73f94a518",
    };
    const input = {
      time: "1543597115712",
      nonce: "9675d0f8-1325-484b-9594-c9d6d3268890",
      path: "/main/api/v2/mining/rigs2",
      query: "size=25&page=0",
    };
    const message = nicehashSigningInput({ ...credentials, ...input, method: "GET" });
    const expected = createHmac("sha256", credentials.apiSecret).update(Buffer.from(message)).digest("hex");
    expect(signNicehash(credentials, input)).toBe(expected);
    expect(Buffer.from(message).includes(0)).toBe(true);
    expect(utf8ToBytes("a\u0000b").length).toBe(3);
    expect(() => assertNicehashReadPath("/main/api/v2/hashpower/order")).toThrow("path-not-allowed");
  });

  it("normalises a rigs payload", () => {
    const snapshot = parseNicehashRigs({
      unpaidAmount: "0.00012",
      miningRigs: [
        {
          rigId: "rig-1",
          name: "garage",
          minerStatus: "MINING",
          stats: [{ speedAccepted: 95e12, algorithm: { description: "SHA256" } }],
        },
        { rigId: "rig-2", name: "spare", minerStatus: "OFFLINE", stats: [{ speedAccepted: 0 }] },
      ],
    });
    expect(snapshot.hashrateHs).toBe(95e12);
    expect(snapshot.workers[1]?.status).toBe("offline");
    expect(snapshot.unpaidBtc).toBeCloseTo(0.00012);
    expect(snapshot.notes[0]).toMatch(/not a Hashly balance/i);
  });
});

describe("Braiins", () => {
  it("converts Gh/s workers and keeps rewards labelled as the pool's", () => {
    const snapshot = parseBraiins(
      { btc: { hash_rate_unit: "Gh/s", hash_rate_5m: 140_000, current_balance: "0.01000000" } },
      {
        btc: {
          workers: {
            "user.s21": { state: "ok", hash_rate_unit: "Gh/s", hash_rate_5m: 140_000, last_share: 1_700_000_000 },
            "user.old": { state: "off", hash_rate_unit: "Gh/s", hash_rate_5m: 0 },
          },
        },
      },
    );
    expect(snapshot.hashrateHs).toBeCloseTo(140e12);
    expect(snapshot.workers.find((worker) => worker.name === "user.old")?.status).toBe("offline");
    expect(snapshot.unpaidBtc).toBeCloseTo(0.01);
    expect(snapshot.notes.join(" ")).toMatch(/does not sell hashrate/i);
  });
});

describe("CGMiner", () => {
  it("parses summary and devices and rejects control commands and public hosts", () => {
    const snapshot = parseCgminer(
      JSON.stringify({ SUMMARY: [{ "MHS 5s": 95_000_000 }] }),
      JSON.stringify({ DEVS: [{ ID: 0, Name: "asc0", Status: "Alive", "MHS 5s": 95_000_000 }] }),
    );
    expect(snapshot.hashrateHs).toBeCloseTo(95e12);
    expect(snapshot.workers[0]?.status).toBe("online");
    expect(() => assertCgminerCommand("restart")).toThrow("command-not-allowed");
    expect(() => assertCgminerCommand("addpool")).toThrow("command-not-allowed");
    expect(assertCgminerCommand("summary")).toBe("summary");
    expect(isPrivateHost("192.168.1.20")).toBe(true);
    expect(isPrivateHost("10.0.0.5")).toBe(true);
    expect(isPrivateHost("miner.local")).toBe(true);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("pool.braiins.com")).toBe(false);
  });
});

describe("demo", () => {
  it("ships labelled sample snapshots", () => {
    const snapshots = demoSnapshots();
    expect(snapshots.every((snapshot) => snapshot.demo)).toBe(true);
    expect(snapshots.map((snapshot) => snapshot.connectorId)).toEqual(["nicehash", "braiins", "cgminer"]);
  });
});
