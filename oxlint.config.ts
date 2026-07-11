import { oxlintConfig } from "@adamhl8/configs"
import { defineConfig } from "oxlint"

const config = oxlintConfig({
  ignorePatterns: ["src/__tests__/fixture/**"],
  overrides: [
    {
      files: ["src/__tests__/**/*.test.ts", "src/test-setup.ts"],
      rules: {
        "node/no-process-env": "off",
      },
    },
  ],
})

export default defineConfig(config)
