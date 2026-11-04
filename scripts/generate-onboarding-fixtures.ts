import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createOnboardingFixtures, ONBOARDING_EXPECTED } from "../tests/fixtures/OnboardingFiles";

const OUTPUT = "dist/acceptance/onboarding";

// Only generated synthetic files are written here. No financial input or Google access.
for (const [name, bytes] of await createOnboardingFixtures()) {
  const path = join(OUTPUT, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  process.stdout.write(`Wrote synthetic fixture: ${path}\n`);
}
writeFileSync(join(OUTPUT, "expected-results.json"), `${JSON.stringify(ONBOARDING_EXPECTED, null, 2)}\n`);
process.stdout.write("Generated local acceptance files only. No Google calls or device transfers were made.\n");
