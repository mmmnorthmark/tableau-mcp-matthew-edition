# Live integration tests

Opt-in tests that sign in to real Tableau instances using your local credentials. These tests are **not** run by default CI (`npm test` / `npm run coverage`).

## Prerequisites

- Node.js 20+ and `npm install` / `npm run build` completed
- At least **two** configured instances in your test config
- At least one instance with `"auth": "pat"` and one with `"auth": "direct-trust"`
- Connected apps used for `direct-trust` must allow scopes:
  - `tableau:content:read`
  - `tableau:viz_data_service:read`

## Configuration

Copy the example file and fill in real values (never commit secrets):

```bash
cp tableau-instances.integration.example.json tableau-instances.local.json
# edit tableau-instances.local.json with your PATs and connected app credentials
```

Alternatively, set `TABLEAU_INSTANCES` directly or point at your file:

```bash
export CONFIG_FILE_PATH="/absolute/path/to/tableau-instances.local.json"
# or
export TABLEAU_INSTANCES="$(cat tableau-instances.local.json)"
```

See [tableau-instances.integration.example.json](tableau-instances.integration.example.json) for the mixed PAT + connected-app shape the suite expects.

## Run

```bash
export TABLEAU_INTEGRATION=1
export CONFIG_FILE_PATH="/absolute/path/to/tableau-instances.local.json"
npm run test:integration
```

Without `TABLEAU_INTEGRATION=1`, the integration suite is skipped.

## What is tested

[`src/integration/multiInstanceAuth.integration.test.ts`](src/integration/multiInstanceAuth.integration.test.ts) loads config via `Config`, initializes `InstanceManager` for all enabled instances, and asserts:

- Each instance reports healthy status after sign-in
- Each connection has a valid REST `siteId` (session established)
- `shutdown()` signs out cleanly

## Gitignored files

Local secret files are ignored by git:

- `tableau-instances.local.json`
- `.env.integration`
