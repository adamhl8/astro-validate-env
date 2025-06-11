import type { AstroIntegrationLogger } from "astro"

import type { Vars } from "./index.js"

interface InvalidVar {
  key: string
  value: string | undefined
  issues: string[]
  secret: boolean
}

const getCharacterString = (value: number) => (value === 1 ? "character" : "characters")

// eslint-disable-next-line sonarjs/cognitive-complexity, jsdoc/require-jsdoc
export function validateEnv(
  vars: Vars,
  astroContext: "dev" | "build" | "server",
  logger: typeof console | AstroIntegrationLogger,
) {
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
    logger.error("The following environment variables are invalid:\n")
    for (const invalidVar of invalidVars) {
      // we don't want to show anything for undefined or empty string
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
  }
}
