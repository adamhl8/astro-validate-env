import type { AstroIntegrationLogger } from "astro"

import type { Vars } from "./index.js"

interface InvalidVar {
  key: string
  value: string | undefined
  issues: string[]
  secret: boolean
}

const getCharacterString = (value: number) => (value === 1 ? "character" : "characters")

const isNativeConsole = (logger: typeof console | AstroIntegrationLogger): logger is typeof console =>
  logger === console

const getTimeString = () => {
  const timeString = new Date().toTimeString()
  return timeString.split(" ")[0] ?? timeString
}

// eslint-disable-next-line sonarjs/cognitive-complexity, jsdoc/require-jsdoc
export function validateEnv(
  vars: Vars,
  astroContext: "dev" | "build" | "server",
  logger: typeof console | AstroIntegrationLogger,
) {
  // In the server context, we use 'console' instead of the astro-provided logger. So we need to prepend the timestamp and integration name to keep things consistent.
  const getLogPrefix = () => (isNativeConsole(logger) ? `${getTimeString()} [astro-validate-env] ` : "")

  const invalidVars: InvalidVar[] = []

  for (const [key, varConfig] of Object.entries(vars)) {
    const { context, optional, secret, exactly, startsWith, endsWith, includes, length, max, min, url } = varConfig

    if (!context.includes(astroContext)) continue

    const value = process.env[key]

    const invalidVar: InvalidVar = {
      key,
      value,
      issues: [],
      secret,
    }

    if (value === undefined && optional) continue
    if (value === undefined) {
      invalidVar.issues.push("Missing")
      invalidVars.push(invalidVar)
      continue
    }

    if (exactly) {
      if (Array.isArray(exactly)) {
        if (!exactly.includes(value)) {
          invalidVar.issues.push(`Expected to exactly match one of '${exactly.join("', '")}'`)
          invalidVars.push(invalidVar)
          continue
        }
      } else if (value !== exactly) {
        invalidVar.issues.push(`Expected exactly '${exactly}'`)
        invalidVars.push(invalidVar)
        continue
      }
    }

    if (startsWith && !value.startsWith(startsWith)) invalidVar.issues.push(`Expected to start with '${startsWith}'`)
    if (endsWith && !value.endsWith(endsWith)) invalidVar.issues.push(`Expected to end with '${endsWith}'`)
    if (includes && !value.includes(includes)) invalidVar.issues.push(`Expected to include '${includes}'`)
    if (length && value.length !== length)
      invalidVar.issues.push(`Expected to be exactly ${length.toString()} characters long`)
    if (value.length < min)
      invalidVar.issues.push(`Expected to be at least ${min.toString()} ${getCharacterString(min)} long`)
    if (max && value.length > max)
      invalidVar.issues.push(`Expected to be at most ${max.toString()} ${getCharacterString(max)} long`)
    if (url) {
      try {
        // eslint-disable-next-line no-new
        new URL(value)
      } catch {
        invalidVar.issues.push(`Expected to be a valid URL`)
      }
    }

    if (invalidVar.issues.length > 0) invalidVars.push(invalidVar)
  }

  if (invalidVars.length > 0) {
    logger.error(`${getLogPrefix()}The following environment variables are invalid:\n`)
    for (const invalidVar of invalidVars) {
      let valueString: string
      if (invalidVar.value === undefined) valueString = ""
      else if (invalidVar.value === "") valueString = '=""'
      else if (invalidVar.secret) valueString = "=<secret>"
      else if (invalidVar.value) valueString = `=${invalidVar.value}`
      else valueString = ""
      console.error(`${invalidVar.key}${valueString} -> ${invalidVar.issues.join(", ")}`)
    }
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  } else logger.info(`${getLogPrefix()}All configured environment variables are valid`)
}
