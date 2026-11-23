# Connector SDK

A connector is a read-only adapter. It must not place hashpower orders, change
a pool, or move coins. Hashly does not sell hashrate. People connect accounts
they already have.

## Shape

```ts
import type { ConnectorDefinition, MiningSnapshot } from "@hashly/connectors";

export const myPool: ConnectorDefinition = {
  id: "my-pool",
  name: "My Pool",
  description: "Read-only workers on an account the user already owns.",
  auth: "token",
  docsUrl: "https://example.com/api",
  fields: [{ key: "token", label: "Read-only token", secret: true }],
};
```

Add the definition to `CONNECTORS` in `packages/connectors/src/types.ts`.
Add a pure parser next to `parseBraiins` and a server route that calls only
the documented read URL. Keep the parser free of `node:net` so the browser
bundle can import the package. Put sockets in `packages/connectors/src/node.ts`.

Return a `MiningSnapshot`:

- `hashrateHs` in hashes per second
- workers with `online`, `degraded`, `offline`, or `unknown`
- `notes` that say the unpaid amount belongs to the pool, not to Hashly

## Rules that tests should lock

- Secrets are not interpolated into error messages.
- LAN miners accept private addresses only.
- Control commands such as `restart` and `addpool` throw `command-not-allowed`.
- NiceHash paths outside the mining-read allowlist throw `path-not-allowed`.

## Included in 0.1.0

| Id | Account | Notes |
| --- | --- | --- |
| `nicehash` | Your organisation, VMDS / view-mining permission | HMAC signed the way the NiceHash docs describe. No order endpoints |
| `braiins` | Your access-profile token (`Pool-Auth-Token`) | Workers and profile. Braiins does not publish a stable API for buying hashpower, so this connector does not pretend to |
| `cgminer` | Braiins OS or CGMiner on the LAN, port 4028 | Read-only. The port is often unauthenticated. Do not forward it |

Demo mode uses `demoSnapshots()` and does not touch the network.
