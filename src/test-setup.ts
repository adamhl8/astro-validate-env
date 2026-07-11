import { afterEach, mock } from "bun:test"

const originalEnv = { ...process.env }

afterEach(() => {
  mock.restore()
  process.env = originalEnv
})
