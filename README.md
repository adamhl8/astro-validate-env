# astro-validate-env

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/astro-validate-env.svg)](https://www.npmjs.com/package/astro-validate-env)

An alternative to Astro's built-in environment variable validation. This integration gives you more control over when/where to validate environment variables and works in all contexts.

- 🚀 Validates environment variables on server startup (e.g. when using a server adapter/SSR)
- 🎯 Allows you to enforce each environment variable only in the contexts you choose (dev vs. build vs. server)
- ✨ Automatically generates type definitions for your environment variables (no more checking for `undefined`!)

## Quickstart

Add the integration:

```sh
npx astro add astro-validate-env
# or bun, pnpm, yarn
```

Define your environment variables:

```ts
// astro.config.*
import validateEnv from "astro-validate-env"
import { defineConfig } from "astro/config"

export default defineConfig({
  integrations: [
    validateEnv({
      vars: {
        DATABASE_URL: {
          context: ["dev", "server"],
          url: true,
        },
        APP_SECRET: {
          context: ["server"],
          secret: true,
        },
        NODE_ENV: {
          context: ["dev", "server"],
          exactly: ["development", "production"],
        },
        MY_BUILD_VAR: {
          context: ["build"],
        },
      },
    }),
  ],
  // the rest of your astro config...
})
```

## Why?

Astro's [built-in environment variable validation](https://docs.astro.build/en/guides/environment-variables/#type-safe-environment-variables) has some significant limitations:

- The `astro:env` module is only available in the Astro context, which means you can't use it in scripts or anything that runs outside of the Astro context.
- You can't require environment variables only in a certain context (dev vs. build). Any environment variables required during development will also be required during the build.
- It doesn't validate environment variables on server startup at all.

I needed something that validates environment variables in all contexts and uses the standard `process.env` object.

## Prerequisites / Notes

This integration does not load `.env` files. Using a package like [dotenv](https://www.npmjs.com/package/dotenv) will not work in most cases because validation is done very early on in the startup process. In other words, environment variables should be loaded _before_ Astro starts.

[Bun](https://bun.sh) makes this really easy because it [automatically loads](https://bun.sh/docs/runtime/env#setting-environment-variables) `.env` files. So any `package.json` scripts will just work. This is what I'd recommend if your project is able to use Bun (which should be the case most of the time).

For Node, you can use something like [dotenvx](https://github.com/dotenvx/dotenvx). See their [Astro guide](https://dotenvx.com/docs/package-managers/npm#astro).

## Installation

> [!TIP]
> I recommend putting the `validateEnv` integration first in the list so environment variables are validated before anything else runs.

```sh
npx astro add astro-validate-env
# or bun, pnpm, yarn
```

Manual installation:

```sh
npm install astro-validate-env
```

Then add the integration to your `astro.config.*`:

```ts
import validateEnv from "astro-validate-env"
import { defineConfig } from "astro/config"

export default defineConfig({
  integrations: [validateEnv()],
})
```

## Usage

The following shows the full structure of the object to pass to the `validateEnv` integration:

```ts
// astro.config.*
import validateEnv from "astro-validate-env"
import { defineConfig } from "astro/config"

export default defineConfig({
  integrations: [
    validateEnv({
      entryFilePath: "entry.mjs", // (default: "entry.mjs") The path to your server entry file, relative to the `dist/server` directory. Only relevant when using a server adapter/SSR
      vars: {
        MY_VAR: {
          context: ["dev", "build", "server"], // (default: ["dev", "build", "server"]) The context(s) where the variable is needed
          optional: false, // (default: false) If `true`, there is no error if the environment variable is missing
          secret: false, // (default: false) If `true`, the environment variable value will never be printed in log output
          // `exactly` can also be an array of values: ["value1", "value2"]
          exactly: "value", // The environment variable must exactly match the given value (or if an array, one of the given values)
          startsWith: "prefix", // The environment variable must start with the given value
          endsWith: "suffix", // The environment variable must end with the given value
          includes: "substring", // The environment variable must include the given value
          length: 10, // The environment variable must have the given length
          min: 5, // The environment variable must be at least the given length
          max: 20, // The environment variable must be at most the given length
          url: false, // The environment variable must be a valid URL
        },
        // more environments variables...
      },
    }),
  ],
  // the rest of your astro config...
})
```

- All properties are optional. (`MY_VAR: {}` is also valid. This will use the defaults.)
- There are two defaults:
  - `context`: `["dev", "build", "server"]`
  - `min`: `1` (Empty strings are considered invalid)

In your code, access your environment variables via `process.env`.

A `process.env.d.ts` file is automatically generated for you based on your configuration. This allows you to get intellisense/autocomplete for your environment variables when accessing the `process.env` object.

- Environment variables marked as `optional` are always typed as optional (`?`) properties. In other words, they may be `undefined`.

> [!WARNING]
> It is possible for non-optional environment variables to be `undefined`. For example, say you have environment variable `MY_BUILD_VAR` that you only need in the `build` context. And you set `optional: false` so it will be typed as `string` (no `undefined`).
>
> Let's say `MY_BUILD_VAR` is _only_ provided during build (e.g. `MY_BUILD_VAR=1 astro build`). If you try to access `MY_BUILD_VAR` during `astro dev`, it will be `undefined` despite being typed as `string`.
>
> In other words, **make sure you include the appropriate context(s) for each environment variable**. In this example, if you added the `dev` context, the missing variable would be caught.

Now whenever you run `astro dev` or `astro build`, the integration will validate your environment variables based on the provided configuration. If any environment variables are missing or invalid, you will receive a helpful error message.

### Server Adapters / SSR

To allow for validation when using a server adapter/SSR, this integration automatically injects some code into the top of your server entry file. This entry file is usually `dist/server/entry.mjs`.

- If your entry file has a different name/path, use the `entryFilePath` option.

> [!IMPORTANT]
> If this integration does not work with your server adapter, please open an issue.

The injected code looks exactly like this:

```js
// import as `avefs` to avoid conflicts
import avefs from "node:fs"

import { validateEnv as aveValidateEnv } from "./astro-validate-env.mjs" // a copy of `src/validator.ts`

const vars = avefs.readFileSync(`${import.meta.dirname}/astro-validate-env.json`) // a serialized version of your `validateEnv` configuration
aveValidateEnv(JSON.parse(vars), "server", console)
```
