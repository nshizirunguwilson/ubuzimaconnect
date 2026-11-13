# Stand-up 2 notes

A running record of what was done, what went wrong and what comes next, kept up to date as the work moves. Times are UTC.

## Done

### App changes (pushed)
- Tests rewritten for readability; all dashes in code and copy replaced with hyphens (075d992).
- Traceability file updated with the live deployment and the iPhone and Android checks (4184db2).
- Date of birth now taken as three boxes (day, month by name, year), so older patients do not scroll a calendar for decades. Urgent home card now reads "Urgent: see what to do now" (e5a025c).
- All icons moved from Lucide to Phosphor (react-icons); the AI suggestion uses a lightbulb (5c370e7).
- Tested on the iOS Simulator and the Android emulator.
- Google Slides deck rebuilt for UbuzimaConnect.

### Database move: Supabase to plain PostgreSQL (facilitator feedback)
The facilitator advised against Supabase, so the database now runs on **Azure Database for PostgreSQL Flexible Server** (free for 12 months under Azure for Students: Burstable B1ms, 32 GB).
- 10 Nov: created `ubuzima-db-uae` (PostgreSQL 17, UAE North).
- Copied all data from Supabase with `pg_dump` / `pg_restore`; row counts match on all 31 tables.
- Moved the API and the mock NIDA service to a new App Service plan in UAE North (`ubuzima-api-uae`, `ubuzima-nida-uae`) so they sit next to the database.
- Downtime for the database switch: about 6.5 minutes (19:06 to 19:12).
- DNS at get.tech: `api.ubuzima` now points at the UAE API.
- 11 Nov, 08:40: free Let's Encrypt certificate for `api.ubuzima.wilsonn.tech` issued and attached to `ubuzima-api-uae` (valid to 9 Feb 2027). HTTPS and login work again.
- 11 Nov: full live check against the live site, `node scripts/live-check.mjs`: **103 passed, 0 failed** (patients, agents, clinicians, facility managers, administrators, prescriptions, reports, alerts).
- 11 Nov: retired the old Central India setup (apps `ubuzima-api`, `ubuzima-nida` and plan `ubuzima-plan`), which stops the double App Service charge on the student credit. Removed the temporary database firewall rules; the database now accepts only the UAE apps' own addresses, and the mock NIDA accepts only the UAE API. Live check rerun after the cleanup: **103 passed, 0 failed**.

### Documents updated (11 Nov)
- `docs/DEPLOY.md`: rewritten for Azure PostgreSQL and the UAE North apps, with the database setup commands, the data move, and a new step for Let's Encrypt certificates and their renewal.
- `README.md`, `docs/TRACEABILITY.md` and `DECISIONS.md` (new D81: why Azure PostgreSQL, why UAE North, the move, the certificate problem and the proof).
- New deployment diagram (UML) in `docs/srs/deployment-diagram.drawio` and a 4K PNG: Vercel; Azure UAE North with the App Service plan (API 1..* instances, mock NIDA) and Azure Database for PostgreSQL; Server-Sent Events; Gemini, Resend and web push as external systems.
- SRS (Google Doc): every Supabase, Mumbai and Central India mention replaced; the deployment description and the nodes table now describe Azure PostgreSQL in UAE North; revision history row 1.3 added; Figure 11 replaced with the new diagram (text enlarged so it stays readable on the page).
- 13 Nov: dropped the custom address `nida.ubuzima.wilsonn.tech` for the mock NIDA (internal, only the API calls it). It stays on `ubuzima-nida-uae.azurewebsites.net` over HTTPS. Removed from the Azure app and from get.tech; DEPLOY.md, TRACEABILITY.md, DECISIONS.md (D81) and the SRS updated. Live check afterwards: 103 passed, 0 failed (one earlier run had a single failure that did not repeat in two reruns).

- 13 Nov: security check of the live setup. CORS lets only ubuzima.wilsonn.tech call the API; the mock NIDA refuses every outside caller (403); all three sites force HTTPS (TLS 1.2 or newer); the database takes only encrypted connections from the 31 app addresses. Gap found and fixed: the website now sends browser protection headers (no framing by other sites, nosniff, referrer and permissions policies) (44c2284). Live check afterwards: 103 passed, 0 failed.

## Challenges

| Challenge | What happened | How it was handled |
|---|---|---|
| Free database size refused in Central India | Azure returned `SkuNotAvailable` for B1ms in all three zones | Moved the database, API and NIDA together to UAE North |
| Old resource name still held | The failed Central India attempt kept the name `ubuzima-pg` | Used `ubuzima-db-uae` |
| Apps could not reach the new database at first | Firewall rules need public access enabled | Enabled public access, added each app's outbound addresses |
| Slow DNS at get.tech | Record changes take an hour or more to reach all four nameservers | Kept old and new apps on the same database so nothing broke while waiting |
| Azure free HTTPS certificates kept failing (10 to 11 Nov) | `ubuzima.wilsonn.tech` is a CNAME to Vercel, and Vercel's CAA records only allow Let's Encrypt, GlobalSign, Google and Sectigo. Azure's free certificates come from DigiCert, so every request expired | Switched to a free Let's Encrypt certificate using a DNS TXT check |
| API domain without valid HTTPS for several hours (about 01:30 to 08:40 on 11 Nov) | DNS already pointed at the UAE apps before their certificate existed | Fixed with the Let's Encrypt certificate. Lesson: issue the certificate before moving DNS |
| `nida` TXT record slow to publish | get.tech took over 1.5 hours and counting | Issued the `api` certificate on its own (its check had already passed) so users were not kept waiting; `nida` is internal and follows |
| get.tech panel issues | Session signs out on some saves; one edit stored the value twice | Signed back in, corrected the record, checked it in the panel |
| Certificate tool stuck after DNS was live | lego also waited for Google's DNS, which cached the old TXT value for 4 hours | Restarted it checking only get.tech's own nameservers (what Let's Encrypt itself checks); the API domain passed at once |
| `nida` certificate check value changed (12 Nov) | get.tech finally published the `nida` TXT value overnight, but by then Let's Encrypt had dropped that pending check and asked for a new value. That means one more DNS change and another wait of hours | `nida` is internal and works over its Azure address with HTTPS, so users see no effect. On 13 Nov the custom name was dropped; the mock NIDA stays on its Azure address |
| Cost of running two App Service plans | App Service B1 is paid from the $100 student credit (about $13 a month per plan); the old India plan and the new UAE plan both run during the move | Retire the India plan as soon as HTTPS works on the UAE apps |

## Next moves
1. Renew the API certificate in January 2027 (it ends 9 Feb 2027), following DEPLOY.md step 6.
2. Fix the translation sheet script; refresh stale counts in VIDEO.md (199 tests).
