import { ESLintConfigBuilder } from "eslint-config-builder"
import tseslint from "typescript-eslint"

const eslintConfig = new ESLintConfigBuilder().jsonYamlToml().testing().build()

export default tseslint.config({ ignores: ["dist/"] }, eslintConfig)
