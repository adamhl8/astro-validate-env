import fs from "node:fs/promises"
import type { AstroIntegrationLogger } from "astro"

import type { Vars } from "./index.js"

// eslint-disable-next-line jsdoc/require-jsdoc
export async function generateEnvDeclaration(vars: Vars, logger: AstroIntegrationLogger) {
  const lines: string[] = []
  for (const [key, varConfig] of Object.entries(vars)) {
    if (varConfig.optional) lines.push(`  readonly ${key}?: string`)
    else lines.push(`  readonly ${key}: string`)
  }

  const envDeclartion = `
interface ImportMetaEnv {
${lines.join("\n")}
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
`.trimStart()

  await fs.writeFile("import.meta.env.d.ts", envDeclartion)

  logger.info("Generated 'import.meta.env.d.ts'")
}
