import fs from "node:fs/promises"
import path from "node:path"

import type { AstroIntegration } from "astro"

import { generateEnvDeclaration } from "#/env-d-gen.ts"
import type { Options } from "#/options.ts"
import { optionsSchema } from "#/options.ts"
import { validateEnv } from "#/validator.ts"

export { type Options } from "#/options.ts"

export const entryFileCode = `
import avefs from "node:fs"
import { validateEnv as aveValidateEnv } from "./astro-validate-env.mjs"
const aveVars = avefs.readFileSync(\`\${import.meta.dirname}/astro-validate-env.json\`)
aveValidateEnv(JSON.parse(aveVars), "server", console)
`.trim()

// oxlint-disable-next-line import/no-default-export
export default function integration(options?: Options): AstroIntegration {
  let serverEntry: string
  let serverDir: URL
  let isSsrBuild = false
  const opts = optionsSchema.parse(options)

  return {
    name: "astro-validate-env",
    hooks: {
      "astro:config:setup": async ({ command, logger, isRestart, config }) => {
        // oxlint-disable-next-line prefer-destructuring
        serverEntry = config.build.serverEntry
        serverDir = config.build.server

        if (isRestart) return

        if (command === "sync") await generateEnvDeclaration(opts.vars, opts.envDeclarationFilePath, logger)
        else if (command === "dev" || command === "build") {
          await generateEnvDeclaration(opts.vars, opts.envDeclarationFilePath, logger)
          validateEnv(opts.vars, command, logger)
        }
      },
      // build:ssr only fires for server builds, and before build:done, so it flags that injection is needed
      "astro:build:ssr": () => {
        isSsrBuild = true
      },
      // Inject in build:done: it's the last hook, after Astro has finished writing/rewriting the server entry.
      // (Injecting earlier in build:ssr gets clobbered when Astro rewrites the manifest chunk in place.)
      "astro:build:done": async ({ logger }) => {
        if (!isSsrBuild) return

        logger.info("Adding env validation to server build...")

        const entryFilePath = `${serverDir.pathname}${serverEntry}`
        const entryFileDirPath = path.dirname(entryFilePath)
        const entryFileContent = await fs.readFile(entryFilePath, { encoding: "utf8" })

        await fs.cp(`${import.meta.dirname}/validator.js`, `${entryFileDirPath}/astro-validate-env.mjs`)
        await fs.writeFile(`${entryFileDirPath}/astro-validate-env.json`, JSON.stringify(opts.vars))

        await fs.writeFile(entryFilePath, `${entryFileCode}\n${entryFileContent}`)

        logger.info("Done")
      },
    },
  }
}
