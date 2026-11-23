import { seedFromMnemonic } from "./mnemonic";
export { b64ToBytes, bytesToB64, wipe } from "./bytes";
import { receiveAddresses, signNativeSegwitPayment, type BtcNetworkName, type SignedTransfer, type Utxo } from "./btc";
import { deriveEthAccount, ethPrivateKey, signPersonalMessage, type EthPersonalSignature } from "./eth";
import { wipe } from "./bytes";

export type { BtcNetworkName, DerivedAddress, SignedTransfer, Utxo } from "./btc";
export type { EthPersonalSignature } from "./eth";
export type { KdfParams, VaultBlob } from "./vault";
export type { WordCount } from "./mnemonic";
export {
  PRODUCTION_KDF,
  FAST_KDF,
  PASSPHRASE_CHECK,
  VaultError,
  deriveKey,
  encryptJson,
  decryptJson,
  encryptWithKey,
  decryptWithKey,
} from "./vault";
export { createMnemonic, assertMnemonic, pickQuizPositions, checkQuiz, seedFromMnemonic } from "./mnemonic";
export { addressesFromAccountXpub, assertAddress, btcToSats, deriveBtcAddress, receiveAddresses } from "./btc";
export { deriveEthAccount, eip55, recoverPersonalMessage, signPersonalMessage } from "./eth";

export type WalletRecord = {
  v: 1;
  kind: "seed" | "watch";
  mnemonic?: string;
  bip39Passphrase?: string;
  network: BtcNetworkName;
  watchAddresses?: string[];
  createdAt: string;
};

export type AccountView = {
  watchOnly: boolean;
  network: BtcNetworkName;
  btcAddress: string | null;
  btcPath: string | null;
  btcReceive: { index: number; address: string; path: string }[];
  ethAddress: string | null;
  ethPath: string | null;
};

export function viewWallet(record: WalletRecord): AccountView {
  if (record.kind === "watch") {
    return {
      watchOnly: true,
      network: record.network,
      btcAddress: record.watchAddresses?.[0] ?? null,
      btcPath: null,
      btcReceive: (record.watchAddresses ?? []).map((address, index) => ({ index, address, path: "watch-only" })),
      ethAddress: null,
      ethPath: null,
    };
  }
  const seed = seedFromMnemonic(record.mnemonic ?? "", record.bip39Passphrase ?? "");
  try {
    const receive = receiveAddresses(seed, record.network, 3);
    const eth = deriveEthAccount(seed);
    return {
      watchOnly: false,
      network: record.network,
      btcAddress: receive[0]?.address ?? null,
      btcPath: receive[0]?.path ?? null,
      btcReceive: receive,
      ethAddress: eth.address,
      ethPath: eth.path,
    };
  } finally {
    wipe(seed);
  }
}

export function signWalletTransfer(
  record: WalletRecord,
  opts: { utxos: Utxo[]; to: string; amountSats: number; feeRateSatPerVb: number },
): SignedTransfer {
  if (record.kind !== "seed" || !record.mnemonic) throw new Error("watch-only");
  return signNativeSegwitPayment({
    mnemonic: record.mnemonic,
    passphrase: record.bip39Passphrase,
    network: record.network,
    utxos: opts.utxos,
    to: opts.to,
    amountSats: opts.amountSats,
    feeRateSatPerVb: opts.feeRateSatPerVb,
  });
}

export function signWalletMessage(record: WalletRecord, message: string): EthPersonalSignature {
  if (record.kind !== "seed" || !record.mnemonic) throw new Error("watch-only");
  const seed = seedFromMnemonic(record.mnemonic, record.bip39Passphrase ?? "");
  const privateKey = ethPrivateKey(seed);
  try {
    return signPersonalMessage(privateKey, message);
  } finally {
    wipe(privateKey);
    wipe(seed);
  }
}
