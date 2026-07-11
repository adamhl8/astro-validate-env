import { afterAll, describe, expect, it, spyOn } from "bun:test"
import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import type { AstroIntegration, AstroIntegrationLogger } from "astro"

import { generateEnvDeclaration } from "#env-d-gen.ts"
import integration, { entryFileCode } from "#index.ts"
import type { Options } from "#options.ts"
import { optionsSchema } from "#options.ts"
import { errorMessage, successMessage, validateEnv } from "#validator.ts"

type Hooks = AstroIntegration["hooks"]
type HookParams<T> = NonNullable<T> extends (...args: infer P) => unknown ? P[0] : never

type Vars = NonNullable<Options["vars"]>
const parseVars = (vars: Vars) => optionsSchema.parse({ vars }).vars

const tempDirs: string[] = []
const makeTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "ave-unit-"))
  tempDirs.push(dir)
  return dir
}

// A real capturing logger (not a mock) that records what was logged, cast to the astro logger shape.
const createLogger = () => {
  const infoLogs: string[] = []
  const errorLogs: string[] = []
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const logger = {
    info: (message: string) => {
      infoLogs.push(message)
    },
    error: (message: string) => {
      errorLogs.push(message)
    },
  } as unknown as AstroIntegrationLogger

  return { logger, infoLogs, errorLogs }
}

const runConfigSetup = async (vars: Vars, command: "dev" | "build" | "preview" | "sync", isRestart = false) => {
  const dir = await makeTempDir()
  const envDeclarationFilePath = path.join(dir, "env.d.ts")
  const { logger, infoLogs } = createLogger()
  const { hooks } = integration({ envDeclarationFilePath, vars })
  const config = { build: { serverEntry: "entry.mjs", server: new URL(`file://${dir}/`) } }
  const hook = hooks["astro:config:setup"]
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  await hook?.({ command, isRestart, config, logger } as unknown as HookParams<typeof hook>)
  return { dir, envDeclarationFilePath, infoLogs, hooks }
}

const runBuildSsr = async (hooks: Hooks) => {
  const hook = hooks["astro:build:ssr"]
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  await hook?.({} as unknown as HookParams<typeof hook>)
}

const runBuildDone = async (hooks: Hooks) => {
  const hook = hooks["astro:build:done"]
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  await hook?.({ logger: createLogger().logger } as unknown as HookParams<typeof hook>)
}

const spyOnFailure = () => {
  spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`)
  })
  const errorSpy = spyOn(console, "error").mockImplementation(() => {
    /* empty */
  })
  return errorSpy
}

describe("validateEnv", () => {
  it("logs the success message via the astro logger when every var is valid", () => {
    process.env["AVE_OK"] = "https://example.com"
    const { logger, infoLogs } = createLogger()

    validateEnv(
      parseVars({ AVE_OK: { startsWith: "https", endsWith: ".com", includes: "example", url: true } }),
      "build",
      logger,
    )

    expect(infoLogs).toContain(successMessage)
  })

  it("prefixes a timestamp and the integration name in the server context (native console)", () => {
    process.env["AVE_OK"] = "x"
    const infoSpy = spyOn(console, "info").mockImplementation(() => {
      /* empty */
    })

    validateEnv(parseVars({ AVE_OK: {} }), "server", console)

    const logged = String(infoSpy.mock.calls[0]?.[0])
    expect(logged).toMatch(/^\d{2}:\d{2}:\d{2} \[astro-validate-env\] /v)
    expect(logged).toContain(successMessage)
  })

  it("skips vars that are optional-missing or out of context", () => {
    const { logger, infoLogs } = createLogger()

    validateEnv(
      parseVars({ AVE_OPTIONAL: { optional: true }, AVE_SERVER_ONLY: { context: ["server"] } }),
      "dev",
      logger,
    )

    expect(infoLogs).toContain(successMessage)
  })

  it("reports missing required vars and exits", () => {
    const errorSpy = spyOnFailure()
    const { logger, errorLogs } = createLogger()

    expect(() => {
      validateEnv(parseVars({ AVE_MISSING: {} }), "build", logger)
    }).toThrow("process.exit(1)")

    expect(errorLogs).toContain(`${errorMessage}\n`)
    const lines = errorSpy.mock.calls.map((call) => String(call[0]))
    expect(lines).toStrictEqual(["AVE_MISSING -> Missing"])
  })

  it("collects every value constraint issue", () => {
    process.env["AVE_MULTI"] = "abc"
    const errorSpy = spyOnFailure()

    expect(() => {
      validateEnv(
        parseVars({ AVE_MULTI: { startsWith: "X", endsWith: "Y", includes: "Z", length: 100, max: 2, url: true } }),
        "build",
        createLogger().logger,
      )
    }).toThrow("process.exit(1)")

    const line = String(errorSpy.mock.calls[0]?.[0])
    expect(line).toBe(
      "AVE_MULTI=abc -> Expected to start with 'X', Expected to end with 'Y', Expected to include 'Z', Expected to be exactly 100 characters long, Expected to be at most 2 characters long, Expected to be a valid URL",
    )
  })

  it("matches 'exactly' against a string or an array of allowed values", () => {
    process.env["AVE_STR"] = "wrong"
    process.env["AVE_ARR"] = "wrong"
    process.env["AVE_STR_OK"] = "right"
    process.env["AVE_ARR_OK"] = "b"
    const errorSpy = spyOnFailure()

    expect(() => {
      validateEnv(
        parseVars({
          AVE_STR: { exactly: "right" },
          AVE_ARR: { exactly: ["a", "b"] },
          AVE_STR_OK: { exactly: "right" },
          AVE_ARR_OK: { exactly: ["a", "b"] },
        }),
        "build",
        createLogger().logger,
      )
    }).toThrow("process.exit(1)")

    const lines = errorSpy.mock.calls.map((call) => String(call[0]))
    expect(lines).toStrictEqual([
      "AVE_STR=wrong -> Expected exactly 'right'",
      "AVE_ARR=wrong -> Expected to exactly match one of 'a', 'b'",
    ])
  })

  it("masks secret values, quotes empty values, and uses the singular character count", () => {
    process.env["AVE_SECRET"] = "nope"
    process.env["AVE_EMPTY"] = ""
    const errorSpy = spyOnFailure()

    expect(() => {
      validateEnv(
        parseVars({ AVE_SECRET: { secret: true, startsWith: "sk-" }, AVE_EMPTY: {} }),
        "build",
        createLogger().logger,
      )
    }).toThrow("process.exit(1)")

    const lines = errorSpy.mock.calls.map((call) => String(call[0]))
    expect(lines).toStrictEqual([
      "AVE_SECRET=<secret> -> Expected to start with 'sk-'",
      'AVE_EMPTY="" -> Expected to be at least 1 character long',
    ])
  })
})

describe("generateEnvDeclaration", () => {
  it("writes required and optional keys and logs the output path", async () => {
    const dir = await makeTempDir()
    const filePath = path.join(dir, "nested", "import.meta.env.d.ts")
    const { logger, infoLogs } = createLogger()

    await generateEnvDeclaration(parseVars({ AVE_REQUIRED: {}, AVE_OPTIONAL: { optional: true } }), filePath, logger)

    const declaration = await Bun.file(filePath).text()
    expect(declaration).toContain("  readonly AVE_REQUIRED: string")
    expect(declaration).toContain("  readonly AVE_OPTIONAL?: string")
    expect(infoLogs).toContain(`Generated '${filePath}'`)
  })
})

describe("integration", () => {
  afterAll(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true })
      }),
    )
  })

  it("returns a named integration exposing the lifecycle hooks", () => {
    const { name, hooks } = integration()
    expect(name).toBe("astro-validate-env")
    expect(hooks["astro:config:setup"]).toBeTypeOf("function")
    expect(hooks["astro:build:done"]).toBeTypeOf("function")
  })

  it("generates the declaration file on sync", async () => {
    const { envDeclarationFilePath } = await runConfigSetup({ AVE_ANY: {} }, "sync")
    const declaration = await Bun.file(envDeclarationFilePath).text()
    expect(declaration).toContain("readonly AVE_ANY: string")
  })

  it("generates and validates on dev/build", async () => {
    process.env["AVE_ANY"] = "value"

    const { infoLogs } = await runConfigSetup({ AVE_ANY: {} }, "build")

    expect(infoLogs).toContain(successMessage)
  })

  it("does nothing on restart or for unrelated commands", async () => {
    const restart = await runConfigSetup({ AVE_ANY: {} }, "build", true)
    const preview = await runConfigSetup({ AVE_ANY: {} }, "preview")

    expect(await Bun.file(restart.envDeclarationFilePath).exists()).toBe(false)
    expect(await Bun.file(preview.envDeclarationFilePath).exists()).toBe(false)
  })

  it("skips server injection when the build is not SSR", async () => {
    const cp = spyOn(fs, "cp").mockImplementation(async () => {
      /* empty */
    })
    const { hooks } = integration()

    await runBuildDone(hooks)

    expect(cp).not.toHaveBeenCalled()
  })

  it("injects the validator and prepends the entry code on an SSR build", async () => {
    // The injection copies a sibling validator.js that only exists next to the built dist, so this one spy is unavoidable.
    const cp = spyOn(fs, "cp").mockImplementation(async () => {
      /* empty */
    })
    // isRestart short-circuits config:setup once it captures the server dir, so build:done can find the entry file.
    const { dir, hooks } = await runConfigSetup({ AVE_ANY: {} }, "build", true)
    const entryFilePath = path.join(dir, "entry.mjs")
    await Bun.write(entryFilePath, "export const handler = () => {}\n")

    await runBuildSsr(hooks)
    await runBuildDone(hooks)

    const written = await Bun.file(entryFilePath).text()
    expect(written.startsWith(entryFileCode)).toBe(true)
    expect(written).toContain("export const handler")
    expect(cp).toHaveBeenCalledWith(expect.stringContaining("validator.js"), path.join(dir, "astro-validate-env.mjs"))
    const sidecar = await Bun.file(path.join(dir, "astro-validate-env.json")).text()
    expect(JSON.parse(sidecar)).toHaveProperty("AVE_ANY")
  })
})
