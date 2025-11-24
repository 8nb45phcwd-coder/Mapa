export type CountryId = string;

export interface CountryMeta {
  id: CountryId;
  iso2: string;
  iso_numeric: string;
  name_en: string;
  name_native: string;
  un_region: string;
  un_subregion: string;
}

export interface SchemeDefinition {
  id: string;
  label: string;
  exclusive: boolean;
  groups: string[];
  description?: string;
}

export interface SchemeCatalog {
  schemes: SchemeDefinition[];
}

export interface MembershipEntry {
  scheme: string;
  group: string;
  members: CountryId[];
  source?: string;
  fetched_at?: string;
}

export interface MembershipCatalog {
  memberships: MembershipEntry[];
}

export interface CountryTags {
  [schemeId: string]: string | string[] | null;
}

export interface CountryTagMap {
  [countryId: CountryId]: CountryTags;
}

export interface LanguageInfo {
  code: string;
  name_en: string;
  family: string;
  regions: string[];
  country_ids: CountryId[];
}

export interface LanguageCatalog {
  languages: LanguageInfo[];
}

export interface BorderSemanticEntry {
  segment_id: string;
  tags: string[];
}

export interface BorderSemanticCatalog {
  segments: BorderSemanticEntry[];
}

export interface MarxistTagEntry {
  world_system_position?: string | null;
  global_north_south?: string | null;
  [schemeId: string]: string | string[] | null | undefined;
}

export interface MarxistTagMap {
  [countryId: CountryId]: MarxistTagEntry;
}
