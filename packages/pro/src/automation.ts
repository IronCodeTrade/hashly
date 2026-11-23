// SPDX-License-Identifier: LicenseRef-Hashly-Commercial-1.0

export function shouldRefresh(last: number | null, everyMinutes: number, now: number): boolean {
  if (!Number.isFinite(everyMinutes) || everyMinutes < 5 || everyMinutes > 24 * 60) return false;
  if (last == null) return true;
  return now - last >= everyMinutes * 60_000;
}
