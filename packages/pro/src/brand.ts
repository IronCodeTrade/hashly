// SPDX-License-Identifier: LicenseRef-Hashly-Commercial-1.0

export type BrandConfig = {
  productName: string;
  accent: string;
  graphite: string;
  supportUrl?: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function parseBrand(input: unknown): BrandConfig {
  const body = input as Partial<BrandConfig>;
  const productName = String(body.productName ?? "").trim();
  if (productName.length < 2 || productName.length > 32) throw new Error("bad-brand");
  if (!HEX.test(body.accent ?? "") || !HEX.test(body.graphite ?? "")) throw new Error("bad-brand");
  let supportUrl: string | undefined;
  if (body.supportUrl) {
    const url = new URL(body.supportUrl);
    if (url.protocol !== "https:") throw new Error("bad-brand");
    supportUrl = url.toString();
  }
  return { productName, accent: body.accent!, graphite: body.graphite!, supportUrl };
}

export function brandStyle(brand: BrandConfig): Record<string, string> {
  return {
    "--bg": brand.graphite,
    "--orange": brand.accent,
    "--accent": brand.accent,
  };
}
