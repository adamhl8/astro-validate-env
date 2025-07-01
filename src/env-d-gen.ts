import fs from "node:fs/promises"
import path from "node:path"
import type { AstroIntegrationLogger } from "astro"

import type { Vars } from "./index.js"

export async function generateEnvDeclaration(
  vars: Vars,
  envDeclarationFilePath: string,
  logger: AstroIntegrationLogger,
) {
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

  await fs.mkdir(path.dirname(envDeclarationFilePath), { recursive: true })
  await fs.writeFile(envDeclarationFilePath, envDeclartion)

  logger.info(`Generated '${envDeclarationFilePath}'`)
}
