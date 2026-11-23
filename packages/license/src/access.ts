import { verifyLicense, DEV_LICENSE_PUBLIC_KEY } from "./codec";
import { LIMITS, TRIAL_MS, type Feature, type Limits, type Plan } from "./plans";

export type Access = {
  plan: Plan;
  devTrustAnchor: boolean;
  trial: { active: boolean; endsAt: number | null; daysLeft: number };
  license: {
    state: "absent" | "valid" | "expired" | "invalid";
    subject?: string;
    exp?: number;
    reason?: string;
    devKey: boolean;
  };
  limits: Limits;
  can: (feature: Feature) => boolean;
};

export function effectiveNow(now: number, trialMaxSeen: number): number {
  return Math.max(now, trialMaxSeen);
}

export function resolveAccess(input: {
  now: number;
  trialStartedAt: number | null;
  trialMaxSeen?: number;
  token?: string | null;
  publicKeyHex?: string;
}): Access {
  const publicKey = input.publicKeyHex || DEV_LICENSE_PUBLIC_KEY;
  const devTrustAnchor = publicKey === DEV_LICENSE_PUBLIC_KEY;
  const now = effectiveNow(input.now, input.trialMaxSeen ?? input.now);
  const verified = input.token ? verifyLicense(input.token, publicKey, Math.floor(now / 1000)) : null;
  const license = !input.token
    ? { state: "absent" as const, devKey: false }
    : verified?.ok
      ? { state: "valid" as const, subject: verified.license!.sub, exp: verified.license!.exp, devKey: verified.license!.devKey }
      : {
          state: verified?.reason === "expired" ? ("expired" as const) : ("invalid" as const),
          subject: verified?.license?.sub,
          exp: verified?.license?.exp,
          reason: verified?.reason,
          devKey: verified?.license?.devKey ?? false,
        };
  const trialEnds = input.trialStartedAt == null ? null : input.trialStartedAt + TRIAL_MS;
  const trialActive = license.state !== "valid" && trialEnds != null && now < trialEnds;
  const plan: Plan = license.state === "valid" && verified?.license ? verified.license.plan : trialActive ? "pro" : "free";
  const base = LIMITS[plan];
  const rigs = license.state === "valid" && verified?.license ? Math.min(base.connectors, verified.license.rigs) : base.connectors;
  const limits: Limits = { ...base, connectors: rigs, features: [...base.features] };
  const granted = new Set(limits.features);
  return {
    plan,
    devTrustAnchor,
    trial: {
      active: trialActive,
      endsAt: trialEnds,
      daysLeft: trialEnds == null ? 0 : Math.max(0, Math.ceil((trialEnds - now) / 86_400_000)),
    },
    license,
    limits,
    can: (feature) => granted.has(feature),
  };
}
