import type { CountryId, CountryTags } from "../types.js";
import { getBaseCountries, getBaseCountryById } from "./countries.js";
import {
  getBaseLanguages,
  getCountriesByLanguage,
  getLanguageByCode,
  getSharedLanguageNeighbours,
  getLanguageCodesForCountry,
} from "./languages.js";
import { getBaseSchemes, getBaseSchemeById } from "./schemes.js";
import {
  getBaseMemberships,
  getBaseSchemeMembers,
  getCountryBaseTags,
  getAllCountryBaseTags,
} from "./memberships.js";
import {
  getBaseBorderSemantics,
  getBorderSemanticsBySegmentId,
  getSegmentsBySemanticTag,
} from "./borderSemantics.js";

export {
  getBaseCountries,
  getBaseCountryById,
  getBaseLanguages,
  getCountriesByLanguage,
  getLanguageByCode,
  getSharedLanguageNeighbours,
  getBaseSchemes,
  getBaseSchemeById,
  getBaseMemberships,
  getBaseSchemeMembers,
  getCountryBaseTags,
  getAllCountryBaseTags,
  getBaseBorderSemantics,
  getBorderSemanticsBySegmentId,
  getSegmentsBySemanticTag,
};

export function getCountryBaseTagsSafe(id: CountryId): CountryTags | undefined {
  return getCountryBaseTags(id);
}

export function getCountryLanguages(id: CountryId): string[] {
  return getLanguageCodesForCountry(id);
}
