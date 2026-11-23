const UNITS: Record<string, number> = {
  "h/s": 1,
  "kh/s": 1e3,
  "mh/s": 1e6,
  "gh/s": 1e9,
  "th/s": 1e12,
  "ph/s": 1e15,
};

export function toHashrateHs(value: number, unit: string): number {
  const factor = UNITS[unit.trim().toLowerCase()];
  if (!factor || !Number.isFinite(value)) return 0;
  return value * factor;
}

export function formatHashrate(hs: number): string {
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
  let value = Math.max(0, hs);
  let index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[index]}`;
}
