import countriesData from "../data/countries.json" assert { type: "json" };
import schemesData from "../data/schemes.json" assert { type: "json" };
import tagsData from "../data/tags.json" assert { type: "json" };

export interface CountryMeta {
  id: string; // ISO3
  iso2?: string;
  name: string;
  un_region: string;
  un_subregion: string;
  iso_numeric?: string;
}

export interface SchemeDescriptor {
  id: string;
  label: string;
  exclusive: boolean;
  groups: string[];
}

export interface WorldModelSchemes {
  schemes: SchemeDescriptor[];
}

export interface CountryTagEntry {
  world_system_position: string | null;
  global_north_south: string | null;
  geo_political_blocs: string[];
  economic_blocs: string[];
  financial_structures: string[];
  regional_organizations: string[];
  currency_systems: string[];
  [key: string]: string | string[] | null;
}

export type CountryTags = Record<string, CountryTagEntry>;

const countries: CountryMeta[] = countriesData as CountryMeta[];
const schemes: WorldModelSchemes = schemesData as WorldModelSchemes;
const tags: CountryTags = tagsData as CountryTags;

/** Load neutral country metadata (ISO/UN) for all engine countries. */
export async function loadCountries(): Promise<CountryMeta[]> {
  return countries;
}

/** Load declared classification schemes (no assignments yet). */
export async function loadSchemes(): Promise<WorldModelSchemes> {
  return schemes;
}

/** Load country tags (all null/empty placeholders for now). */
export async function loadCountryTags(): Promise<CountryTags> {
  return tags;
}

/** Lookup metadata for a given country id (ISO3). */
export function getCountryMeta(id: string): CountryMeta | undefined {
  return countries.find((c) => c.id === id);
}

/** Lookup tag snapshot (all-empty values) for a given country id. */
export function getCountryTagSnapshot(id: string): CountryTagEntry | undefined {
  return tags[id];
}

export { countries, schemes, tags };
