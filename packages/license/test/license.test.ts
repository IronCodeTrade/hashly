import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { issueLicense, publicKeyFromPrivate, resolveAccess, verifyLicense } from "../src/index";

const DEV_PRIVATE = "e873f31dce69c34af4b71407e2b1d37178f7614a36d302d00f75408570074352";

describe("signed licences", () => {
  it("issues a key the app can verify offline, and rejects tampering and expiry", () => {
    expect(publicKeyFromPrivate(DEV_PRIVATE)).toBe("666275862fce2e1064aba8310b577239e11e1b740f86cc07ea3731933d4d4007");
    const now = 1_700_000_000_000;
    const token = issueLicense(
      {
        v: 1,
        plan: "team",
        sub: "studio@example.com",
        seats: 5,
        rigs: 40,
        iat: 1_700_000_000,
        exp: 1_800_000_000,
        features: ["csv", "team", "automation", "advancedAlerts", "multiConnector"],
      },
      DEV_PRIVATE,
    );
    const verified = verifyLicense(token, undefined, 1_700_000_100);
    expect(verified.ok).toBe(true);
    expect(verified.license?.plan).toBe("team");
    expect(verified.license?.devKey).toBe(true);
    const broken = `${token.slice(0, -4)}AAAA`;
    expect(verifyLicense(broken).ok).toBe(false);
    expect(verifyLicense(token, undefined, 1_900_000_000).reason).toBe("expired");

    const access = resolveAccess({ now, trialStartedAt: now - 40 * 86_400_000, token });
    expect(access.plan).toBe("team");
    expect(access.can("team")).toBe(true);
    expect(access.can("whiteLabel")).toBe(false);
    expect(access.limits.connectors).toBe(40);
    expect(access.trial.active).toBe(false);
  });

  it("gives a 30-day Pro trial and then returns to the free wallet", () => {
    const start = 1_700_000_000_000;
    const during = resolveAccess({ now: start + 10 * 86_400_000, trialStartedAt: start, token: null });
    expect(during.plan).toBe("pro");
    expect(during.trial.active).toBe(true);
    expect(during.can("csv")).toBe(true);
    expect(during.can("team")).toBe(false);
    expect(during.limits.connectors).toBe(50);

    const after = resolveAccess({ now: start + 31 * 86_400_000, trialStartedAt: start, token: null });
    expect(after.plan).toBe("free");
    expect(after.can("csv")).toBe(false);
    expect(after.limits.connectors).toBe(1);
    expect(after.limits.channels).toEqual(["desktop"]);
  });

  it("does not accept a licence signed by a different key", () => {
    const secret = ed25519.utils.randomPrivateKey();
    const token = issueLicense(
      {
        v: 1,
        plan: "pro",
        sub: "other",
        seats: 1,
        rigs: 10,
        iat: 10,
        exp: 10_000_000_000,
        features: ["csv", "automation", "advancedAlerts", "multiConnector"],
      },
      bytesToHex(secret),
    );
    expect(verifyLicense(token).reason).toBe("bad-signature");
    const access = resolveAccess({ now: Date.now(), trialStartedAt: null, token });
    expect(access.plan).toBe("free");
    expect(access.license.state).toBe("invalid");
  });
});
