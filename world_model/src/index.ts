import { getAllCountries, getCountryById } from "./countries.js";
import { getAllSchemes, getSchemeById } from "./schemes.js";
import {
  getAllCountryTags,
  getCountryTags,
  getCountriesByTag,
} from "./tags.js";
import {
  getAllLanguages,
  getLanguageByCode,
  getCountriesByLanguage,
  getSharedLanguageNeighbours,
} from "./languages.js";
import {
  getBorderSemantics,
  getBorderSemanticsBySegmentId,
  getSegmentsBySemanticTag,
} from "./borderSemantics.js";
export * from "./types.js";

export { getAllCountries, getCountryById as getCountryMeta };
export { getAllSchemes, getSchemeById };
export { getAllCountryTags, getCountryTags as getCountryTagSnapshot, getCountriesByTag };
export {
  getAllLanguages,
  getLanguageByCode,
  getCountriesByLanguage,
  getSharedLanguageNeighbours,
};
export {
  getBorderSemantics,
  getBorderSemanticsBySegmentId,
  getSegmentsBySemanticTag,
};

export async function loadCountries() {
  return getAllCountries();
}

export async function loadSchemes() {
  return { schemes: getAllSchemes() };
}

export async function loadCountryTags() {
  return getAllCountryTags();
}
