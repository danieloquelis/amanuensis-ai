import { readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Architecture rules. See docs/architecture/code-conventions.md.
const MODULES = readdirSync(new URL("./modules", import.meta.url));
const PUBLIC_ENTRYPOINT =
  'Import other modules through their public entrypoint: "@/modules/<name>" or "@/modules/<name>/ui".';
const CROSS_MODULE_IMPORTS = {
  group: ["@/modules/*/*", "!@/modules/*/ui", "!@/modules/*/server"],
  message: PUBLIC_ENTRYPOINT,
};
// Server entrypoints hold secrets (API keys); they must never reach client bundles.
const SERVER_ENTRYPOINTS = {
  group: ["@/modules/*/server", "**/server"],
  message: "UI code must not import server-only modules.",
};
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
// Bar events, voice bars and bar styles are read and written only through score/domain/voice-access.ts, so a
// bar can hold several voices. Score measures are recognised by name (measure, m, …Measure) or by
// coming from `.measures[i]` / `.measure`; engraving scenes and playback plans are other types.
const BAR_DATA = "/^(events|style|voices)$/";
const VOICE_ACCESS = "Read bar events and styles through voice-access (barEvents, voiceBars, barStyle, …).";
const BAR_DATA_ACCESS = [
  `MemberExpression[property.name=${BAR_DATA}][object.type='Identifier'][object.name=/^m$|[Mm]easure$/]`,
  `MemberExpression[property.name=${BAR_DATA}][object.type='MemberExpression'][object.property.name='measure']`,
  `MemberExpression[property.name=${BAR_DATA}][object.type='MemberExpression'][object.object.property.name='measures']`,
].map((selector) => ({ selector, message: VOICE_ACCESS }));

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
    files: ["modules/*/ui/**", "shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [CROSS_MODULE_IMPORTS, RELATIVE_CROSS_MODULE_IMPORTS, SERVER_ENTRYPOINTS] },
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
    files: ["modules/**/*.{ts,tsx}"],
    ignores: ["modules/score/domain/voice-access.ts", "modules/score/domain/migrations.ts"],
    rules: { "no-restricted-syntax": ["error", ...BAR_DATA_ACCESS] },
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
