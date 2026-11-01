import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/**", "node_modules/**", "src/interfaces/server/**/*.js"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: ["./config/tsconfig.json", "./config/tsconfig.web.json", "./config/tsconfig.scripts.json"],
        tsconfigRootDir: new URL("..", import.meta.url).pathname,
      },
    },
  },
);
