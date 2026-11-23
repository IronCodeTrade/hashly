import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.HASHLY_URL ?? "http://127.0.0.1:4173";
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.locator("select").first().selectOption("en");
await page.getByTestId("enter-demo").click();
await page.getByTestId("overview").waitFor();
await page.screenshot({ path: "docs/screenshots/overview.png" });
await page.getByRole("link", { name: "Mining" }).click();
await page.getByTestId("mining").waitFor();
await page.screenshot({ path: "docs/screenshots/mining.png" });
await page.getByRole("link", { name: "Calculator" }).click();
await page.getByTestId("calc-result").waitFor();
await page.screenshot({ path: "docs/screenshots/calculator.png" });
await page.getByRole("link", { name: "Plans" }).click();
await page.getByTestId("plans").waitFor();
await page.screenshot({ path: "docs/screenshots/plans.png" });
await page.getByRole("button", { name: "Close" }).click();

await page.locator('input[type="password"]').nth(0).fill("correct horse battery");
await page.locator('input[type="password"]').nth(1).fill("correct horse battery");
await page.getByRole("button", { name: "Create local lock" }).click();
await page.getByTestId("overview").waitFor({ timeout: 120_000 });
await page.getByRole("link", { name: "Wallet", exact: true }).click();
await page.getByRole("button", { name: "Create a new wallet" }).click();
await page.getByRole("button", { name: "Show words" }).click();
const words = await page.locator(".words li").allTextContents();
if (words.length !== 12) throw new Error(`seed length ${words.length}`);
const labels = page.locator("article.card label");
const count = await labels.count();
for (let i = 0; i < count; i += 1) {
  const text = await labels.nth(i).innerText();
  const position = Number(text.match(/\d+/)?.[0]);
  await labels.nth(i).locator("input").fill(words[position - 1] ?? "");
}
await page.getByRole("button", { name: "Save" }).click();
await page.getByTestId("receive").waitFor();
const address = (await page.locator(".addr").first().innerText()).trim();
if (!address.startsWith("tb1q")) throw new Error(`unexpected address ${address}`);

await page.getByRole("textbox", { name: "Destination" }).fill(address);
await page.getByRole("textbox", { name: "Amount (BTC)" }).fill("0.00010000");
await page.getByRole("textbox", { name: "UTXO txid" }).fill("11".repeat(32));
await page.getByRole("textbox", { name: "Output index" }).fill("0");
await page.getByRole("textbox", { name: "UTXO value (sats)" }).fill("100000");
await page.getByRole("button", { name: "Sign transaction" }).click();
await page.getByText("Signed locally").waitFor({ timeout: 30_000 });
const hex = await page.locator(".addr").nth(1).innerText();
if (!/^[0-9a-fA-F]+$/.test(hex.trim())) throw new Error("signature hex missing");
await page.screenshot({ path: "docs/screenshots/wallet.png" });

await page.getByRole("link", { name: "Security" }).click();
await page.getByTestId("security").waitFor();
await page.screenshot({ path: "docs/screenshots/security.png" });

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
console.log(`wallet ${address}`);
console.log(`signed ${hex.trim().slice(0, 32)}…`);
await browser.close();
