# Security model

Hashly keeps keys on the device that runs it. There is no Hashly account and
no server copy of a seed.

## Unlock

1. You choose a passphrase of at least 10 characters.
2. The app stretches it with **Argon2id** (19 MiB, 2 iterations, parallelism 1).
   That is the OWASP baseline this version ships with. The pause on unlock is
   the lock.
3. A 32-byte key opens **AES-256-GCM** blobs. The additional data is the
   constant `hashly-vault-v1`, so a random ciphertext does not decrypt as a vault.
4. The same key encrypts the seed and any pool credentials.
5. Auto-lock drops the key from memory after a few idle minutes. JavaScript
   cannot promise that a freed string is gone from the process. Treat an
   unlocked or compromised machine as a loss of the seed.

## Keys

- Bitcoin uses BIP39 and BIP84 (`m/84'/0'/0'/0/0` on mainnet,
  `m/84'/1'/0'/0/0` on testnet). Native SegWit only.
- EVM accounts use BIP44 `m/44'/60'/0'/0/0`. Signing is EIP-191
  `personal_sign`. Hashly does not broadcast Ethereum transactions in 0.1.0.
- Watch-only mode stores addresses or an account zpub/vpub and cannot sign.
- New wallets default to **testnet**.

## What the local server is allowed to call

| Route | Destination | Guard |
| --- | --- | --- |
| Market | CoinGecko and mempool.space | Fixed hosts |
| NiceHash | `api2.nicehash.com` mining rigs only | Path allowlist. No hashpower orders |
| Braiins | Profile and workers JSON | Fixed hosts. No marketplace orders |
| CGMiner | A host you name | Private IPv4, localhost, or `.local` only. Commands are `summary`, `devs`, `pools`, `version`, `coin`. `restart` and `addpool` are rejected |
| Broadcast | mempool.space | Raw hex you already signed, and only after you confirm |

Browser calls to `/api/*` from another site are rejected unless the `Origin`
host matches. Bind the server to `127.0.0.1` unless you are deliberately
self-hosting.

## Desktop

Electron runs with `contextIsolation`, a sandboxed renderer, and no node
integration. The preload exposes proxy setup and a notification call. The
seed never crosses into the main process. A SOCKS or HTTP proxy
(`socks5://127.0.0.1:9050` for a local Tor client) is applied to the Electron
session. The browser build does not tunnel by itself. Tor Browser is the
browser-side option.

## Telemetry

There is no analytics code. Refreshing market data or a pool is a request you
triggered.

## Licences

Plan checks are Ed25519 signatures verified offline. They do not gate the
wallet. A development public key is built in so reviewers can try Pro. Replace
it before a production release. See [licensing.md](licensing.md).
