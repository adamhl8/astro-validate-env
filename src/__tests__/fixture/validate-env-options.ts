// We need to pull this out into its own file or else we run into a bootstrap issue where `e2e.test.ts` would import `astro.config.ts`. `astro.config.ts` tries to import `@astrojs/node` but fails because it hasn't been installed yet.

export const validateEnvOptions = {
  vars: {
    TEST_REQUIRED: {},
    TEST_URL: { context: ["dev", "build"], url: true },
    TEST_OPTIONAL: { optional: true },
    TEST_SECRET: { context: ["server"], secret: true, startsWith: "sk-" },
  },
}
