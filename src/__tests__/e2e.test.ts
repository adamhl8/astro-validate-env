import { beforeAll, describe, expect, it } from "bun:test"
import path from "node:path"

import { copyFixture, minimalEnv, packPackage } from "@adamhl8/configs/test"
import type { Shell, ShellResult } from "@adamhl8/configs/test"
import bun, { sleep, spawn } from "bun"
import { getPort } from "get-port-please"

import { validateEnvOptions } from "#__tests__/fixture/validate-env-options.ts"
import { entryFileCode } from "#index.ts"
import { errorMessage, successMessage } from "#validator.ts"

const PROJECT_ROOT = path.resolve(import.meta.dir, "../..")
const FIXTURE_DIR = path.resolve(import.meta.dir, "fixture")

const HOST = "127.0.0.1"
const fixtureEnv = minimalEnv({
  CI: process.env["CI"],
  ASTRO_TELEMETRY_DISABLED: "1",
  NO_COLOR: "1",
  ASTRO_DEV_BACKGROUND: "1",
  HOST,
})

let fixtureDir = ""
let run: Shell

const fixturePath = (...segments: string[]) => path.resolve(fixtureDir, ...segments)
const serverEntryPath = () => fixturePath("dist", "server", "entry.mjs")
const getFixturePort = async () => (await getPort({ host: HOST, portRange: [8123, 8223] })).toString()
const output = ({ stdout, stderr }: Pick<ShellResult, "stdout" | "stderr">) => `${stdout}\n${stderr}`

const waitForServer = async (url: string) => {
  let response: Response | undefined
  while (!response) {
    try {
      // oxlint-disable-next-line no-await-in-loop - poll until the server is up
      response = await fetch(url)
    } catch {
      // oxlint-disable-next-line no-await-in-loop - poll until the server is up
      await sleep(100)
    }
  }
  return response
}

describe("e2e", () => {
  beforeAll(async () => {
    const tarball = await packPackage(PROJECT_ROOT)
    ;({ dir: fixtureDir, run } = await copyFixture(FIXTURE_DIR, { shell: { env: fixtureEnv } }))
    // Add `astro` and `@astrojs/node` here so they stay on their latest versions.
    await run`bun add astro @astrojs/node ${tarball}`
  }, 120_000)

  describe("astro build", () => {
    it("succeeds and validates env", async () => {
      const result = await run`astro build`.env({ TEST_REQUIRED: "x", TEST_URL: "https://example.com" })

      expect(output(result)).toContain(successMessage)
    }, 30_000)

    it("injects the validation snippet and sidecar files into the server build", async () => {
      const serverEntry = await bun.file(serverEntryPath()).text()
      expect(serverEntry.startsWith(entryFileCode)).toBe(true)

      expect(await bun.file(fixturePath("dist", "server", "astro-validate-env.mjs")).exists()).toBe(true)

      const envJson = await bun.file(fixturePath("dist", "server", "astro-validate-env.json")).text()
      const vars: unknown = JSON.parse(envJson)
      expect(vars).toMatchObject(validateEnvOptions.vars)
    })

    it("generates the env declaration file with required and optional shape", async () => {
      const envDeclaration = await bun.file(fixturePath("import.meta.env.d.ts")).text()

      expect(envDeclaration).toContain("readonly TEST_REQUIRED: string")
      expect(envDeclaration).toContain("readonly TEST_OPTIONAL?: string")
    })

    it("fails when a required var is missing or invalid", async () => {
      const result = await run`astro build`.env({ TEST_URL: "not-a-url" }).nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(output(result)).toContain("TEST_REQUIRED")
      expect(output(result)).toContain("Missing")
      expect(output(result)).toContain("Expected to be a valid URL")
    }, 30_000)
  })

  describe("astro dev", () => {
    it("exits with an error when a required var is missing", async () => {
      const result = await run`astro dev`.env({ PORT: await getFixturePort() }).nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(output(result)).toContain(errorMessage)
    }, 30_000)
  })

  describe("built server", () => {
    it("validates server env and serves the page with valid env", async () => {
      const PORT = await getFixturePort()
      // Get `node` from the shell because it takes the bun `node` shims off `PATH`.
      const { stdout: nodePath } = await run`which node`
      const server = spawn([nodePath, serverEntryPath()], {
        cwd: fixtureDir,
        env: { ...fixtureEnv, TEST_REQUIRED: "x", TEST_SECRET: "sk-abc", PORT },
        stdout: "pipe",
        stderr: "pipe",
      })

      const response = await waitForServer(`http://${HOST}:${PORT}/`)
      expect(response.status).toBe(200)
      server.kill()

      const [stdout, stderr] = await Promise.all([server.stdout.text(), server.stderr.text()])
      await server.exited
      expect(server.signalCode).toBe("SIGTERM")
      expect(output({ stdout, stderr })).toContain(`[astro-validate-env] ${successMessage}`)
    }, 30_000)

    it("exits and masks a secret when a server var is invalid", async () => {
      const result = await run`node ${serverEntryPath()}`
        .env({ TEST_REQUIRED: "x", TEST_SECRET: "bad", PORT: await getFixturePort() })
        .nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(output(result)).toContain("TEST_SECRET=<secret> ->")
      expect(output(result)).toContain("Expected to start with 'sk-'")
    }, 30_000)
  })
})
