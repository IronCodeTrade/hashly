import { Buffer } from "buffer";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "@bitcoinerlab/secp256k1";
import { HDKey } from "@scure/bip32";
import { base58 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { seedFromMnemonic } from "./mnemonic";
import { wipe } from "./bytes";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export type BtcNetworkName = "mainnet" | "testnet";

export function btcNetwork(name: BtcNetworkName): bitcoin.Network {
  return name === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
}

export function accountPath(network: BtcNetworkName, chain: 0 | 1, index: number): string {
  const coin = network === "mainnet" ? "0" : "1";
  return `m/84'/${coin}'/0'/${chain}/${index}`;
}

export type DerivedAddress = { index: number; chain: 0 | 1; path: string; address: string };

function keyAt(seed: Uint8Array, path: string): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (!node.privateKey || !node.publicKey) throw new Error("derive-failed");
  return { privateKey: node.privateKey, publicKey: node.publicKey };
}

export function deriveBtcAddress(seed: Uint8Array, network: BtcNetworkName, chain: 0 | 1 = 0, index = 0): DerivedAddress {
  const path = accountPath(network, chain, index);
  const { privateKey, publicKey } = keyAt(seed, path);
  try {
    const payment = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(publicKey),
      network: btcNetwork(network),
    });
    if (!payment.address) throw new Error("address-failed");
    return { index, chain, path, address: payment.address };
  } finally {
    wipe(privateKey);
  }
}

export function receiveAddresses(seed: Uint8Array, network: BtcNetworkName, count = 5): DerivedAddress[] {
  return Array.from({ length: count }, (_, index) => deriveBtcAddress(seed, network, 0, index));
}

const XPUB_VERSIONS: Record<string, number> = {
  xpub: 0x0488b21e,
  tpub: 0x043587cf,
  zpub: 0x04b24746,
  vpub: 0x045f1cf6,
};

function checksum4(payload: Uint8Array): Uint8Array {
  return sha256(sha256(payload)).subarray(0, 4);
}

function decodeBase58Check(value: string): Uint8Array {
  const raw = base58.decode(value);
  if (raw.length < 5) throw new Error("bad-xpub");
  const payload = raw.subarray(0, -4);
  const check = raw.subarray(-4);
  if (bytesToHex(check) !== bytesToHex(checksum4(payload))) throw new Error("bad-xpub");
  return new Uint8Array(payload);
}

function encodeBase58Check(payload: Uint8Array): string {
  const check = checksum4(payload);
  const full = new Uint8Array(payload.length + check.length);
  full.set(payload);
  full.set(check, payload.length);
  return base58.encode(full);
}

/** Accept account-level xpub/tpub/zpub/vpub and return the first native-segwit receive addresses. */
export function addressesFromAccountXpub(extended: string, count = 5): { network: BtcNetworkName; addresses: DerivedAddress[] } {
  const trimmed = extended.trim();
  const prefix = trimmed.slice(0, 4);
  const version = XPUB_VERSIONS[prefix];
  if (!version) throw new Error("bad-xpub");
  const network: BtcNetworkName = prefix === "xpub" || prefix === "zpub" ? "mainnet" : "testnet";
  const decoded = decodeBase58Check(trimmed);
  const payload = new Uint8Array(decoded);
  const view = new DataView(payload.buffer);
  const target = network === "mainnet" ? XPUB_VERSIONS.xpub : XPUB_VERSIONS.tpub;
  view.setUint32(0, target);
  const normalized = encodeBase58Check(payload);
  const node = HDKey.fromExtendedKey(normalized);
  const addresses: DerivedAddress[] = [];
  for (let index = 0; index < count; index += 1) {
    const child = node.deriveChild(0).deriveChild(index);
    if (!child.publicKey) throw new Error("derive-failed");
    const payment = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(child.publicKey),
      network: btcNetwork(network),
    });
    if (!payment.address) throw new Error("address-failed");
    addresses.push({ index, chain: 0, path: `m/0/${index}`, address: payment.address });
  }
  return { network, addresses };
}

export type Utxo = { txid: string; vout: number; valueSats: number };

export type SignedTransfer = {
  hex: string;
  txid: string;
  feeSats: number;
  vsize: number;
  feeRate: number;
  changeSats: number;
};

export function btcToSats(amount: string): number {
  const value = amount.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(value)) throw new Error("bad-amount");
  const [whole, frac = ""] = value.split(".");
  const sats = Number(whole) * 100_000_000 + Number(frac.padEnd(8, "0"));
  if (!Number.isSafeInteger(sats) || sats <= 0) throw new Error("bad-amount");
  return sats;
}

function estimateVsize(inputs: number, outputs: number): number {
  return Math.ceil(10.5 + inputs * 68 + outputs * 31);
}

/**
 * Build and sign a native-segwit (P2WPKH) payment. Hashly does not choose a
 * recipient and does not broadcast unless the caller asks a public node later.
 */
export function signNativeSegwitPayment(opts: {
  mnemonic: string;
  passphrase?: string;
  network: BtcNetworkName;
  utxos: Utxo[];
  to: string;
  amountSats: number;
  feeRateSatPerVb: number;
  changeIndex?: number;
}): SignedTransfer {
  if (!opts.utxos.length) throw new Error("no-utxo");
  if (!Number.isSafeInteger(opts.amountSats) || opts.amountSats <= 0) throw new Error("bad-amount");
  if (!(opts.feeRateSatPerVb > 0) || opts.feeRateSatPerVb > 1000) throw new Error("bad-fee");
  const network = btcNetwork(opts.network);
  let toScript: Buffer;
  try {
    toScript = bitcoin.address.toOutputScript(opts.to, network);
  } catch {
    throw new Error("bad-address");
  }
  const seed = seedFromMnemonic(opts.mnemonic, opts.passphrase ?? "");
  try {
    const inputKeys = opts.utxos.map((utxo, position) => {
      const path = accountPath(opts.network, 0, position === 0 ? 0 : 0);
      // All current receives sit on m/84'/coin'/0'/0/0 in this version.
      // Callers pass UTXOs that pay the first receive address.
      void path;
      const derived = keyAt(seed, accountPath(opts.network, 0, 0));
      return { utxo, ...derived };
    });
    try {
      const changePath = accountPath(opts.network, 1, opts.changeIndex ?? 0);
      const changeKey = keyAt(seed, changePath);
      const changeAddress = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(changeKey.publicKey),
        network,
      }).address;
      wipe(changeKey.privateKey);
      if (!changeAddress) throw new Error("address-failed");
      const total = opts.utxos.reduce((sum, utxo) => sum + utxo.valueSats, 0);
      const build = (feeSats: number): SignedTransfer => {
        const change = total - opts.amountSats - feeSats;
        if (change < 0) throw new Error("insufficient");
        const psbt = new bitcoin.Psbt({ network });
        const script = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(inputKeys[0].publicKey),
          network,
        }).output;
        if (!script) throw new Error("address-failed");
        for (const utxo of opts.utxos) {
          if (!/^[0-9a-fA-F]{64}$/.test(utxo.txid)) throw new Error("bad-utxo");
          psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: { script, value: utxo.valueSats },
          });
        }
        psbt.addOutput({ script: toScript, value: opts.amountSats });
        const payChange = change >= 546;
        if (payChange) psbt.addOutput({ address: changeAddress, value: change });
        const signer = ECPair.fromPrivateKey(Buffer.from(inputKeys[0].privateKey), { network });
        for (let i = 0; i < opts.utxos.length; i += 1) psbt.signInput(i, signer);
        if (!psbt.validateSignaturesOfAllInputs((pubkey, hash, signature) => ecc.verify(hash, pubkey, signature))) {
          throw new Error("bad-signature");
        }
        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        const vsize = tx.virtualSize();
        const actualFee = payChange ? feeSats : total - opts.amountSats;
        return {
          hex: tx.toHex(),
          txid: tx.getId(),
          feeSats: actualFee,
          vsize,
          feeRate: actualFee / vsize,
          changeSats: payChange ? change : 0,
        };
      };
      const outputs = total - opts.amountSats - Math.ceil(estimateVsize(opts.utxos.length, 2) * opts.feeRateSatPerVb) >= 546 ? 2 : 1;
      let fee = Math.ceil(estimateVsize(opts.utxos.length, outputs) * opts.feeRateSatPerVb);
      let signed = build(fee);
      if (signed.feeRate + 1e-9 < opts.feeRateSatPerVb) {
        fee = Math.ceil(signed.vsize * opts.feeRateSatPerVb);
        signed = build(fee);
      }
      return signed;
    } finally {
      inputKeys.forEach((key) => {
        wipe(key.privateKey);
        wipe(key.publicKey);
      });
    }
  } finally {
    wipe(seed);
  }
}

export function assertAddress(address: string, network: BtcNetworkName): void {
  bitcoin.address.toOutputScript(address, btcNetwork(network));
}
