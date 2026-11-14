# Deploying UbuzimaConnect

The plan (DECISIONS.md D67, moved to Azure PostgreSQL in UAE North in D81):

| Piece | Where | Address |
|---|---|---|
| Web app (`apps/web`) | Vercel, from this GitHub repo, root directory `apps/web` | https://ubuzima.wilsonn.tech |
| API (`apps/api`) | Azure App Service `ubuzima-api-uae`, Linux, B1 plan `ubuzima-plan-uae`, UAE North (Azure for Students) | https://api.ubuzima.wilsonn.tech |
| Mock NIDA (`apps/nida-mock`) | `ubuzima-nida-uae` on the same App Service plan, open only to the API's addresses | https://ubuzima-nida-uae.azurewebsites.net (only the API calls it; no custom name, D81) |
| Database | Azure Database for PostgreSQL Flexible Server `ubuzima-db-uae`, PostgreSQL 17, Burstable B1ms, 32 GB, UAE North | `ubuzima-db-uae.postgres.database.azure.com` |
| Email | Resend, sending as `noreply@ubuzima.wilsonn.tech` | |
| DNS | get.tech, where `wilsonn.tech` is registered | |

Both Azure apps share one B1 plan (about $13 a month from the $100 student credit). The API must never sleep: its dispatcher, timers and live streams run inside it. The database is free for 12 months under Azure for Students (B1ms, 750 hours a month, 32 GB storage, 32 GB backups) and runs all the time; it never pauses when idle. Everything sits in UAE North because Central India refused the free B1ms size in all three zones (D81).

## 1. Database (Azure PostgreSQL)

Install the Azure command line and sign in first (step 2 shows how). Then create the server. A new student subscription must first allow the database service. Keep the admin password in your shell only:

```bash
export ADMIN_PW="$(openssl rand -hex 20)"
az provider register -n Microsoft.DBforPostgreSQL --wait
az group create -n ubuzima-rg -l uaenorth
az postgres flexible-server create -g ubuzima-rg -n ubuzima-db-uae -l uaenorth --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 17 --admin-user ubuzima_admin --admin-password "$ADMIN_PW" --public-access Enabled --zonal-resiliency Disabled
```

Only the two Azure apps may connect. After step 2 has created them, add one firewall rule per outbound address of the plan (both apps share them):

```bash
i=0; for ip in $(az webapp show -g ubuzima-rg -n ubuzima-api-uae --query possibleOutboundIpAddresses -o tsv | tr ',' ' '); do i=$((i+1)); az postgres flexible-server firewall-rule create -g ubuzima-rg -s ubuzima-db-uae -n app-$i --start-ip-address $ip --end-ip-address $ip -o none; done
```

To work on the database from your own computer, add a rule for your address for that session and delete it afterwards (`firewall-rule delete -g ubuzima-rg -s ubuzima-db-uae -n <name> --yes`).

Create the database, the mock NIDA's own user (D73) and its schema:

```bash
export NIDA_PW="$(openssl rand -hex 20)"
psql "postgresql://ubuzima_admin:$ADMIN_PW@ubuzima-db-uae.postgres.database.azure.com:5432/postgres?sslmode=require" -c "create database ubuzima" -c "create role nida_svc login password '$NIDA_PW'" -c "grant nida_svc to ubuzima_admin"
psql "postgresql://ubuzima_admin:$ADMIN_PW@ubuzima-db-uae.postgres.database.azure.com:5432/ubuzima?sslmode=require" -c "create schema nida authorization nida_svc" -c "revoke all on schema nida from public"
```

Then create the tables and the demo data. The commands read `DATABASE_URL` and `DIRECT_URL` from the shell only, so the password is never saved in a file. Azure PostgreSQL has no pooler in front of it, so both are the same direct address:

```bash
export DATABASE_URL="postgresql://ubuzima_admin:$ADMIN_PW@ubuzima-db-uae.postgres.database.azure.com:5432/ubuzima?sslmode=require" DIRECT_URL="$DATABASE_URL"
```

```bash
pnpm --filter @ubuzima/db run deploy && pnpm --filter @ubuzima/api exec tsx src/seed.ts
```

Moving existing data from another PostgreSQL (as done from Supabase on 10 Nov 2026, D81): `pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=nida`, then `pg_restore --no-owner --no-privileges --single-transaction` into `ubuzima`, skipping the two `SCHEMA` entries, then `alter table nida.person owner to nida_svc`, and compare the row counts of every table.

## 2. API and mock NIDA (Azure)

Install the Azure command line and sign in with the student account (wilsonshizirungu@gmail.com):

```bash
brew install azure-cli
```

```bash
az login
```

Create the plan and the two apps (Node 22, Linux, UAE North, next to the database). A new student subscription must first allow App Service:

```bash
az provider register -n Microsoft.Web --wait
az appservice plan create -g ubuzima-rg -n ubuzima-plan-uae --sku B1 --is-linux -l uaenorth
az webapp create -g ubuzima-rg -p ubuzima-plan-uae -n ubuzima-api-uae --runtime "NODE:22-lts"
az webapp create -g ubuzima-rg -p ubuzima-plan-uae -n ubuzima-nida-uae --runtime "NODE:22-lts"
az webapp config set -g ubuzima-rg -n ubuzima-api-uae --always-on true --startup-file "node app/dist/main.js" --min-tls-version 1.2 --ftps-state Disabled
az webapp config set -g ubuzima-rg -n ubuzima-nida-uae --always-on true --startup-file "node app/dist/main.js" --min-tls-version 1.2 --ftps-state Disabled
az webapp update -g ubuzima-rg -n ubuzima-api-uae --https-only true
az webapp update -g ubuzima-rg -n ubuzima-nida-uae --https-only true
```

### Settings

**API (`ubuzima-api-uae`)**, under Configuration → Application settings:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (the zip is already built) |
| `DATABASE_URL` | the address from step 1, ending `/ubuzima?sslmode=require` |
| `APP_SECRET` | a new random string: `openssl rand -hex 32` |
| `WEB_URL` | `https://ubuzima.wilsonn.tech` |
| `COOKIE_DOMAIN` | `.ubuzima.wilsonn.tech` (the browser opens live streams straight to the API, D34) |
| `NIDA_URL` | `https://ubuzima-nida-uae.azurewebsites.net` |
| `NIDA_API_KEY` | a new random string, the same on both apps |
| `GEMINI_API_KEY` | from `apps/api/.env` |
| `GEMINI_MODEL`, `GEMINI_THINKING` | as in `apps/api/.env` |
| `RESEND_API_KEY` | from Resend (step 4) |
| `MAIL_FROM` | `UbuzimaConnect <noreply@ubuzima.wilsonn.tech>` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | from `apps/api/.env` |
| `DEMO_INBOX` | `1` (D66: graders read demo accounts' codes at /demo/inbox) |
| `TRUST_PROXY_HOPS` | `2` (Vercel, then Azure's front end) |

**Mock NIDA (`ubuzima-nida-uae`):**

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` |
| `NIDA_API_KEY` | the same value as on the API |
| `NIDA_ALLOWED_IPS` | every address the API may call from: `az webapp show -g ubuzima-rg -n ubuzima-api-uae --query possibleOutboundIpAddresses -o tsv` |
| `TRUST_PROXY` | `1` |
| `NIDA_DATABASE_URL` | the same database, but logged in as its own user `nida_svc`, which can only work in the `nida` schema (D73). Step 1 created the user and schema; the address is `postgresql://nida_svc:<NIDA_PW>@ubuzima-db-uae.postgres.database.azure.com:5432/ubuzima?sslmode=require`. Without this setting the mock NIDA still verifies the built-in people but can't add new ones. |

The mock NIDA refuses every other address (and every caller without the key). Azure's front end writes the caller as "address:port"; both apps drop the port before checking (D67).

`DATABASE_URL` holds the database password, so set it from your own terminal, where it was exported in step 1:

```bash
az webapp config appsettings set -g ubuzima-rg -n ubuzima-api-uae --settings DATABASE_URL="$DATABASE_URL" -o none
```

### Upload

```bash
./scripts/azure-package.sh
```

```bash
az webapp deploy -g ubuzima-rg -n ubuzima-api-uae --src-path .deploy/api.zip --type zip --clean true --track-status false
```

```bash
az webapp deploy -g ubuzima-rg -n ubuzima-nida-uae --src-path .deploy/nida.zip --type zip --clean true --track-status false
```

Each zip holds the app in `app/`. Azure's Node startup moves a top-level `node_modules` to `/node_modules`, where ES modules can't find it, so the app must not sit at the top of the zip (D67).

Check: `https://ubuzima-api-uae.azurewebsites.net/health` answers `{"ok":true}`.

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
| `api.ubuzima` | CNAME | `ubuzima-api-uae.azurewebsites.net` |
| `asuid.api.ubuzima` | TXT | the API's verification ID: `az webapp show -g ubuzima-rg -n ubuzima-api-uae --query customDomainVerificationId -o tsv` |
| Resend's records | as shown | |

Then add the custom domains in Vercel and in each Azure app (`az webapp config hostname add`), and give the API's domain a certificate (step 6) so everything is HTTPS (NFR 1). Get the certificate **before** pointing the CNAME at a new app, or the domain has no valid HTTPS in between (D81).

## 6. Certificates for the Azure domains (Let's Encrypt)

Azure's free managed certificate can't be used here: `ubuzima.wilsonn.tech` is a CNAME to Vercel, and Vercel's CAA records allow only Let's Encrypt, GlobalSign, Google and Sectigo. Azure's free certificates come from DigiCert, so every request expires (D81). Use a free Let's Encrypt certificate with a DNS check instead, for the API's domain:

```bash
lego run --accept-tos --path ~/.lego --key-type RSA2048 --dns manual --dns.propagation.disable-rns --pfx --pfx.format SHA256 --pfx.password "$PFX_PW" -d api.ubuzima.wilsonn.tech
```

1. lego prints a TXT value for `_acme-challenge.api.ubuzima`. Set it at get.tech (edit the existing record), then wait until all four of get.tech's nameservers serve it: `dig +short TXT _acme-challenge.api.ubuzima.wilsonn.tech @cont603385.earth.orderbox-dns.com` (also `mars`, `mercury`, `venus`). This can take one to three hours.
2. Press Enter in lego. `--dns.propagation.disable-rns` stops it waiting for public resolvers, which may cache the old value for 4 hours; Let's Encrypt asks get.tech's nameservers directly.
3. Upload and attach it:

```bash
TP=$(az webapp config ssl upload -g ubuzima-rg -n ubuzima-api-uae --certificate-file ~/.lego/certificates/api.ubuzima.wilsonn.tech.pfx --certificate-password "$PFX_PW" --query thumbprint -o tsv)
az webapp config ssl bind -g ubuzima-rg -n ubuzima-api-uae --certificate-thumbprint $TP --ssl-type SNI
```

The mock NIDA has no custom name: only the API calls it, over HTTPS on Azure's own address, which already has a certificate (D81). Let's Encrypt certificates last 90 days: the API's runs to **9 February 2027**, so renew it in January the same way.

## 7. After it's live

- Log in as a patient (README), and as `agent@ubuzima.test` with the codes from https://ubuzima.wilsonn.tech/demo/inbox.
- Run `node scripts/live-check.mjs` (103 checks against the live site).
- Run the page-weight check against the live site, and try a request on a real phone over mobile data (NFR 4, 8).
