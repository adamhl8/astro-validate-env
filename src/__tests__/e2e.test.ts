import { beforeAll, describe, expect, it } from "bun:test"
import path from "node:path"

import { execa } from "execa"
import type { Options } from "execa"
import { getPort } from "get-port-please"

import { validateEnvOptions } from "#__tests__/fixture/validate-env-options.ts"
import { entryFileCode } from "#index.ts"
import { errorMessage, successMessage } from "#validator.ts"

const PROJECT_ROOT = path.resolve(import.meta.dir, "../..")
const FIXTURE_DIR = path.resolve(import.meta.dir, "fixture")
const DIST_SERVER_DIR = path.resolve(FIXTURE_DIR, "dist", "server")
const SERVER_ENTRY_PATH = path.resolve(DIST_SERVER_DIR, "entry.mjs")
const VALIDATOR_PATH = path.resolve(DIST_SERVER_DIR, "astro-validate-env.mjs")
const ENV_JSON_PATH = path.resolve(DIST_SERVER_DIR, "astro-validate-env.json")
const ENV_DECLARATION_PATH = path.resolve(FIXTURE_DIR, "import.meta.env.d.ts")

const baseExeca = execa({ all: true, extendEnv: false, preferLocal: true } satisfies Options)
const projectExeca = baseExeca({ cwd: PROJECT_ROOT, env: process.env } satisfies Options)

const { PATH } = process.env
const HOST = "127.0.0.1"
const cleanFixtureEnv = {
  PATH,
  ASTRO_TELEMETRY_DISABLED: "1",
  NO_COLOR: "1",
  ASTRO_DEV_BACKGROUND: "1",
  HOST,
}
const createFixtureExeca = async (options?: Options, extraEnv?: NodeJS.ProcessEnv) => {
  const PORT = await getPort({ host: HOST, portRange: [8123, 8223] })

  return {
    fixtureExeca: baseExeca({
      cwd: FIXTURE_DIR,
      env: { ...cleanFixtureEnv, ...extraEnv, PORT: PORT.toString() },
      reject: false,
      ...options,
    } satisfies Options),
    PORT,
  }
}

const waitForServer = async (url: string) => {
  let response: Response | undefined
  while (!response) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      response = await fetch(url)
    } catch {
      // oxlint-disable-next-line no-await-in-loop
      await Bun.sleep(100)
    }
  }
  return response
}

describe("e2e", () => {
  beforeAll(async () => {
    console.write("Setting up fixture...")
    await projectExeca`bun tsdown`
    await projectExeca`npm link`

    const { fixtureExeca } = await createFixtureExeca({ reject: true })
    await fixtureExeca`rm -rf node_modules package-lock.json`
    await fixtureExeca`npm install astro @astrojs/node` // install directly so they stay on the latest version
    await fixtureExeca`npm link astro-validate-env`
    console.write("done\n")
  }, 120_000)

  describe("astro build", () => {
    it("succeeds and validates env", async () => {
      const validBuildEnv = { TEST_REQUIRED: "x", TEST_URL: "https://example.com" }
      const { fixtureExeca } = await createFixtureExeca({}, validBuildEnv)

      const { all, exitCode } = await fixtureExeca`astro build`

      expect(all).toContain(successMessage)
      expect(exitCode).toBe(0)
    }, 30_000)

    it("injects the validation snippet and sidecar files into the server build", async () => {
      const serverEntry = await Bun.file(SERVER_ENTRY_PATH).text()
      expect(serverEntry.startsWith(entryFileCode)).toBe(true)

      expect(await Bun.file(VALIDATOR_PATH).exists()).toBe(true)

      const envJson = await Bun.file(ENV_JSON_PATH).text()
      const vars: unknown = JSON.parse(envJson)
      expect(vars).toMatchObject(validateEnvOptions.vars)
    })

    it("generates the env declaration file with required and optional shape", async () => {
      const envDeclaration = await Bun.file(ENV_DECLARATION_PATH).text()

      expect(envDeclaration).toContain("readonly TEST_REQUIRED: string")
      expect(envDeclaration).toContain("readonly TEST_OPTIONAL?: string")
    })

    it("fails when a required var is missing or invalid", async () => {
      const { fixtureExeca } = await createFixtureExeca({}, { TEST_URL: "not-a-url" })

      const { all, exitCode } = await fixtureExeca`astro build`

      expect(exitCode).not.toBe(0)
      expect(all).toContain("TEST_REQUIRED")
      expect(all).toContain("Missing")
      expect(all).toContain("Expected to be a valid URL")
    }, 30_000)
  })

  describe("astro dev", () => {
    it("exits with an error when a required var is missing", async () => {
      const { fixtureExeca } = await createFixtureExeca()

      const { all, exitCode } = await fixtureExeca`astro dev`

      expect(exitCode).not.toBe(0)
      expect(all).toContain(errorMessage)
    }, 30_000)
  })

  describe("built server", () => {
    it("validates server env and serves the page with valid env", async () => {
      const { fixtureExeca, PORT } = await createFixtureExeca(
        { node: true },
        { TEST_REQUIRED: "x", TEST_SECRET: "sk-abc" },
      )

      const astroDev = fixtureExeca`${SERVER_ENTRY_PATH}`

      const response = await waitForServer(`http://${HOST}:${PORT}/`)
      expect(response.status).toBe(200)
      astroDev.kill()

      const { all, isTerminated } = await astroDev
      expect(isTerminated).toBe(true)
      expect(all).toContain(`[astro-validate-env] ${successMessage}`)
    }, 30_000)

    it("exits and masks a secret when a server var is invalid", async () => {
      const { fixtureExeca } = await createFixtureExeca({ node: true }, { TEST_REQUIRED: "x", TEST_SECRET: "bad" })

      const { all, exitCode } = await fixtureExeca`${SERVER_ENTRY_PATH}`

      expect(exitCode).not.toBe(0)
      expect(all).toContain("TEST_SECRET=<secret> ->")
      expect(all).toContain("Expected to start with 'sk-'")
    }, 30_000)
  })
})
