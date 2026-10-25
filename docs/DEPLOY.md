# Deploying UbuzimaConnect

The agreed plan (DECISIONS.md D67):

| Piece | Where | Address |
|---|---|---|
| Web app (`apps/web`) | Vercel, from this GitHub repo, root directory `apps/web` | https://ubuzima.wilsonn.tech |
| API (`apps/api`) | Azure App Service, Linux, B1 plan, Central India (Azure for Students) | https://api.ubuzima.wilsonn.tech |
| Mock NIDA (`apps/nida-mock`) | Same App Service plan, open only to the API's addresses | https://nida.ubuzima.wilsonn.tech (only the API calls it) |
| Database | Supabase, region Mumbai (ap-south-1) | |
| Email | Resend, sending as `noreply@ubuzima.wilsonn.tech` | |
| DNS | get.tech, where `wilsonn.tech` is registered | |

Both Azure apps share one B1 plan (about $13 a month from the $100 student credit). The API must never sleep: its dispatcher, timers and live streams run inside it.

## 1. Database (Supabase)

1. Create a project in region **South Asia (Mumbai)**. Keep the database password.
2. Under **Connect → Session pooler**, copy the connection string (port 5432). Azure App Service has no IPv6, so the direct address won't work; the session pooler does.
3. From this Mac, create the tables and the demo data. The commands below read `DATABASE_URL` and `DIRECT_URL` from the shell only, so the password is never saved in a file:

```bash
export DATABASE_URL='<session pooler string>' DIRECT_URL='<session pooler string>'
```

```bash
pnpm --filter @ubuzima/db run deploy && pnpm --filter @ubuzima/api exec tsx src/seed.ts
```

## 2. API and mock NIDA (Azure)

Install the Azure command line and sign in with the student account (wilsonshizirungu@gmail.com):

```bash
brew install azure-cli
```

```bash
az login
```

Create the plan and the two apps (Node 22, Linux, Central India). A new student subscription must first allow App Service:

```bash
az provider register -n Microsoft.Web --wait
az group create -n ubuzima-rg -l centralindia
az appservice plan create -g ubuzima-rg -n ubuzima-plan --sku B1 --is-linux -l centralindia
az webapp create -g ubuzima-rg -p ubuzima-plan -n ubuzima-api --runtime "NODE:22-lts"
az webapp create -g ubuzima-rg -p ubuzima-plan -n ubuzima-nida --runtime "NODE:22-lts"
az webapp config set -g ubuzima-rg -n ubuzima-api --always-on true --startup-file "node app/dist/main.js" --min-tls-version 1.2 --ftps-state Disabled
az webapp config set -g ubuzima-rg -n ubuzima-nida --always-on true --startup-file "node app/dist/main.js" --min-tls-version 1.2 --ftps-state Disabled
az webapp update -g ubuzima-rg -n ubuzima-api --https-only true
az webapp update -g ubuzima-rg -n ubuzima-nida --https-only true
```

### Settings

**API (`ubuzima-api`)**, under Configuration → Application settings:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (the zip is already built) |
| `DATABASE_URL` | the Supabase session pooler string |
| `APP_SECRET` | a new random string: `openssl rand -hex 32` |
| `WEB_URL` | `https://ubuzima.wilsonn.tech` |
| `COOKIE_DOMAIN` | `.ubuzima.wilsonn.tech` (the browser opens live streams straight to the API, D34) |
| `NIDA_URL` | `https://nida.ubuzima.wilsonn.tech` |
| `NIDA_API_KEY` | a new random string, the same on both apps |
| `GEMINI_API_KEY` | from `apps/api/.env` |
| `GEMINI_MODEL`, `GEMINI_THINKING` | as in `apps/api/.env` |
| `RESEND_API_KEY` | from Resend (step 4) |
| `MAIL_FROM` | `UbuzimaConnect <noreply@ubuzima.wilsonn.tech>` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | from `apps/api/.env` |
| `DEMO_INBOX` | `1` (D66: graders read demo accounts' codes at /demo/inbox) |
| `TRUST_PROXY_HOPS` | `2` (Vercel, then Azure's front end) |

**Mock NIDA (`ubuzima-nida`):**

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` |
| `NIDA_API_KEY` | the same value as on the API |
| `NIDA_ALLOWED_IPS` | every address the API may call from: `az webapp show -g ubuzima-rg -n ubuzima-api --query possibleOutboundIpAddresses -o tsv` |
| `TRUST_PROXY` | `1` |
| `NIDA_DATABASE_URL` | the same database, but logged in as its own user `nida_svc`, which can only work in the `nida` schema (D73). Create it once as the database owner: `create role nida_svc login password '…'; grant nida_svc to postgres; create schema nida authorization nida_svc;`. On Supabase's pooler the user name is `nida_svc.<project-ref>`. Without this setting the mock NIDA still verifies the built-in people but can't add new ones. |

The mock NIDA refuses every other address (and every caller without the key). Azure's front end writes the caller as "address:port"; both apps drop the port before checking (D67).

`DATABASE_URL` holds the database password, so set it from your own terminal, where it was exported in step 1:

```bash
az webapp config appsettings set -g ubuzima-rg -n ubuzima-api --settings DATABASE_URL="$DATABASE_URL" -o none
```

### Upload

```bash
./scripts/azure-package.sh
```

```bash
az webapp deploy -g ubuzima-rg -n ubuzima-api --src-path .deploy/api.zip --type zip --clean true --track-status false
```

```bash
az webapp deploy -g ubuzima-rg -n ubuzima-nida --src-path .deploy/nida.zip --type zip --clean true --track-status false
```

Each zip holds the app in `app/`. Azure's Node startup moves a top-level `node_modules` to `/node_modules`, where ES modules can't find it, so the app must not sit at the top of the zip (D67).

Check: `https://ubuzima-api.azurewebsites.net/health` answers `{"ok":true}`.

## 3. Web (Vercel)

1. New project → import `nshizirunguwilson/ubuzimaconnect` from GitHub.
2. **Root Directory:** `apps/web`. The framework (Next.js) and pnpm are detected.
3. Environment variables:
   - `API_URL` = `https://api.ubuzima.wilsonn.tech`
   - `NEXT_PUBLIC_API_URL` = `https://api.ubuzima.wilsonn.tech`
4. Deploy. Every push to `main` deploys again.

## 4. Email (Resend)

Add the domain `ubuzima.wilsonn.tech` in Resend, add the DNS records it shows (step 5), wait for **Verified**, then create an API key for the API's `RESEND_API_KEY`.

## 5. DNS (get.tech, zone `wilsonn.tech`)

| Name | Type | Value |
|---|---|---|
| `ubuzima` | CNAME | the value Vercel shows under Domains |
| `api.ubuzima` | CNAME | `ubuzima-api.azurewebsites.net` |
| `nida.ubuzima` | CNAME | `ubuzima-nida.azurewebsites.net` |
| `asuid.nida.ubuzima` | TXT | the same verification ID as `asuid.api.ubuzima` |
| `asuid.api.ubuzima` | TXT | the API's verification ID: `az webapp show -g ubuzima-rg -n ubuzima-api --query customDomainVerificationId -o tsv` |
| Resend's records | as shown | |

Then add the custom domains in Vercel and in the API app, and turn on Azure's free managed certificate for each, so everything is HTTPS (NFR 1).

## 6. After it's live

- Log in as a patient (README), and as `agent@ubuzima.test` with the codes from https://ubuzima.wilsonn.tech/demo/inbox.
- Run the page-weight check against the live site, and try a request on a real phone over mobile data (NFR 4, 8).
