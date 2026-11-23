import { describe, expect, it } from "vitest";
import {
  FAST_KDF,
  PASSPHRASE_CHECK,
  VaultError,
  assertMnemonic,
  btcToSats,
  checkQuiz,
  createMnemonic,
  decryptJson,
  deriveEthAccount,
  encryptJson,
  pickQuizPositions,
  recoverPersonalMessage,
  seedFromMnemonic,
  signWalletMessage,
  signWalletTransfer,
  viewWallet,
  type WalletRecord,
} from "../src/index";
import { deriveBtcAddress } from "../src/btc";

const ABANDON =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("mnemonic and vectors", () => {
  it("accepts the BIP39 abandon vector and rejects junk", () => {
    expect(assertMnemonic(`  ${ABANDON.toUpperCase()}  `)).toBe(ABANDON);
    expect(() => assertMnemonic("abandon abandon abandon")).toThrow("bad-mnemonic");
  });

  it("derives the published BIP84 mainnet receive address", () => {
    const seed = seedFromMnemonic(ABANDON);
    const address = deriveBtcAddress(seed, "mainnet");
    expect(address.path).toBe("m/84'/0'/0'/0/0");
    expect(address.address).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
  });

  it("derives a stable testnet address and the well-known first Ethereum address", () => {
    const seed = seedFromMnemonic(ABANDON);
    const testnet = deriveBtcAddress(seed, "testnet");
    expect(testnet.path).toBe("m/84'/1'/0'/0/0");
    expect(testnet.address.startsWith("tb1q")).toBe(true);
    expect(deriveBtcAddress(seed, "testnet").address).toBe(testnet.address);
    expect(deriveEthAccount(seed).address).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
  });

  it("quizzes three positions and generates 12 or 24 words", () => {
    const positions = pickQuizPositions(12, 3, () => 0.99);
    expect(positions).toHaveLength(3);
    const mnemonic = createMnemonic(12);
    expect(mnemonic.split(" ")).toHaveLength(12);
    expect(createMnemonic(24).split(" ")).toHaveLength(24);
    const words = mnemonic.split(" ");
    const answers = Object.fromEntries(positions.map((index) => [index, words[index] ?? "abandon"]));
    expect(checkQuiz(mnemonic, answers)).toBe(true);
    expect(checkQuiz(mnemonic, { ...answers, [positions[0]!]: "zoo" })).toBe(false);
  });
});

describe("vault", () => {
  it("round-trips json and rejects a wrong passphrase or flipped ciphertext", async () => {
    const blob = await encryptJson({ hello: "hashly" }, "correct horse battery", FAST_KDF);
    expect(blob.m).toBe(FAST_KDF.m);
    await expect(decryptJson(blob, "correct horse battery")).resolves.toEqual({ hello: "hashly" });
    await expect(decryptJson(blob, "wrong horse battery")).rejects.toBeInstanceOf(VaultError);
    const flipped = { ...blob, ciphertext: `${blob.ciphertext.slice(0, -2)}AA` };
    await expect(decryptJson(flipped, "correct horse battery")).rejects.toBeInstanceOf(VaultError);
    const check = await encryptJson(PASSPHRASE_CHECK, "correct horse battery", FAST_KDF);
    await expect(decryptJson(check, "correct horse battery")).resolves.toBe(PASSPHRASE_CHECK);
  });
});

describe("signing", () => {
  const record: WalletRecord = {
    v: 1,
    kind: "seed",
    mnemonic: ABANDON,
    network: "testnet",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("signs a testnet P2WPKH payment and refuses watch-only keys", () => {
    const view = viewWallet(record);
    expect(view.btcAddress?.startsWith("tb1q")).toBe(true);
    const signed = signWalletTransfer(record, {
      utxos: [{ txid: "11".repeat(32), vout: 0, valueSats: 100_000 }],
      to: view.btcAddress!,
      amountSats: 50_000,
      feeRateSatPerVb: 2,
    });
    expect(signed.hex.length).toBeGreaterThan(100);
    expect(signed.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.feeSats).toBeGreaterThan(0);
    expect(signed.feeRate).toBeGreaterThanOrEqual(2);
    expect(btcToSats("0.00050000")).toBe(50_000);
    expect(() =>
      signWalletTransfer({ ...record, kind: "watch", mnemonic: undefined, watchAddresses: [view.btcAddress!] }, {
        utxos: [{ txid: "11".repeat(32), vout: 0, valueSats: 100_000 }],
        to: view.btcAddress!,
        amountSats: 10_000,
        feeRateSatPerVb: 1,
      }),
    ).toThrow("watch-only");
  });

  it("signs an Ethereum personal message that recovers to the same address", () => {
    const signed = signWalletMessage(record, "Hashly testnet");
    expect(recoverPersonalMessage(signed.message, signed.signature)).toBe(signed.address);
    expect(signed.address).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    expect(() => signWalletMessage({ ...record, kind: "watch", mnemonic: undefined }, "x")).toThrow("watch-only");
  });

  it("refuses to spend more than the utxo", () => {
    expect(() =>
      signWalletTransfer(record, {
        utxos: [{ txid: "22".repeat(32), vout: 1, valueSats: 10_000 }],
        to: viewWallet(record).btcAddress!,
        amountSats: 9_900,
        feeRateSatPerVb: 10,
      }),
    ).toThrow("insufficient");
  });
});
