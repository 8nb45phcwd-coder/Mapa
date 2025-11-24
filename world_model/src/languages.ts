import languagesData from "../data/languages.json" assert { type: "json" };
import type { CountryId, LanguageCatalog, LanguageInfo } from "./types.js";

const catalog: LanguageCatalog = languagesData as LanguageCatalog;
const byCode = new Map<string, LanguageInfo>(catalog.languages.map((l) => [l.code, l]));

export function getAllLanguages(): LanguageInfo[] {
  return catalog.languages;
}

export function getLanguageByCode(code: string): LanguageInfo | undefined {
  return byCode.get(code);
}

export function getCountriesByLanguage(code: string): CountryId[] {
  return byCode.get(code)?.country_ids ?? [];
}

export function getSharedLanguageNeighbours(languageCode: string): Array<{ country_a: CountryId; country_b: CountryId }> {
  const countries = [...(byCode.get(languageCode)?.country_ids ?? [])].sort();
  const pairs: Array<{ country_a: CountryId; country_b: CountryId }> = [];
  for (let i = 0; i < countries.length; i++) {
    for (let j = i + 1; j < countries.length; j++) {
      pairs.push({ country_a: countries[i], country_b: countries[j] });
    }
  }
  return pairs;
}
