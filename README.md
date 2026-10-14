# Livepeer enterprise desk

A Next.js demo of per-actor usage attribution against a [livepeer-builder](https://github.com/mikezupper/livepeer-builder-core) engine. Users sign in with an engine `lpk_` actor key. The server holds the admin token and uses it for provisioning checks, reconciliation, and key management. Widgets are [Gyral](https://gyral.dev/docs/getting-started/) custom elements.

The engine stays single-tenant. Every actor allocation comes from one pre-created grant. An admin provisions that allocation from the Operator page.

## Run it

```sh
cp .env.example .env.local
npm install
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `LPB_ENGINE_URL` | Public engine origin |
| `LPB_ADMIN_TOKEN` | Engine admin key. Server only |
| `LPB_APPLICATION_ID` | Application id, default `default` |
| `SESSION_SECRET` | Encrypts the session cookie |
| `SIGNUP_INVITE_CODE` | Enables `/signup`. Leave empty to disable it |

Sign in with the admin key. Operator provisions an allocation for an actor id, then issues an `lpk_` key for that actor. The key is shown once. Sign in with it to see that actor's reconciliation.

## What the pages show

- **Dashboard.** Allowance, cost classes, offerings, runners, jobs, the inline runner result, usage reporting, and this actor's reconciliation.
- **Operator.** Provision, fund, pause, and revoke allocations, then issue or revoke keys. Also every actor's allowance, summary, and reconciliation, cost sync, and a job lookup. An admin can read any job by id. `GET /v1/jobs` only lists the caller's own jobs.
- **ISS-04.** Health against the pinned SDK and engine commits, the T9 balanced check, a one-attempt probe per offering, unattributed and failed-after-payment totals, a repeat-`operation_ref` check, the reserved 501 routes, and an evidence download.

A job can spend from the signed-in actor's allocation if an orchestrator accepts payment. The T10 probe asks before it runs and uses `max_attempts: 1`.

## Create a new app

From this checkout:

```sh
node packages/create-livepeer-enterprise/bin.js my-app
```

After this repository is published:

```sh
npm create livepeer-enterprise my-app
npx create-next-app@latest my-app --example https://github.com/OWNER/enterprise-ui --use-npm
```

`npm create` uses `create-next-app --example` when it is not running inside this checkout. Set `LIVEPEER_ENTERPRISE_EXAMPLE` to a GitHub URL or a local directory.

## Checks

```sh
npm run typecheck
npm run lint
npm test
```

`npm run gen:api` regenerates `src/lib/engine/schema.d.ts` from `openapi/engine.openapi.json`.
