import type { MiningSnapshot } from "./types";

export function demoSnapshots(): MiningSnapshot[] {
  return [
    {
      connectorId: "nicehash",
      label: "Demo NiceHash",
      fetchedAt: new Date().toISOString(),
      hashrateHs: 95.2e12,
      unpaidBtc: 0.000421,
      demo: true,
      workers: [
        { id: "nh-1", name: "garage-a", status: "online", hashrateHs: 70e12, algorithm: "SHA256ASICBOOST" },
        { id: "nh-2", name: "garage-b", status: "online", hashrateHs: 25.2e12, algorithm: "SHA256ASICBOOST" },
        { id: "nh-3", name: "spare", status: "offline", hashrateHs: 0, algorithm: "SHA256ASICBOOST" },
      ],
      notes: ["Sample data. Not your account and not a balance Hashly holds."],
    },
    {
      connectorId: "braiins",
      label: "Demo Braiins Pool",
      fetchedAt: new Date().toISOString(),
      hashrateHs: 152e12,
      unpaidBtc: 0.00088,
      demo: true,
      workers: [
        { id: "br-1", name: "user.s21", status: "online", hashrateHs: 140e12, algorithm: "SHA-256" },
        { id: "br-2", name: "user.hydro", status: "degraded", hashrateHs: 12e12, algorithm: "SHA-256" },
      ],
      notes: ["Sample data copied in the shape of the public Braiins Pool API."],
    },
    {
      connectorId: "cgminer",
      label: "Demo LAN rig",
      fetchedAt: new Date().toISOString(),
      hashrateHs: 0,
      demo: true,
      workers: [{ id: "lan-1", name: "braiins-os", status: "offline", hashrateHs: 0 }],
      notes: ["Sample offline rig. No packet was sent."],
    },
  ];
}
