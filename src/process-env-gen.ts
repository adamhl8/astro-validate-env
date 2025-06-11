import fs from "node:fs/promises"

import type { Vars } from "./index.js"

// eslint-disable-next-line jsdoc/require-jsdoc
export async function generateProcessEnvDeclaration(vars: Vars) {
  const lines: string[] = []
  for (const [key, varConfig] of Object.entries(vars)) {
    if (varConfig.optional) lines.push(`      readonly ${key}?: string`)
    else lines.push(`      readonly ${key}: string`)
  }

  const envDeclartion = `
declare global {
  namespace NodeJS {
    interface ProcessEnv {
${lines.join("\n")}
    }
  }
}

export {}
`.trimStart()

  await fs.writeFile("process.env.d.ts", envDeclartion)
}
