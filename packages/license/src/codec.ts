import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { LIMITS, type Feature, type PaidPlan } from "./plans";

/**
 * Published development trust anchor. The matching private key is in
 * dev-keys/ and must not be used for a production release. Rotate it by
 * building with HASHLY_LICENSE_PUBLIC_KEY set to your own public key.
 */
export const DEV_LICENSE_PUBLIC_KEY = "666275862fce2e1064aba8310b577239e11e1b740f86cc07ea3731933d4d4007";

export type LicensePayload = {
  v: 1;
  plan: PaidPlan;
  sub: string;
  seats: number;
  rigs: number;
  iat: number;
  exp: number;
  features: Feature[];
};

function canonical(payload: LicensePayload): string {
  if (payload.v !== 1) throw new Error("bad-license");
  if (payload.plan !== "pro" && payload.plan !== "team" && payload.plan !== "whitelabel") throw new Error("bad-license");
  if (!payload.sub || payload.sub.length > 120 || payload.sub.includes("|")) throw new Error("bad-subject");
  if (!Number.isInteger(payload.seats) || payload.seats < 1) throw new Error("bad-license");
  if (!Number.isInteger(payload.rigs) || payload.rigs < 1) throw new Error("bad-license");
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= payload.iat) {
    throw new Error("bad-license");
  }
  const features = [...payload.features].sort();
  return ["HLY1", payload.plan, payload.sub, payload.seats, payload.rigs, payload.iat, payload.exp, features.join(",")].join("|");
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromB64url(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function issueLicense(payload: LicensePayload, privateKeyHex: string): string {
  const message = new TextEncoder().encode(canonical(payload));
  const signature = ed25519.sign(message, hexToBytes(privateKeyHex));
  return `HLY1.${b64url(message)}.${b64url(signature)}`;
}

export type VerifiedLicense = LicensePayload & { devKey: boolean; token: string };

export function verifyLicense(token: string, publicKeyHex = DEV_LICENSE_PUBLIC_KEY, nowSec = Math.floor(Date.now() / 1000)): {
  ok: boolean;
  reason?: "malformed" | "bad-signature" | "expired" | "bad-payload";
  license?: VerifiedLicense;
} {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "HLY1" || !parts[1] || !parts[2]) return { ok: false, reason: "malformed" };
  let message: Uint8Array;
  let signature: Uint8Array;
  try {
    message = fromB64url(parts[1]);
    signature = fromB64url(parts[2]);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const publicKey = hexToBytes(publicKeyHex);
  if (!ed25519.verify(signature, message, publicKey)) return { ok: false, reason: "bad-signature" };
  const text = new TextDecoder().decode(message);
  const [tag, plan, sub, seats, rigs, iat, exp, featureText] = text.split("|");
  if (tag !== "HLY1" || (plan !== "pro" && plan !== "team" && plan !== "whitelabel")) return { ok: false, reason: "bad-payload" };
  const features = (featureText ? featureText.split(",") : []) as Feature[];
  const allowed = new Set(LIMITS[plan].features);
  if (features.some((feature) => !allowed.has(feature))) return { ok: false, reason: "bad-payload" };
  const payload: LicensePayload = {
    v: 1,
    plan,
    sub,
    seats: Number(seats),
    rigs: Number(rigs),
    iat: Number(iat),
    exp: Number(exp),
    features,
  };
  try {
    if (canonical(payload) !== text) return { ok: false, reason: "bad-payload" };
  } catch {
    return { ok: false, reason: "bad-payload" };
  }
  if (payload.exp < nowSec) return { ok: false, reason: "expired", license: { ...payload, devKey: publicKeyHex === DEV_LICENSE_PUBLIC_KEY, token } };
  return { ok: true, license: { ...payload, devKey: bytesToHex(publicKey) === DEV_LICENSE_PUBLIC_KEY, token } };
}

export function publicKeyFromPrivate(privateKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(privateKeyHex)));
}
