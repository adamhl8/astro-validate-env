import node from "@astrojs/node"
import validateEnv from "astro-validate-env"
import { defineConfig } from "astro/config"

import { validateEnvOptions } from "./validate-env-options"

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [validateEnv(validateEnvOptions)],
})
