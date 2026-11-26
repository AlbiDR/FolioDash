// Component tests in a real browser: the Web Animations API, view transitions, layout and computed styles behave as
// they do for people, which a simulated document cannot give motion components. They drive the Google Chrome already
// installed (locally and on CI's runners), so no browser is downloaded. Owner decision recorded under FD-008.
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  test: {
    include: ["src/**/*.test.tsx"],
    // Screenshots of a failing test go under the ignored build output, never the repository root.
    attachmentsDir: "dist/browser-tests/attachments",
    browser: {
      enabled: true,
      headless: true,
      // The Chrome the rendered audits use: the CHROME_PATH override, or the installed Google Chrome.
      provider: playwright({
        launchOptions:
          process.env["CHROME_PATH"] === undefined
            ? { channel: "chrome" }
            : { executablePath: process.env["CHROME_PATH"] },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
