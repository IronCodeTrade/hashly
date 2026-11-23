# Security

Hashly is a non-custodial wallet and a read-only mining dashboard. It does not
hold funds. A bug here can still expose a seed if the device is unlocked, so
please report privately.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository. Please do not open a public issue for an unfixed wallet bug,
and do not include a real seed, pool secret, or production licence private key.

## What we consider in scope

- Vault encryption, key derivation, signing, and backup handling
- Secret storage for pool credentials
- The local server being abused as an open proxy or SSRF
- Electron isolation (preload, navigation, IPC)
- Licence verification accepting a forged token under the production trust anchor

## What is out of scope

- A stolen seed phrase, a photo of it, or malware on an unlocked machine
- Phishing sites that are not this repository
- Pool accounts you connected yourself
- Mining losses, difficulty changes, or electricity prices
- The published development licence key. It is public on purpose. Production
  builds must set `VITE_HASHLY_LICENSE_PUBLIC_KEY`.

## Status

Version 0.1.0 has **not** had an independent security audit. The cryptography
is delegated to `@scure/bip39`, `@scure/bip32`, `bitcoinjs-lib`,
`@bitcoinerlab/secp256k1` (which wraps noble-curves), and `@noble/ciphers` /
`@noble/hashes`. Hashly does not implement its own cipher or signature scheme.

Read [docs/security-model.md](docs/security-model.md) and
[docs/threat-model.md](docs/threat-model.md) before you store a real seed.
