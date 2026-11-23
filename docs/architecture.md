# Architecture

```text
apps/web        React UI. Seeds never leave the renderer.
apps/server     Loopback API: market proxy, pool reads, LAN miner reads.
apps/desktop    Electron shell. Preload is tiny. It loads the server or Vite.
packages/wallet BIP39, Argon2id vault, Bitcoin PSBT, EVM personal_sign.
packages/connectors  NiceHash, Braiins, CGMiner parsers and the SDK.
packages/market      Public difficulty and price, estimates, alert rules.
packages/license     Offline Ed25519 plans. MIT, because the wallet must read it.
packages/pro         CSV, Telegram/webhook, schedule, white-label. Commercial licence.
cli/license     Owner tool. Issues keys. Does not process payments.
```

The UI encrypts secrets, then asks the server to call a pool. The server is
not an account system. Docker runs the same server and the built UI.

Tests use Vitest. Pool tests mock `fetch`. Wallet tests sign a testnet
transaction and check the BIP84 mainnet vector
`bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu`.
