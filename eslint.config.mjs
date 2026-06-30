import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // The `LooseSupabase` helper (`lib/supabase/loose-client.ts`) is the only
    // place `any` should appear in a Supabase client type. Re-enable the
    // rule as a warning so we surface new leaks instead of silently allowing
    // them. Use file-level eslint-disable where needed.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // The hook rules were disabled because the prior codebase violated
      // them in a few hot paths. Re-enable as warnings; fix at the source
      // when they fire.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "public/**", // static assets (e.g. the bundled pdf.js worker); never lint
      "next-env.d.ts",
      "coverage/**",
      "lib/database.types.ts", // generated; do not hand-edit
    ],
  },
];

export default config;
