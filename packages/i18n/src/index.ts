import { en } from "./en";
import { pl } from "./pl";
import { de } from "./de";
import { es } from "./es";
import { ru } from "./ru";
import { format, LOCALES, type Dict, type Locale } from "./types";

export const dictionaries: Record<Locale, Dict> = { en, pl, de, es, ru };

export function messages(locale: Locale): Dict {
  return dictionaries[locale] ?? en;
}

export { format, LOCALES };
export type { Dict, Locale };
