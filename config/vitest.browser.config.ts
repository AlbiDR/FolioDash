// Component tests in real browsers: the Web Animations API, view transitions, layout and computed styles behave as they
// do for people, which a simulated document cannot give motion components. Chromium uses the Google Chrome already
// installed (or the CHROME_PATH override), like the rendered audits; WebKit and Firefox use Playwright's own builds,
// installed once with `npm run test:browser:install` (owner decision recorded under FD-030).
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const chrome =
  process.env["CHROME_PATH"] === undefined ? { channel: "chrome" } : { executablePath: process.env["CHROME_PATH"] };

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  test: {
    include: ["src/**/*.test.tsx"],
    // Screenshots of a failing test go under the ignored build output, never the repository root.
    attachmentsDir: "dist/browser-tests/attachments",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        { browser: "chromium", provider: playwright({ launchOptions: chrome }) },
        { browser: "webkit" },
        { browser: "firefox" },
      ],
    },
  },
});
