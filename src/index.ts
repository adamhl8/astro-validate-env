import fs from "node:fs/promises"
import path from "node:path"
import type { AstroIntegration } from "astro"
import z from "astro/zod"

import { generateEnvDeclaration } from "./env-d-gen.js"
import { validateEnv } from "./validator.js"

type Options =
  | {
      /**
       * The path the `import.meta.env` declaration file will be written to, relative to the project root
       *
       * @default "import.meta.env.d.ts"
       */
      envDeclarationFilePath?: string | undefined
      /**
       * A mapping of environment variable keys to their config
       *
       * @example
       * ```ts
       * vars: {
       *   MY_VAR: {
       *     context: ["dev", "build", "server"],
       *     // ...
       *   },
       * }
       * ```
       */
      vars?:
        | Record<
            string,
            {
              /** The context(s) where the variable is needed @default ["dev", "build", "server"] */
              context?: ("dev" | "build" | "server")[] | undefined
              /** If `true`, no error will be thrown if the environment variable is missing @default false */
              optional?: boolean | undefined
              /** If `true`, the environment variable value will never be printed in log output @default false */
              secret?: boolean | undefined
              /** The environment variable must exactly match the given value (or if an array, one of the given values) */
              exactly?: string | string[] | undefined
              /** The environment variable must start with the given value */
              startsWith?: string | undefined
              /** The environment variable must end with the given value */
              endsWith?: string | undefined
              /** The environment variable must include the given value */
              includes?: string | undefined
              /** The environment variable must have the given length */
              length?: number | undefined
              /** The environment variable must be at least the given length */
              min?: number | undefined
              /** The environment variable must be at most the given length */
              max?: number | undefined
              /** The environment variable must be a valid URL */
              url?: boolean | undefined
            }
          >
        | undefined
    }
  | undefined

const varsSchema = z
  .record(
    z.string(),
    z.object({
      context: z.enum(["dev", "build", "server"]).array().default(["dev", "build", "server"]),
      optional: z.boolean().default(false),
      secret: z.boolean().default(false),
      exactly: z.string().optional().or(z.array(z.string()).optional()),
      startsWith: z.string().optional(),
      endsWith: z.string().optional(),
      includes: z.string().optional(),
      length: z.number().optional(),
      min: z.number().default(1),
      max: z.number().optional(),
      url: z.boolean().optional(),
    }),
  )
  .default({})

export type Vars = z.infer<typeof varsSchema>

const optionsSchema = z
  .object({
    envDeclarationFilePath: z.string().default("import.meta.env.d.ts"),
    vars: varsSchema,
  })
  .default({}) satisfies z.ZodType<Options>

// biome-ignore lint/style/noDefaultExport: needs to be default
export default function integration(options?: Options): AstroIntegration {
  let serverEntry: string
  const opts = optionsSchema.parse(options)

  return {
    name: "astro-validate-env",
    hooks: {
      "astro:config:setup": async ({ command, logger, isRestart, config }) => {
        serverEntry = config.build.serverEntry

        if (isRestart) return

        if (command === "sync") {
          await generateEnvDeclaration(opts.vars, opts.envDeclarationFilePath, logger)
        } else if (command === "dev" || command === "build") {
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
