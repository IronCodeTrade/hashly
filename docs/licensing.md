# Licensing

## What is free

The wallet, watch-only mode, the calculator, one read-only connector, and one
desktop "worker offline" alert stay available after the trial. Losing a plan
never locks a seed.

## Trial and plans

| Plan | Price | What it adds |
| --- | --- | --- |
| Free | 0 | Wallet and the basics above |
| Trial | 30 days on this device | Pro convenience. Starts the first time the app is opened. No account |
| Pro | 99 PLN / month | More connectors, advanced alerts, scheduled refresh, CSV export |
| Team | 300 PLN / month | Workspaces limit, team alerts, higher rig cap, report export |
| White-label | Quote | Product name and palette via a validated config |

Prices are licence fees for software. Hashly does not take the payment.
Set `VITE_HASHLY_CHECKOUT_URL` to your own checkout page. There is no card,
BLIK, or crypto payment code in this repository.

The trial clock is local. It is a convenience gate, not a copy-protection
scheme. Setting the clock forward expires it. Setting it backward does not
extend it, because the app remembers the latest time it has seen.

## How a key is checked

A key looks like `HLY1.<payload>.<signature>`. The payload is a canonical
string: plan, subject, seats, rig limit, issued-at, expiry, and the feature
list. The signature is Ed25519. The app verifies it offline with the public
key baked in at build time.

## How the owner issues a key

Development builds trust a **published** key so anyone can try the gate.
See `dev-keys/README.md`.

For a real release:

```bash
npm run license -- keygen --out .hashly/license-private.hex
# keep that file private; the command prints HASHLY_LICENSE_PUBLIC_KEY

VITE_HASHLY_LICENSE_PUBLIC_KEY=<printed public key> npm run build

npm run license -- issue \
  --private-key .hashly/license-private.hex \
  --plan pro \
  --subject miner@example.com \
  --days 30
```

`team` and `whitelabel` are the other plans. `--seats` and `--rigs` cannot
exceed the plan cap. `npm run license -- verify <token>` checks a key.

Give the token to the customer. They paste it into Plans. The app does not
phone home to confirm it.

## Source licences

- Core (`packages/wallet`, `connectors`, `market`, `license`, `i18n`, apps,
  CLI): MIT.
- `packages/pro`: Hashly Commercial License 1.0 (`LICENSE-PRO.md`).
  Personal non-commercial use of the source is allowed. Commercial, team, and
  white-label use needs a key.

Official builds enforce the key. A fork can delete the check. That is an
honest limit of shipping source, and it is why the wallet is not behind it.
