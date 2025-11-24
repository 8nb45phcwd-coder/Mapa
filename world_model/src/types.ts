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

export type SchemeAssignment = string | string[] | null;

export interface CountryTagEntry {
  [schemeId: string]: SchemeAssignment;
}

export type CountryTags = Record<CountryId, CountryTagEntry>;

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
