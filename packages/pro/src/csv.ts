// SPDX-License-Identifier: LicenseRef-Hashly-Commercial-1.0

export type CsvRow = {
  date: string;
  source: string;
  btc: string;
  fiat?: string;
  currency?: string;
  note?: string;
};

function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Pool-reported or estimated figures for your own spreadsheet. Not tax advice. */
export function miningCsv(rows: CsvRow[]): string {
  const header = "date,source,btc_amount,fiat_amount,fiat_currency,note";
  const lines = rows.map((row) =>
    [row.date, row.source, row.btc, row.fiat ?? "", row.currency ?? "", row.note ?? ""].map(cell).join(","),
  );
  return [
    "# Hashly export. Not tax advice. Amounts are pool-reported or estimates, not a balance Hashly holds.",
    header,
    ...lines,
  ].join("\n");
}
