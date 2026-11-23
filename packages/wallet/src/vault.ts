import { argon2idAsync } from "@noble/hashes/argon2";
import { gcm } from "@noble/ciphers/aes";
import { b64ToBytes, bytesToB64, fromUtf8, randomBytes, utf8, wipe } from "./bytes";

/** OWASP-recommended Argon2id baseline (m in KiB). The delay is the lock. */
export const PRODUCTION_KDF = { t: 2, m: 19_456, p: 1, dkLen: 32 } as const;
/** Only for unit tests. Never persist a real wallet with these parameters. */
export const FAST_KDF = { t: 1, m: 8, p: 1, dkLen: 32 } as const;

const AAD = utf8("hashly-vault-v1");

export type KdfParams = { t: number; m: number; p: number; dkLen: number };

export type VaultBlob = {
  v: 1;
  kdf: "argon2id";
  t: number;
  m: number;
  p: number;
  dkLen: number;
  salt: string;
  nonce: string;
  ciphertext: string;
};

export class VaultError extends Error {
  code: "bad-passphrase" | "corrupt-vault";
  constructor(code: "bad-passphrase" | "corrupt-vault") {
    super(code);
    this.code = code;
    this.name = "VaultError";
  }
}

export async function deriveKey(password: string, salt: Uint8Array, params: KdfParams): Promise<Uint8Array> {
  if (password.length < 10) throw new VaultError("bad-passphrase");
  return argon2idAsync(utf8(password), salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
  });
}

export async function encryptJson(value: unknown, password: string, params: KdfParams = PRODUCTION_KDF): Promise<VaultBlob> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, params);
  try {
    const nonce = randomBytes(12);
    const cipher = gcm(key, nonce, AAD);
    const ciphertext = cipher.encrypt(utf8(JSON.stringify(value)));
    return {
      v: 1,
      kdf: "argon2id",
      t: params.t,
      m: params.m,
      p: params.p,
      dkLen: params.dkLen,
      salt: bytesToB64(salt),
      nonce: bytesToB64(nonce),
      ciphertext: bytesToB64(ciphertext),
    };
  } finally {
    wipe(key);
  }
}

export async function decryptJson<T>(blob: VaultBlob, password: string): Promise<T> {
  if (blob.v !== 1 || blob.kdf !== "argon2id") throw new VaultError("corrupt-vault");
  const salt = b64ToBytes(blob.salt);
  const key = await deriveKey(password, salt, blob);
  try {
    const cipher = gcm(key, b64ToBytes(blob.nonce), AAD);
    let plain: Uint8Array;
    try {
      plain = cipher.decrypt(b64ToBytes(blob.ciphertext));
    } catch {
      throw new VaultError("bad-passphrase");
    }
    try {
      return JSON.parse(fromUtf8(plain)) as T;
    } catch {
      throw new VaultError("corrupt-vault");
    } finally {
      wipe(plain);
    }
  } finally {
    wipe(key);
  }
}

/** Unlock once, then encrypt and decrypt with the raw AES key (no second Argon2). */
export function encryptWithKey(value: unknown, key: Uint8Array): VaultBlob {
  const nonce = randomBytes(12);
  const cipher = gcm(key, nonce, AAD);
  const ciphertext = cipher.encrypt(utf8(JSON.stringify(value)));
  return {
    v: 1,
    kdf: "argon2id",
    t: 0,
    m: 0,
    p: 0,
    dkLen: key.length,
    salt: bytesToB64(new Uint8Array(16)),
    nonce: bytesToB64(nonce),
    ciphertext: bytesToB64(ciphertext),
  };
}

export function decryptWithKey<T>(blob: VaultBlob, key: Uint8Array): T {
  try {
    const plain = gcm(key, b64ToBytes(blob.nonce), AAD).decrypt(b64ToBytes(blob.ciphertext));
    try {
      return JSON.parse(fromUtf8(plain)) as T;
    } finally {
      wipe(plain);
    }
  } catch {
    throw new VaultError("bad-passphrase");
  }
}

export const PASSPHRASE_CHECK = "hashly-passphrase-ok";
