# Threat model

## Assets

- The BIP39 seed and the keys derived from it
- Pool and Telegram tokens stored in the vault
- The availability of the wallet without a paid plan
- Integrity of a transaction the user asked to sign

## Adversaries

| Adversary | What they can do | What Hashly does |
| --- | --- | --- |
| Someone who finds the locked device | Read the ciphertext | Argon2id + AES-GCM. No recovery |
| Someone who uses the device while it is unlocked | Sign and read the seed | Auto-lock. Not a defence against a person at the keyboard |
| Malware on the machine | Read memory, replace the app | Out of scope. Verify the download. Official builds are not code-signed yet |
| A malicious website | Call the local API | Origin check. Loopback bind by default |
| A malicious pool response | Lie about hashrate | Display only. It cannot move the wallet |
| A forged licence | Unlock Pro in an official build | Rejected unless signed by the trust anchor |
| Hashly itself | Ask you to deposit | The software has no deposit flow. Do not send coins to a "Hashly address" that is not the one this app just derived |

## Non-goals

- Protecting a seed that was photographed or typed into another site
- Hiding your IP from the pool you chose to call
- Guarding a miner API that you exposed on the public internet
- Predicting profit

## Residual risk

This release is not audited. Review the signing path in `packages/wallet`
before you use a mainnet seed with a large balance. Prefer testnet until you
have done that.
