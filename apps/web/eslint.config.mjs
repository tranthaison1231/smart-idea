import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/_shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/_app/**",
                "@/_pages/**",
                "@/_widgets/**",
                "@/_features/**",
                "@/_entities/**",
                "@/app/**",
              ],
              message: "Shared modules cannot import from higher layers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/_widgets/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/_app/**", "@/_pages/**", "@/app/**"],
              message: "Widgets cannot import from higher layers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/_pages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/_app/**", "@/app/**"],
              message: "Page slices cannot import from the app or routing layers.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
  ]),
]);

export default eslintConfig;
