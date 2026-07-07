import { vitestConfig } from "@adamhl8/configs"
import { coverageConfigDefaults, defineConfig } from "vitest/config"

const config = vitestConfig({
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      exclude: [...coverageConfigDefaults.exclude, "src/__tests__/fixture/**"],
    },
  },
})

export default defineConfig(config)
