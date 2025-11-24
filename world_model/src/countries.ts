import countriesData from "../data/countries.json" assert { type: "json" };
import type { CountryId, CountryMeta } from "./types.js";

const countries: CountryMeta[] = (countriesData as any).countries as CountryMeta[];

export function getAllCountries(): CountryMeta[] {
  return countries;
}

export function getCountryById(id: CountryId): CountryMeta | undefined {
  return countries.find((c) => c.id === id);
}
