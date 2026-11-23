import type { MessageTree } from "./en";

export type Dict = {
  [K in keyof MessageTree]: MessageTree[K] extends string ? string : { [P in keyof MessageTree[K]]: string };
};

export const LOCALES = ["pl", "en", "de", "ru", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
