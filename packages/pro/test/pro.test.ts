import { describe, expect, it, vi } from "vitest";
import { brandStyle, miningCsv, parseBrand, sendTelegram, sendWebhook, shouldRefresh } from "../src/index";

describe("pro modules", () => {
  it("builds a CSV that states it is not tax advice", () => {
    const csv = miningCsv([{ date: "2026-01-02", source: "Braiins Pool", btc: "0.001", fiat: "400", currency: "PLN", note: 'said "est."' }]);
    expect(csv.startsWith("# Hashly export. Not tax advice.")).toBe(true);
    expect(csv).toContain('"said ""est."""');
  });

  it("refreshes on the Pro schedule and not faster than every five minutes", () => {
    expect(shouldRefresh(null, 15, 1_000)).toBe(true);
    expect(shouldRefresh(0, 15, 14 * 60_000)).toBe(false);
    expect(shouldRefresh(0, 15, 15 * 60_000)).toBe(true);
    expect(shouldRefresh(null, 1, 0)).toBe(false);
  });

  it("accepts a white-label palette and rejects scriptable links", () => {
    expect(brandStyle(parseBrand({ productName: "Northmill", accent: "#ff7a1a", graphite: "#121214" }))["--accent"]).toBe("#ff7a1a");
    expect(() => parseBrand({ productName: "X", accent: "red", graphite: "#000000" })).toThrow("bad-brand");
    expect(() => parseBrand({ productName: "North", accent: "#112233", graphite: "#000000", supportUrl: "javascript:alert(1)" })).toThrow();
  });

  it("posts Telegram and webhook alerts without accepting plain http hosts", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    await sendTelegram({
      token: "123456:AAAAAAAAAAAAAAAAAAAA",
      chatId: "42",
      text: "worker offline",
      fetchImpl,
    });
    const firstCall = fetchImpl.mock.calls[0] as unknown[] | undefined;
    expect(String(firstCall?.[0])).toContain("https://api.telegram.org/bot");
    await expect(sendWebhook("http://example.com/hook", {}, fetchImpl)).rejects.toThrow("webhook-https");
    await sendWebhook("https://alerts.example/hook", { ok: true }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
