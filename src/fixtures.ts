import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function fixturesDir(): string {
  return join(here, "..", "fixtures");
}

export function listFixtureFiles(): string[] {
  return readdirSync(fixturesDir())
    .filter((f) => f.endsWith(".json"))
    .sort();
}

export function loadFixture(name: string): unknown {
  const file = name.endsWith(".json") ? name : `${name}.json`;
  return JSON.parse(readFileSync(join(fixturesDir(), file), "utf8"));
}
