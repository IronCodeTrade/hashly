import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { FEATURES, LIMITS, issueLicense, publicKeyFromPrivate, verifyLicense, type Feature, type PaidPlan } from "@hashly/license";

const DEV_PRIVATE = "e873f31dce69c34af4b71407e2b1d37178f7614a36d302d00f75408570074352";

type Io = { log: (line: string) => void; err: (line: string) => void };

function readKey(value: string | undefined, dev: boolean): string {
  if (dev) return DEV_PRIVATE;
  if (!value) throw new Error("Set --private-key or HASHLY_LICENSE_PRIVATE_KEY. Refusing to use the published development key unless you pass --dev.");
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  return readFileSync(trimmed, "utf8").trim().toLowerCase();
}

export function run(argv: string[], io: Io = { log: console.log, err: console.error }): number {
  try {
    const { positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: "string" },
        plan: { type: "string" },
        subject: { type: "string" },
        days: { type: "string" },
        seats: { type: "string" },
        rigs: { type: "string" },
        "private-key": { type: "string" },
        "public-key": { type: "string" },
        dev: { type: "boolean" },
      },
    });
    const command = positionals[0];
    if (command === "keygen") {
      const secret = ed25519.utils.randomPrivateKey();
      const pub = ed25519.getPublicKey(secret);
      const out = values.out ?? ".hashly/license-private.hex";
      mkdirSync(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
      writeFileSync(out, `${bytesToHex(secret)}\n`, { mode: 0o600 });
      io.log(`Private key written to ${out}. Keep it off the git remote.`);
      io.log(`HASHLY_LICENSE_PUBLIC_KEY=${bytesToHex(pub)}`);
      return 0;
    }
    if (command === "issue") {
      const plan = values.plan as PaidPlan;
      if (plan !== "pro" && plan !== "team" && plan !== "whitelabel") throw new Error("plan must be pro, team, or whitelabel");
      const subject = values.subject ?? "";
      const days = Number(values.days ?? 30);
      if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("days must be 1..3650");
      const cap = LIMITS[plan];
      const seats = Math.min(cap.workspaces, Math.max(1, Number(values.seats ?? 1)));
      const rigs = Math.min(cap.connectors, Math.max(1, Number(values.rigs ?? cap.connectors)));
      const features = [...cap.features] as Feature[];
      const privateKey = readKey(values["private-key"] ?? process.env.HASHLY_LICENSE_PRIVATE_KEY, Boolean(values.dev));
      const now = Math.floor(Date.now() / 1000);
      const token = issueLicense({ v: 1, plan, sub: subject, seats, rigs, iat: now, exp: now + days * 86_400, features }, privateKey);
      io.log(token);
      if (values.dev) io.err("Signed with the published development key. Not for a production release.");
      return 0;
    }
    if (command === "verify") {
      const token = positionals[1] ?? "";
      const result = verifyLicense(token, values["public-key"]);
      if (!result.ok) {
        io.err(result.reason ?? "invalid");
        return 1;
      }
      io.log(`${result.license?.plan} ${result.license?.sub} exp=${result.license?.exp} dev=${result.license?.devKey}`);
      return 0;
    }
    if (command === "pubkey") {
      const privateKey = readKey(values["private-key"] ?? process.env.HASHLY_LICENSE_PRIVATE_KEY, Boolean(values.dev));
      io.log(publicKeyFromPrivate(privateKey));
      return 0;
    }
    io.err("Commands: keygen, issue, verify, pubkey");
    io.err("Features a plan can grant: " + FEATURES.join(", "));
    return command ? 1 : 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : "error");
    return 1;
  }
}

const entry = process.argv[1] ?? "";
if (entry.includes(`${"cli"}/license`) || entry.includes("hashly-license")) {
  process.exit(run(process.argv.slice(2)));
}
