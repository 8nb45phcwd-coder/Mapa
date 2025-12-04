import { defaultInfraSources, type InfraSourceConfig } from "./infrastructureIngest.js";

export interface RefreshInfraConfig extends InfraSourceConfig {
  outputFixtureName: string;
  description?: string;
}

export const refreshInfraConfig: RefreshInfraConfig[] = defaultInfraSources.map((entry) => ({
  ...entry,
  outputFixtureName: entry.fixture ?? `${entry.sourceId}.geojson`,
  description: entry.notes,
}));
