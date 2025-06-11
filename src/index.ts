import fs from "node:fs/promises"
import path from "node:path"
import type { AstroIntegration } from "astro"
import z from "astro/zod"

import { generateProcessEnvDeclaration } from "./process-env-gen.js"
import { validateEnv } from "./validator.js"

const varsSchema = z
  /** A mapping of environment variable keys to their config */
  .record(
    z.string(),
    z.object({
      /** The context(s) where the variable is needed @default ["dev", "build", "server"] */
      context: z.enum(["dev", "build", "server"]).array().default(["dev", "build", "server"]),
      /** If `true`, no error will be thrown if the environment variable is missing @default false */
      optional: z.boolean().default(false),
      /** If `true`, the environment variable will not be printed if it's invalid @default false */
      secret: z.boolean().default(false),
      /** The environment variable must exactly match the given value (or if an array, one of the given values) */
      exactly: z.string().optional().or(z.array(z.string()).optional()),
      /** The environment variable must start with the given value */
      startsWith: z.string().optional(),
      /** The environment variable must end with the given value */
      endsWith: z.string().optional(),
      /** The environment variable must include the given value */
      includes: z.string().optional(),
      /** The environment variable must have the given length */
      length: z.number().optional(),
      /** The environment variable must be at least the given length */
      min: z.number().default(1),
      /** The environment variable must be at most the given length */
      max: z.number().optional(),
      /** The environment variable must be a valid URL */
      url: z.boolean().optional(),
    }),
  )
  .default({})

export type Vars = z.infer<typeof varsSchema>

const optionsSchema = z
  .object({
    /** The path to your server entry hook file, relative to the `src` directory @default "server-entry-hook.ts" */
    hookFilePath: z.string().default("server-entry-hook.ts"),
    /** The path to your server entry file, relative to the `dist/server` directory @default "entry.mjs" */
    entryFilePath: z.string().default("entry.mjs"),
    vars: varsSchema,
  })
  .default({})

type Options = z.input<typeof optionsSchema>

// eslint-disable-next-line jsdoc/require-jsdoc
export default function integration(options: Options): AstroIntegration {
  const opts = optionsSchema.parse(options)

  return {
    name: "astro-validate-env",
    hooks: {
      "astro:config:setup": async ({ command, logger }) => {
        if (command === "sync") await generateProcessEnvDeclaration(opts.vars)
        else if (command === "dev" || command === "build") {
          await generateProcessEnvDeclaration(opts.vars)
          validateEnv(opts.vars, command, logger)
        }
      },
      "astro:build:ssr": async ({ manifest, logger }) => {
        logger.info("Adding env validation to server build...")

        const serverDirPath = new URL(manifest.buildServerDir).pathname
        const entryFilePath = `${serverDirPath}${opts.entryFilePath}`
        const entryFileDirPath = path.dirname(entryFilePath)
        const entryFileContent = await fs.readFile(entryFilePath, { encoding: "utf8" })

        await fs.cp(`${import.meta.dirname}/validator.js`, `${entryFileDirPath}/astro-validate-env.mjs`)
        await fs.writeFile(`${entryFileDirPath}/astro-validate-env.json`, JSON.stringify(opts.vars))

        const entryFileCode = `
import avefs from "node:fs"
import { validateEnv as aveValidateEnv } from "./astro-validate-env.mjs"
const vars = avefs.readFileSync(\`\${import.meta.dirname}/astro-validate-env.json\`)
aveValidateEnv(JSON.parse(vars), "server", console)
`.trim()

        await fs.writeFile(entryFilePath, `${entryFileCode}\n${entryFileContent}`)

        logger.info("Done")
      },
    },
  }
}
