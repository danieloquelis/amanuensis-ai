import { readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Architecture rules. See docs/architecture/code-conventions.md.
const MODULES = readdirSync(new URL("./modules", import.meta.url));
const PUBLIC_ENTRYPOINT =
  'Import other modules through their public entrypoint: "@/modules/<name>" or "@/modules/<name>/ui".';
const CROSS_MODULE_IMPORTS = { group: ["@/modules/*/*", "!@/modules/*/ui"], message: PUBLIC_ENTRYPOINT };
// Relative imports stay inside their own module.
const RELATIVE_CROSS_MODULE_IMPORTS = {
  group: MODULES.flatMap((name) => [`../**/${name}`, `../**/${name}/**`]),
  message: PUBLIC_ENTRYPOINT,
};
const FRAMEWORK_IMPORTS = [
  {
    group: ["react", "react-dom", "react/*", "react-dom/*", "next", "next/*"],
    message: "domain/ and application/ stay framework-free.",
  },
  { group: ["**/ui", "**/ui/**", "@/modules/*/ui"], message: "domain/ and application/ must not depend on UI." },
  {
    group: ["**/infrastructure/**"],
    message: "Depend on a port, not an adapter: infrastructure implements application ports.",
  },
];
const BROWSER_GLOBALS = ["window", "document", "localStorage", "sessionStorage", "navigator", "AudioContext"].map(
  (name) => ({
    name,
    message: "Browser APIs belong in infrastructure/ or ui/.",
  }),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [CROSS_MODULE_IMPORTS, RELATIVE_CROSS_MODULE_IMPORTS] }],
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["modules/*/domain/**", "modules/*/application/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [CROSS_MODULE_IMPORTS, RELATIVE_CROSS_MODULE_IMPORTS, ...FRAMEWORK_IMPORTS] },
      ],
      "no-restricted-globals": ["error", ...BROWSER_GLOBALS],
    },
  },
  {
    files: ["modules/*/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            CROSS_MODULE_IMPORTS,
            RELATIVE_CROSS_MODULE_IMPORTS,
            ...FRAMEWORK_IMPORTS,
            { group: ["**/application/**"], message: "domain/ is the innermost layer." },
          ],
        },
      ],
    },
  },
  {
    files: ["shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/modules/*"], message: "shared/ must not depend on modules." }] },
      ],
    },
  },
  {
    files: ["tests/**"],
    rules: { "max-lines": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".pnp.*",
    ".yarn/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
