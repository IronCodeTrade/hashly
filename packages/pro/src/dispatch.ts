// SPDX-License-Identifier: LicenseRef-Hashly-Commercial-1.0

type FetchLike = typeof fetch;

export async function sendTelegram(opts: {
  token: string;
  chatId: string;
  text: string;
  fetchImpl?: FetchLike;
}): Promise<void> {
  if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(opts.token)) throw new Error("bad-telegram-token");
  if (!/^-?\d{1,20}$/.test(opts.chatId)) throw new Error("bad-chat");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${opts.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: opts.chatId, text: opts.text.slice(0, 1000) }),
  });
  if (!response.ok) throw new Error("telegram-failed");
}

export async function sendWebhook(url: string, payload: unknown, fetchImpl: FetchLike = fetch): Promise<void> {
  const parsed = new URL(url);
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) throw new Error("webhook-https");
  const response = await fetchImpl(parsed.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("webhook-failed");
}
