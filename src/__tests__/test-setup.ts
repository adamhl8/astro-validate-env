import { afterEach, mock } from "bun:test"

import "@adamhl8/configs/test/preload"

const originalEnv = { ...process.env }

afterEach(() => {
  mock.restore()
  process.env = { ...originalEnv }
})
