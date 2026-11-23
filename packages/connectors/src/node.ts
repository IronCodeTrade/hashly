import net from "node:net";
import { assertCgminerCommand, isPrivateHost, parseCgminer } from "./cgminer";

export function queryCgminer(host: string, port: number, command = "summary", timeoutMs = 4000): Promise<string> {
  const allowed = assertCgminerCommand(command);
  if (!isPrivateHost(host)) throw new Error("host-not-private");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("bad-port");
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timeout"));
    }, timeoutMs);
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ command: allowed })}\n`);
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

export async function readLanMiner(host: string, port = 4028, label?: string) {
  const [summary, devs] = await Promise.all([
    queryCgminer(host, port, "summary"),
    queryCgminer(host, port, "devs").catch(() => ""),
  ]);
  return parseCgminer(summary, devs, label || host);
}
