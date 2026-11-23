# Contributing

Thanks for looking. Hashly is a wallet people have to trust, so small, tested
changes are better than a wide rewrite.

## Ground rules

- Do not add custody, hashrate sales, deposits, or copy that promises profit.
- Do not put a seed, a pool secret, or a production licence private key in an
  issue, a pull request, or a test fixture that looks real.
- Wallet behaviour stays available without a paid plan.
- Use the libraries already in `packages/wallet`. Do not add a homegrown cipher.
- Core files stay MIT. Files under `packages/pro` stay under `LICENSE-PRO.md`.

## Setup

Node.js 22.

```bash
npm ci
npm test
npm run lint
npm run dev          # API on 127.0.0.1:8787
npm run dev:web      # UI on 127.0.0.1:5173
```

## A connector

Read [docs/connectors.md](docs/connectors.md). Add a parser, a read-only route,
and a test that mocks the HTTP call. Reject anything that would change a miner
or buy hashrate.

## A translation

`packages/i18n/src/en.ts` is the source. The other four locales are typed
against it, so a missing string fails `npm run lint`.

## Pull requests

Use the template. Run `npm test` and `npm run lint`. Say whether the change is
MIT core or the commercial Pro modules.

## Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security reports go through
[SECURITY.md](SECURITY.md), not a public issue.
