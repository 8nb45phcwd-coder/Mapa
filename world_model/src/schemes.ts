import schemesData from "../data/schemes.json" assert { type: "json" };
import type { SchemeCatalog, SchemeDefinition } from "./types.js";

const schemeCatalog: SchemeCatalog = schemesData as SchemeCatalog;

export function getAllSchemes(): SchemeDefinition[] {
  return schemeCatalog.schemes;
}

export function getSchemeById(id: string): SchemeDefinition | undefined {
  return schemeCatalog.schemes.find((s) => s.id === id);
}
