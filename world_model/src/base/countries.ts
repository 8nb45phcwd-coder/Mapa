import countriesData from "../../base/data/countries.json" assert { type: "json" };
import type { CountryId, CountryMeta } from "../types.js";

const countries: CountryMeta[] = (countriesData as { countries: CountryMeta[] }).countries;
const byId = new Map<CountryId, CountryMeta>(countries.map((c) => [c.id, c]));

export function getBaseCountries(): CountryMeta[] {
  return countries;
}

export function getBaseCountryById(id: CountryId): CountryMeta | undefined {
  return byId.get(id);
}
