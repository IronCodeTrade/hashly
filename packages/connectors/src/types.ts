export type WorkerStatus = "online" | "degraded" | "offline" | "unknown";

export type Worker = {
  id: string;
  name: string;
  status: WorkerStatus;
  hashrateHs: number;
  algorithm?: string;
  lastShareAt?: string;
};

export type MiningSnapshot = {
  connectorId: string;
  label: string;
  fetchedAt: string;
  hashrateHs: number;
  unpaidBtc?: number;
  workers: Worker[];
  demo?: boolean;
  notes: string[];
};

export type ConnectorField = {
  key: string;
  secret?: boolean;
  label: string;
  placeholder?: string;
};

export type ConnectorDefinition = {
  id: string;
  name: string;
  description: string;
  auth: "apiKey" | "token" | "lan";
  localNetwork?: boolean;
  docsUrl: string;
  fields: ConnectorField[];
};

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: "nicehash",
    name: "NiceHash",
    description: "Read-only view of rigs on your own NiceHash organisation. Create a key with mining statistics permission only.",
    auth: "apiKey",
    docsUrl: "https://www.nicehash.com/docs/",
    fields: [
      { key: "organizationId", label: "Organisation ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { key: "apiKey", label: "API key", secret: true },
      { key: "apiSecret", label: "API secret", secret: true },
    ],
  },
  {
    id: "braiins",
    name: "Braiins Pool",
    description: "Read-only workers, hashrate, and rewards from your Braiins Pool access profile. Hashly does not sell Braiins hashpower.",
    auth: "token",
    docsUrl: "https://academy.braiins.com/en/braiins-pool/monitoring/",
    fields: [{ key: "token", label: "Pool-Auth-Token", secret: true, placeholder: "Access profile token" }],
  },
  {
    id: "cgminer",
    name: "Own rig (Braiins OS / CGMiner)",
    description: "Read-only summary from a miner on your LAN. Port 4028 is usually unauthenticated. Do not expose it to the internet.",
    auth: "lan",
    localNetwork: true,
    docsUrl: "https://github.com/ckolivas/cgminer/blob/master/API-README",
    fields: [
      { key: "host", label: "Host", placeholder: "192.168.1.20" },
      { key: "port", label: "Port", placeholder: "4028" },
    ],
  },
];
