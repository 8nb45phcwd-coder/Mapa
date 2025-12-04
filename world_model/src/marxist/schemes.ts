import schemesData from "../../marxist/data/schemes.json";
import type { SchemeCatalog, SchemeDefinition } from "../types.js";

const schemes: SchemeDefinition[] = (schemesData as SchemeCatalog).schemes;
const byId = new Map<string, SchemeDefinition>(schemes.map((s) => [s.id, s]));

export function getMarxistSchemes(): SchemeDefinition[] {
  return schemes;
}

export function getMarxistSchemeById(id: string): SchemeDefinition | undefined {
  return byId.get(id);
}
