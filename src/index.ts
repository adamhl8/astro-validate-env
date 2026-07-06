import fs from "node:fs/promises"
import path from "node:path"

import type { AstroIntegration } from "astro"

import { generateEnvDeclaration } from "#/env-d-gen.ts"
import type { Options } from "#/options.ts"
import { optionsSchema } from "#/options.ts"
import { validateEnv } from "#/validator.ts"

// oxlint-disable-next-line import/no-default-export
export default function integration(options?: Options): AstroIntegration {
  let serverEntry: string
  const opts = optionsSchema.parse(options)

  return {
    name: "astro-validate-env",
    hooks: {
      "astro:config:setup": async ({ command, logger, isRestart, config }) => {
        // oxlint-disable-next-line prefer-destructuring
        serverEntry = config.build.serverEntry

        if (isRestart) return

        if (command === "sync") await generateEnvDeclaration(opts.vars, opts.envDeclarationFilePath, logger)
        else if (command === "dev" || command === "build") {
          await generateEnvDeclaration(opts.vars, opts.envDeclarationFilePath, logger)
          validateEnv(opts.vars, command, logger)
        }
      },
      "astro:build:ssr": async ({ manifest, logger }) => {
        logger.info("Adding env validation to server build...")

        const serverDirPath = new URL(manifest.buildServerDir).pathname
        const entryFilePath = `${serverDirPath}${serverEntry}`
        const entryFileDirPath = path.dirname(entryFilePath)
        const entryFileContent = await fs.readFile(entryFilePath, { encoding: "utf8" })

        await fs.cp(`${import.meta.dirname}/validator.js`, `${entryFileDirPath}/astro-validate-env.mjs`)
        await fs.writeFile(`${entryFileDirPath}/astro-validate-env.json`, JSON.stringify(opts.vars))

        const entryFileCode = `
import avefs from "node:fs"
import { validateEnv as aveValidateEnv } from "./astro-validate-env.mjs"
const aveVars = avefs.readFileSync(\`\${import.meta.dirname}/astro-validate-env.json\`)
aveValidateEnv(JSON.parse(aveVars), "server", console)
`.trim()

        await fs.writeFile(entryFilePath, `${entryFileCode}\n${entryFileContent}`)

        logger.info("Done")
      },
    },
  }
}
