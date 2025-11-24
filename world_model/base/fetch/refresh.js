import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const membershipsPath = path.join(dataDir, "memberships.json");

const urlMap = {
  "geo_political_blocs:nato": "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/NATO%20members/NATO%20members.csv",
  "economic_blocs:eu_customs_union": "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/European%20Union%20(EU)%20membership/European%20Union%20(EU)%20membership.csv",
  "regional_organizations:schengen_area": "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Schengen%20Area/Schengen%20Area.csv",
  "financial_structures:wto_member": "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/World%20Trade%20Organization%20(WTO)%20membership/World%20Trade%20Organization%20(WTO)%20membership.csv",
};

function keyOf(entry) {
  return `${entry.scheme}:${entry.group}`;
}

function normalizeIso3(code) {
  return code.trim().toUpperCase();
}

function parseCsvFirstColumn(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const body = lines[0].includes(",") ? lines.slice(1) : lines; // drop header if comma separated
  return body
    .map((line) => line.split(/,|;|\t/)[0])
    .map(normalizeIso3)
    .filter((v) => v.length === 3);
}

function parseJsonMembers(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(normalizeIso3);
    if (parsed.members) return (parsed.members ?? []).map(normalizeIso3);
    if (parsed.data) return (parsed.data ?? []).map(normalizeIso3);
  } catch (err) {
    // ignore
  }
  return [];
}

async function loadFallback() {
  try {
    const raw = await fs.readFile(membershipsPath, "utf8");
    return JSON.parse(raw)?.memberships ?? [];
  } catch {
    return [];
  }
}

async function fetchMembership(entry, fallbackMembers) {
  const key = keyOf(entry);
  const url = urlMap[key];
  if (!url) {
    return {
      ...entry,
      members: entry.members ?? fallbackMembers ?? [],
      fetched_at: new Date().toISOString(),
      source: entry.source ?? "fallback",
    };
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const members =
      text.trim().startsWith("{") || text.trim().startsWith("[")
        ? parseJsonMembers(text)
        : parseCsvFirstColumn(text);
    if (!members.length && fallbackMembers?.length) {
      return { ...entry, members: fallbackMembers, fetched_at: new Date().toISOString(), source: url };
    }
    return { ...entry, members, fetched_at: new Date().toISOString(), source: url };
  } catch (err) {
    console.warn(`using fallback for ${key}: ${err?.message ?? err}`);
    return {
      ...entry,
      members: entry.members ?? fallbackMembers ?? [],
      fetched_at: new Date().toISOString(),
      source: url ?? entry.source ?? "fallback",
    };
  }
}

async function refresh() {
  const fallbackEntries = await loadFallback();
  const fallbackMap = new Map(fallbackEntries.map((e) => [keyOf(e), e]));
  const targets = fallbackEntries.map((entry) => ({ ...entry }));

  const refreshed = [];
  for (const entry of targets) {
    const fb = fallbackMap.get(keyOf(entry));
    refreshed.push(await fetchMembership(entry, fb?.members));
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(membershipsPath, JSON.stringify({ memberships: refreshed }, null, 2));
  console.info(`Updated memberships (${refreshed.length}) at ${membershipsPath}`);
}

refresh().catch((err) => {
  console.error(err);
  process.exit(1);
});
