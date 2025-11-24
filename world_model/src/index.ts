import * as base from "./base/index.js";
import * as marxist from "./marxist/index.js";
export * from "./types.js";

// Base layer APIs
export const getBaseCountries = base.getBaseCountries;
export const getCountryMeta = base.getBaseCountryById;
export const getBaseSchemes = base.getBaseSchemes;
export const getBaseSchemeById = base.getBaseSchemeById;
export const getBaseMemberships = base.getBaseMemberships;
export const getBaseSchemeMembers = base.getBaseSchemeMembers;
export const getCountryBaseTags = base.getCountryBaseTags;
export const getAllCountryBaseTags = base.getAllCountryBaseTags;
export const getCountryLanguages = base.getCountryLanguages;
export const getBaseLanguages = base.getBaseLanguages;
export const getCountriesByLanguage = base.getCountriesByLanguage;
export const getLanguageByCode = base.getLanguageByCode;
export const getSharedLanguageNeighbours = base.getSharedLanguageNeighbours;
export const getBaseBorderSemantics = base.getBaseBorderSemantics;
export const getBorderSemanticsBySegmentId = base.getBorderSemanticsBySegmentId;
export const getSegmentsBySemanticTag = base.getSegmentsBySemanticTag;

export async function loadCountries() {
  return base.getBaseCountries();
}

export async function loadSchemes() {
  return { schemes: base.getBaseSchemes() };
}

export async function loadCountryTags() {
  return base.getAllCountryBaseTags();
}

export async function loadBaseFacts() {
  return {
    countries: base.getBaseCountries(),
    schemes: base.getBaseSchemes(),
    memberships: base.getBaseMemberships(),
    borderSemantics: base.getBaseBorderSemantics(),
  };
}

// Marxist layer APIs
export const getMarxistSchemes = marxist.getMarxistSchemes;
export const getMarxistSchemeById = marxist.getMarxistSchemeById;
export const getMarxistTags = marxist.getMarxistTags;
export const getAllMarxistTags = marxist.getAllMarxistTags;
export const getCountriesWithMarxistGroup = marxist.getCountriesWithMarxistGroup;
export const validateMarxistTagEntry = marxist.validateMarxistTagEntry;

export async function loadMarxistTags() {
  return marxist.getAllMarxistTags();
}
