import { vitestConfig } from "@adamhl8/configs"
import { coverageConfigDefaults, defineConfig } from "vitest/config"

const config = vitestConfig({
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      exclude: [...coverageConfigDefaults.exclude, "src/__tests__/fixture/**"],
    },
  },
})

export default defineConfig(config)
