import process from "node:process"

import type { AstroIntegrationLogger } from "astro"

import type { Vars } from "#options.ts"

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
  // toTimeString() is always "HH:MM:SS ...", so split[0] is never undefined; the ?? only appeases noUncheckedIndexedAccess
  /* v8 ignore next */
  const [time] = timeString.split(" ")
  return time
}

const getValueIssues = (value: string, varConfig: Vars[string]): string[] => {
  const { exactly, startsWith, endsWith, includes, length, max, min, url } = varConfig

  if (Array.isArray(exactly)) {
    if (!exactly.includes(value)) return [`Expected to exactly match one of '${exactly.join("', '")}'`]
  } else if (exactly && value !== exactly) return [`Expected exactly '${exactly}'`]

  const issues: string[] = []
  if (startsWith && !value.startsWith(startsWith)) issues.push(`Expected to start with '${startsWith}'`)
  if (endsWith && !value.endsWith(endsWith)) issues.push(`Expected to end with '${endsWith}'`)
  if (includes && !value.includes(includes)) issues.push(`Expected to include '${includes}'`)
  if (length && value.length !== length) issues.push(`Expected to be exactly ${length.toString()} characters long`)
  if (value.length < min) issues.push(`Expected to be at least ${min.toString()} ${getCharacterString(min)} long`)
  if (max && value.length > max) issues.push(`Expected to be at most ${max.toString()} ${getCharacterString(max)} long`)
  if (url && !URL.canParse(value)) issues.push("Expected to be a valid URL")

  return issues
}

const getValueString = ({ value, secret }: InvalidVar): string => {
  if (value === undefined) return ""
  if (value === "") return '=""'
  if (secret) return "=<secret>"
  return `=${value}`
}

export const successMessage = "All configured environment variables are valid"
export const errorMessage = "The following environment variables are invalid:"

export const validateEnv = (
  vars: Vars,
  astroContext: "dev" | "build" | "server",
  logger: typeof console | AstroIntegrationLogger,
) => {
  // In the server context, we use 'console' instead of the astro-provided logger. So we need to prepend the timestamp and integration name to keep things consistent.
  const getLogPrefix = () => (isNativeConsole(logger) ? `${getTimeString()} [astro-validate-env] ` : "")

  const invalidVars: InvalidVar[] = []

  for (const [key, varConfig] of Object.entries(vars)) {
    if (!varConfig.context.includes(astroContext)) continue

    const value = process.env[key]

    if (value === undefined) {
      if (!varConfig.optional) invalidVars.push({ key, value, issues: ["Missing"], secret: varConfig.secret })
      continue
    }

    const issues = getValueIssues(value, varConfig)
    if (issues.length > 0) invalidVars.push({ key, value, issues, secret: varConfig.secret })
  }

  if (invalidVars.length > 0) {
    logger.error(`${getLogPrefix()}${errorMessage}\n`)
    for (const invalidVar of invalidVars)
      console.error(`${invalidVar.key}${getValueString(invalidVar)} -> ${invalidVar.issues.join(", ")}`)

    process.exit(1)
  } else logger.info(`${getLogPrefix()}${successMessage}`)
}
