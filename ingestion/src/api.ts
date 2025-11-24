import type { Country } from "world-map-engine";
import {
  ingestInfrastructure,
  defaultInfraSources,
  type InfraIngestOptions,
  type InfraSourceConfig,
  type IngestedInfrastructure,
} from "./infrastructureIngest.js";

export interface IngestionOptions extends InfraIngestOptions {
  configs?: InfraSourceConfig[];
}

/**
 * High-level ingestion entry point that retains the existing behaviour while
 * decoupling dataset loading from the core engine. Callers must supply the
 * world geometry (TopoJSON) and the list of countries to index against.
 */
export async function loadAllInfrastructure(
  worldData: any,
  countries: Country[],
  options?: IngestionOptions
): Promise<IngestedInfrastructure> {
  const configs = options?.configs ?? defaultInfraSources;
  return ingestInfrastructure(configs, worldData, countries, options);
}

export { ingestInfrastructure, defaultInfraSources };
export type { InfraIngestOptions, InfraSourceConfig, IngestedInfrastructure };
