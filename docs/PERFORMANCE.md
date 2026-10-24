# Performance and scale (NFR 4, NFR 5)

Measured on 25 October 2026 on the development Mac (Apple silicon, PostgreSQL 16 on the same machine), with one API instance. The raw numbers are in [`performance-api.json`](performance-api.json) and [`performance-pages.json`](performance-pages.json). Both are rewritten each time the measurements run.

## What the SRS asks

- **NFR 4:** 95% of common actions within 3 seconds on 3G; the AI within 10 seconds; chat messages within 3 seconds.
- **NFR 5:** 1,000 patients a day, 50 facilities and 100 staff, with room for more instances behind a load balancer.

## 1. The API at the SRS's scale

`apps/api/test/scale.test.ts` builds the scale in the test database:
- 50 facilities and 100 staff;
- a month of requests at 1,000 a day (30,000);
- 20 people using the app at the same time.

It then makes 200 requests of each common action. The test fails if any 95th percentile reaches 3 seconds.

| Action | Median | 95% within | Slowest |
|---|---:|---:|---:|
| Patient: open a request | 34 ms | 43 ms | 45 ms |
| Patient: home list of requests | 48 ms | 57 ms | 68 ms |
| Patient: send a chat message | 20 ms | 23 ms | 25 ms |
| Agent: queue and status | 20 ms | 24 ms | 26 ms |
| Agent: open the case | 62 ms | 77 ms | 85 ms |
| Agent: facilities to route to (50 facilities) | 50 ms | 55 ms | 59 ms |
| Clinician: patients on the way | 22 ms | 25 ms | 31 ms |
| Pharmacy: check a code | 12 ms | 15 ms | 16 ms |
| Administrator: on-duty dashboard | 12 ms | 15 ms | 17 ms |
| Administrator: a month's report (30,000 requests) | 159 ms | (one run) | |

**Found and fixed:** the routing list counted beds with 2 queries per facility, so 100 queries for 50 facilities. Its 95th percentile was 208 ms. It now uses 2 grouped queries for all facilities: 55 ms.

## 2. The same actions on a 3G phone

Server time is the smaller part on 3G. Most of the time is the trip across the network. The model uses WebPageTest's **3G** profile (1.6 Mbps down, 300 ms round trip):

> time = server time (95th percentile) + 2 round trips (the connection is already open) + bytes ÷ speed

API answers are small: opening a request is 0.6 KB compressed, the home list 0.7 KB.

| Action on 3G | Estimate |
|---|---:|
| Open a request | 0.04 + 0.6 + 0.003 ≈ **0.65 s** |
| Send a chat message | 0.02 + 0.6 + 0.002 ≈ **0.6 s** |
| Agent opens the case | 0.08 + 0.6 + 0.01 ≈ **0.7 s** |

**Common actions are well within 3 seconds on 3G.**

Chat delivery is proved separately: a message reaches the other side's live stream in under 3 seconds (`agent.test.ts`). The AI has a hard 10-second limit, after which the case continues as Uncertain (`cases.test.ts`, FR 4.7).

## 3. Opening a page for the first time on 3G

`scripts/page-weight.mts` loads a production build. For each page it fetches the HTML and every script and style it names, compresses them as the server does, and adds them up. Fonts aren't counted: they load after the text is already shown with a fallback font, so they don't block reading.

The first-visit model:

> 5 round trips (DNS, TCP, TLS, the page, then its files over one HTTP/2 connection) + all bytes ÷ speed

| Page | Files | Downloaded | 3G | 3G Slow (400 kbps, 400 ms) |
|---|---:|---:|---:|---:|
| Welcome `/` | 14 | 242 KB | 2.7 s | 6.9 s |
| Emergency `/emergency` | 13 | 236 KB | 2.7 s | 6.8 s |
| Login `/login` | 14 | 273 KB | 2.9 s | 7.6 s |
| Prescription check `/check` | 15 | 276 KB | 2.9 s | 7.6 s |
| Patient home `/home` | 16 | 292 KB | 3.0 s | 8.0 s |
| Start a request `/cases/new` | 16 | 301 KB | 3.0 s | 8.2 s |

- **The first visit is right at the 3-second limit on 3G, and over it on slow 3G.** About 1.5 s of that is round trips, not size.
- **Most of the weight is React and Next.js** (about 150 KB compressed), the same on every page.
- **The validation library zod** adds about 34 KB on pages with forms.
- **Repeat visits:** the service worker keeps the code on the device (D59). After the first visit only the page itself is downloaded (6 to 8 KB), so a page opens in about 1.5 s on 3G.
- **The installed app** and the emergency page open without any connection at all (FR 1.9).

**Possible next step if real users on slow 3G find the first visit too slow:** use zod's smaller build (`zod/mini`) in the forms, saving about 25 KB, or about 0.1 s on 3G. The round trips can only be cut by a server closer to Rwanda. That is a deployment choice for phase 4: a server region in Africa, or a CDN with a point of presence in Kigali.

## 4. Scale beyond one instance (NFR 5)

- **One instance** handles the SRS's numbers with a wide margin (section 1). 1,000 requests a day is less than one a minute on average.
- **More instances:** the dispatcher and the timers already take a database lock, so only one instance runs them at a time (D36, D53).
- **The one part that needs work first** is the live-update bus (chat, offers, alerts). It lives in memory, so with two instances a message posted on one wouldn't reach a phone connected to the other. Switching it to Postgres LISTEN/NOTIFY is the planned change (D34). It belongs with deployment in phase 4.

## How to run them again

```bash
pnpm --filter @ubuzima/api test -- test/scale.test.ts
```

```bash
cd apps/web && pnpm build && npx next start -p 3100
```

```bash
pnpm --filter @ubuzima/api exec tsx ../../scripts/page-weight.mts http://localhost:3100
```
