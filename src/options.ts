import { z } from "astro/zod"

export interface Options {
  /**
   * The path the `import.meta.env` declaration file will be written to, relative to the project root
   *
   * @default "import.meta.env.d.ts"
   */
  envDeclarationFilePath?: string | undefined
  /**
   * A mapping of environment variable keys to their config
   *
   * ```ts
   * vars: {
   *   MY_VAR: {
   *     context: ["dev", "build", "server"],
   *     // ...
   *   }
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

const exactlySchema = z.string().or(z.array(z.string())).optional()

const varsSchema = z
  .record(
    z.string(),
    z.object({
      context: z.enum(["dev", "build", "server"]).array().default(["dev", "build", "server"]),
      optional: z.boolean().default(false),
      secret: z.boolean().default(false),
      exactly: exactlySchema,
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

export const optionsSchema = z
  .object({
    envDeclarationFilePath: z.string().default("import.meta.env.d.ts"),
    vars: varsSchema,
  })
  .prefault({}) satisfies z.ZodType<Options>
