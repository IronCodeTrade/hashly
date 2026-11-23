import { HDKey } from "@scure/bip32";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, utf8, wipe } from "./bytes";

export const ETH_PATH = "m/44'/60'/0'/0/0";

export function eip55(addressHex: string): string {
  const lower = addressHex.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak_256(utf8(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    out += Number.parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function ethAddressFromPrivateKey(privateKey: Uint8Array): string {
  const uncompressed = secp256k1.getPublicKey(privateKey, false);
  const hash = keccak_256(uncompressed.subarray(1));
  return eip55(bytesToHex(hash.subarray(12)));
}

export function deriveEthAccount(seed: Uint8Array): { path: string; address: string } {
  const node = HDKey.fromMasterSeed(seed).derive(ETH_PATH);
  if (!node.privateKey) throw new Error("derive-failed");
  try {
    return { path: ETH_PATH, address: ethAddressFromPrivateKey(node.privateKey) };
  } finally {
    wipe(node.privateKey);
  }
}

export type EthPersonalSignature = { message: string; signature: string; address: string };

/** EIP-191 personal_sign. The signature is recoverable; this does not broadcast anything. */
export function signPersonalMessage(privateKey: Uint8Array, message: string): EthPersonalSignature {
  const prefixed = utf8(`\u0019Ethereum Signed Message:\n${new TextEncoder().encode(message).length}${message}`);
  const hash = keccak_256(prefixed);
  const signature = secp256k1.sign(hash, privateKey);
  const compact = signature.toCompactRawBytes();
  const v = signature.recovery + 27;
  const hex = `0x${bytesToHex(compact)}${v.toString(16).padStart(2, "0")}`;
  return { message, signature: hex, address: ethAddressFromPrivateKey(privateKey) };
}

export function recoverPersonalMessage(message: string, signatureHex: string): string {
  const hex = signatureHex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{130}$/.test(hex)) throw new Error("bad-signature");
  const compact = Uint8Array.from(hex.slice(0, 128).match(/../g)!.map((b) => Number.parseInt(b, 16)));
  const v = Number.parseInt(hex.slice(128), 16);
  const recovery = v >= 27 ? v - 27 : v;
  const prefixed = utf8(`\u0019Ethereum Signed Message:\n${new TextEncoder().encode(message).length}${message}`);
  const hash = keccak_256(prefixed);
  const signature = secp256k1.Signature.fromCompact(compact).addRecoveryBit(recovery);
  const publicKey = signature.recoverPublicKey(hash).toRawBytes(false);
  const addressHash = keccak_256(publicKey.subarray(1));
  return eip55(bytesToHex(addressHash.subarray(12)));
}

export function ethPrivateKey(seed: Uint8Array): Uint8Array {
  const node = HDKey.fromMasterSeed(seed).derive(ETH_PATH);
  if (!node.privateKey) throw new Error("derive-failed");
  return new Uint8Array(node.privateKey);
}
