# UbuzimaConnect: Design Decisions

Each entry says what was decided, why, and where the proof is. Newest last.

---

### D1. Tailwind's default palette and radii are removed
- **Decision:** `globals.css` clears `--color-*`, `--radius-*`, `--shadow-*` and `--font-*` before defining ours.
- **Why:** with the defaults gone, a class like `bg-purple-500` or `rounded-lg` does nothing, so off-palette colours and plain rounded corners cannot slip into a screen (DESIGN.md §2, §5).
- **Exception:** `rounded-full`, for true circles only (radio, avatar, progress segments).

### D2. Text colour tokens are named `fg`
- **Decision:** the DESIGN.md roles `text`, `text-secondary` and `text-muted` are the tokens `fg`, `fg-secondary` and `fg-muted`.
- **Why:** Tailwind prefixes colour classes with `text-`, so the role `text` would become `text-text`. The roles and values are unchanged.

### D3. Native squircle radius = base radius × 1.77
- **Decision:** with `corner-shape: squircle`, the border radius is the base radius multiplied by `--sq-k: 1.77`.
- **Why:** a superellipse corner at the same radius looks smaller than the Figma-style smoothed corner used by the fallback. The multiplier was found by drawing both shapes on a canvas (400 × 400 px, radius 48 px, 4× supersampling) and counting the pixels that differ:

| k | 1.60 | 1.70 | **1.75** | 1.80 | 1.85 | 2.00 |
|---|---|---|---|---|---|---|
| Differing area (px²) | 348 | 180 | **154** | 162 | 231 | 620 |

  The best fit is between 1.75 and 1.80, so we use 1.77. That is less than half a pixel of average difference along each corner. The model of the native shape (|x|⁴ + |y|⁴ = 1) was checked against Chrome's rendering by overlaying the two.
- **Fallback curve:** `figma-squircle` with `cornerSmoothing: 0.6` (Figma's "iOS" preset).

### D4. How the fallback paints borders, focus rings and shadows
- **Decision:** in browsers without `corner-shape` (Safari, Firefox), `<Squircle>` measures itself and draws an SVG behind its content: the fill and the 1 px border on one path, plus the focus ring (a 2 px gap and a 2 px ring) on paths 1 px and 3 px outside it. The shadow is a `drop-shadow` filter on that SVG.
- **Why not `clip-path`?** Clipping cuts off the border at the corners and hides any focus ring or shadow drawn outside the element.
- **Paint goes through variables** (`sq-bg-*`, `sq-border-*`), so hover, checked and error states change both the CSS paint and the SVG paint.
- **Test it:** add `?sq=fallback` to any URL to force the fallback in Chrome. Checked on the component sheet at 375 px: 67 of 67 squircles drawn, no horizontal scroll.

### D5. An `xs` radius (6 px) for controls under 24 px
- **Decision:** the checkbox (20 px) uses a 6 px radius.
- **Why:** the smallest step on the scale, `sm` (8 px), on a 20 px box almost makes it a circle, so it could be mistaken for a radio button.

### D6. Native `<select>`
- **Decision:** the select is the browser's own control inside our squircle shell.
- **Why:** on phones this opens the system picker, which our users already know, and it works with screen readers and offline without extra code.

### D7. Bottom sheet on phones, dialog from 640 px
- **Decision:** below 640 px the dialog is anchored to the bottom with only the top corners rounded; from 640 px it is a centred dialog with all four corners rounded. On phones the actions stack with the primary on top; on desktop the primary is on the right.
- **Why:** on a phone the actions are within thumb reach (DESIGN.md §4).

### D8. Toasts use the dark surface
- **Decision:** the toast is gray-900 with white text (contrast 14.6:1).
- **Why:** toasts float over any screen, so they need to stand apart from the white and gray-50 surfaces without using the blue accent (DESIGN.md §2, the 10% rule).

### D9. Contrast is a test, not a promise
- **Decision:** `src/lib/tokens.ts` lists every text and UI pair we use. `src/lib/contrast.test.ts` checks each one against WCAG 2.2 (4.5:1 for text, 3:1 for UI parts), and the component sheet shows the same table.
- **Result:** 23 of 23 pairs pass (`pnpm --filter @ubuzima/web test`).

### D10. A Notice component for page-level messages
- **Decision:** a tinted squircle with an icon, a short title and one sentence, for messages about the whole page: "Too many tries", "You were logged out", "We can't check IDs right now".
- **Why:** these are not tied to one field, so they can't sit under an input, and a toast disappears too fast for a lock that lasts 15 minutes. It follows the status rule (icon + words + tint, DESIGN.md §2). Field errors stay under their field.

### D11. `SquircleLink` for links in server pages
- **Decision:** a small client component that renders `<Squircle as={Link}>`.
- **Why:** React can't pass a component (`Link`) from a server page to a client component as a prop. For the same reason, navigation icons are passed as rendered elements (`<LuHouse />`).

## Phase 0 (foundation and logins)

### D12. Server-side sessions with a cookie, through a same-origin `/api`
- **Decision:** after login the API sets an `httpOnly`, `SameSite=Lax` cookie with a random token. The database keeps only its SHA-256 hash, plus `expiresAt`, which moves 15 minutes ahead on each request. The web app sends all calls to `/api/*`, which Next.js rewrites to the NestJS API.
- **Why not JWTs:** the SRS needs three things that are simple with server sessions and awkward with JWTs: sessions ending after 15 idle minutes (FR 1.7, 2.5), a staff login that exists but is not usable until the email code is entered (FR 2.2), and ending every session when a password changes (FR 2.7).
- **Why the rewrite:** to the browser the cookie is first-party on the web domain, so no CORS setup and no cross-site cookie rules are needed.

### D13. Staff locks: a temporary lock first, then email
- **Decision:** 5 wrong passwords lock the account for 15 minutes (FR 2.3). If the next 5 tries after that lock also fail, the account becomes `LOCKED_EMAIL`, and only the emailed code (valid for 15 minutes) or a password reset opens it (FR 2.4). Failures are counted by a hash of the email, even for emails with no account. A wrong email and a wrong password get the same answer and take the same time (a dummy argon2 check), so the login can't be used to find out which emails have accounts.

### D14. Patients: the national ID is never stored
- **Decision:** the patient row keeps an HMAC-SHA256 of the national ID (with a server secret) for lookup, and the identity service's own reference (`nidaRef`). The ID is never a key, never in a URL and never logged. An automated test checks that the raw ID is not in the table.
- **Same answer for every mismatch:** a wrong date of birth, a wrong name and an unknown ID all get the same answer (FR 1.4). The response doesn't say which part was wrong.

### D15. The mock NIDA only answers the API
- **Decision:** the mock identity service checks the caller's address against `NIDA_ALLOWED_IPS` (only this computer, by default) and also needs an API key. In Azure, the same addresses are also set as App Service access restrictions, so other traffic never reaches the app.
- **Why:** a real identity registry would never be open to the internet. The mock behaves the same way so the demo is honest.

### D16. NestJS 12 and Prisma 7 build choices
- **NestJS 12 is ESM-only.** Nest's dependency injection needs decorator metadata, which esbuild doesn't produce, so `tsup` builds the API with SWC (turned on by `emitDecoratorMetadata`). Each app becomes a single `dist/main.js` for App Service, with a `createRequire` banner for bundled CommonJS packages (`pg`).
- **Prisma 7** uses the `prisma-client` generator and the `pg` driver adapter. There is no native query engine, so no `binaryTargets` are needed for Azure's Linux.
- **Tests:** the API tests start the real built API and mock NIDA against the `ubuzima_test` database. Setup refuses any database whose name doesn't end in `_test`.

### D17. Development outbox instead of real email
- **Decision:** without `RESEND_API_KEY`, every email (codes, invitations, reset links) is saved to the `EmailMessage` table and shown at `/dev/outbox`. That page is hidden in production.
- **Why:** the whole staff flow can be tested on one computer without sending real email.

### D18. The staff navigation is an inset squircle panel
- **Decision:** the navigation is a white `xl` squircle panel with a 12 px margin from the screen edge and a 12 px gap to the content. It stays in place while the page scrolls. On phones the same panel holds the logo, log out and the navigation across the top.
- **Source:** a reference image you shared on 24 Oct 2026 (a dashboard shot by Owais Anwer, "pikbites"). We take the floating sidebar with space on both sides and a tinted active item. We leave the green gradient cards, the striped chart bars and the "Download our app" promo.
- **Why:** a panel with space around it reads as one object and keeps the squircle shape visible. A strip glued to the screen edge would lose its corners.

### D19. No pharmacist accounts; roles follow the SRS
- **Decision:** the staff roles are the four in FR 2.1: agent, clinician, facility manager and administrator. The pharmacist role I had added is removed (migration `20261024120000_staff_roles_per_srs`).
- **Why:** in the SRS, pharmacists use the public prescription check page (use case 19, FR 11.7, FR 9.6), with no login.
- **Who creates whom:** the administrator creates agents (with a licence number, because agents issue prescriptions, FR 11.2) and facility managers (FR 12.1). Facility managers create clinicians (FR 8.2).

### D20. Phase 0 checked against the full SRS text
After reading the full requirement text, I fixed these details:
- **FR 1.5:** the exact message "Verification is temporarily unavailable", the Emergency button, and a log entry for the failure.
- **FR 1.6:** the Emergency button on the lock message.
- **FR 1.8:** the label is "This is not my device", and the device gets no notifications at all.
- **FR 1.3:** a child of 16 or older logs in with their own ID and sees only their own record; the parent still sees them. A fictional 17-year-old was added to the mock NIDA to prove this.
- **FR 2.4:** a password reset doesn't unlock an account locked a second time. Only the emailed unlock code does, and administrators can't unlock accounts.
- **FR 2.6:** "Send again" for an unused invitation, which makes the old link stop working.
- **FR 10.1:** logins are logged with the device type.

## Phase 1, batch 1 (setup data for routing)

### D21. Levels of care follow Rwanda's health system
- **Decision:** a facility's level is one of health post, health centre, district hospital, provincial hospital or referral hospital.
- **Why:** the SRS names "level of care" but gives no list. These are the levels of Rwanda's public health system, lowest to highest. Level-two teaching hospitals are stored as provincial hospitals.

### D22. One shift table for both schedules
- **Decision:** a `ShiftAssignment` row is one person on one Day or Night shift on one date, with an unavailable flag and reason. The clinician schedule (FR 8.4) and the agent schedule (FR 12.4) are the same table and the same grid; the role decides who appears. A night shift belongs to the date it starts on (19:00).
- **Why:** this matches the SRS class diagram (WeeklySchedule made of ShiftAssignment records). The "on duty now" check that routing needs is then a single query.
- **Gaps are worked out, not stored:** for a facility, a shift has a gap when no available clinician covers a service the facility offers. For agents, it has a gap when nobody is on it (NFR 12). Unavailable people don't count.

### D23. Red-flag questions are removed softly
- **Decision:** "Remove" hides a question from new cases but keeps the row.
- **Why:** FR 12.6 says changes apply to new cases only. Older cases must still show the question they answered. N2 (babies under 8 days) is a rule in code (FR 4.2), not a question.
- **Kinyarwanda:** the texts aren't in the SRS, so the 23 questions are seeded in English and the list shows how many still need a translation. Machine-translated medical questions would be unsafe, so they are left for a Kinyarwanda speaker to write.

### D24. Seeded facilities are real names with approximate data
- **Decision:** the six demo facilities use real Kigali facility names. Their services, bed counts, phone numbers and coordinates are approximate demo values.
- **Why:** routing by distance needs believable locations. The README says these aren't real figures.

### D25. Screenshots in the browser pane
- When the pane runs in the background it pauses animation frames, so React's reveal of streamed content waits until the next screenshot. A page that looks empty in a first screenshot is not a bug; checks look at the DOM, then take a second screenshot.

## Phase 1, batch 2 (the patient case flow)

### D26. The safety rules are pure functions
- **Decision:** red-flag groups, the newborn rule, the needed service (FR 5.1), the triage level (FR 4.4, 4.5) and facility matching (FR 5.3, 5.4, 5.8, 5.9) live in `packages/shared/src/triage.ts`. They have no database or network code, and each rule has a test written from the SRS wording (`triage.test.ts`).
- **Why:** these rules decide whether someone is told to go to hospital. They must be easy to read next to the SRS and to test exhaustively.

### D27. The patient never sees the words "Uncertain" or "Minor"
- **Decision:** an Urgent case shows where to go now, with the distance, a call button and 912 (FR 5.5). Every other case shows "An agent will reply here". The level is for staff.
- **Why:** calling someone's problem "Minor" can make them wait when they shouldn't, and "Uncertain" alarms without helping. The SRS's patient-facing messages say what to do, not the level.

### D28. Yes and No look the same on a red-flag question
- **Decision:** both answers are equal secondary buttons, and the hint says "Answer Yes if you're not sure".
- **Why:** a red Yes or a blue No would push people towards one answer. Red is kept for the result (DESIGN.md §2). When unsure, the safe answer is Yes.

### D29. How the AI is called and tested
- **Model:** `GEMINI_MODEL` (default `gemini-2.5-flash`) returns JSON in a fixed schema at temperature 0.
- **What it is sent:** only the description, how long, how bad, age, sex, pregnancy and the number of red flags asked. Never a name, ID or location (FR 4.6).
- **Failures:** a timeout (10 s), an error, a missing key, the switch being off, or an open breaker all become an "AI unavailable" result. The triage rules then make the case Uncertain (FR 4.5, 4.7).
- **Testing without the internet:** the API's Gemini address can be set (`GEMINI_BASE_URL`), and the tests run a small stand-in server (`apps/api/test/fake-gemini.ts`). There are no test-only branches in the product code.

### D30. Sector centres come from NISR boundaries
- **Decision:** the manual location picker uses Rwanda's 416 sectors. Each sector's centre is the area-weighted centroid of its official boundary (NISR via HDX, CC BY-IGO). Only names, codes and centres are stored (`packages/shared/src/data/sectors.json`, 48 KB).

### D31. Urgent guidance is a suggestion until an agent confirms it
- **Decision:** an Urgent case stores the suggested facility and shows it at once (FR 5.5). It doesn't yet create a routing, bed reservation or clinician assignment. Those come with the agent's routing in batch 3, together with the automatic routing for red-flag cases (FR 5.12).
- **Why:** reserving beds needs the routing states (Suggested, Confirmed, Expired) from the SRS state machine, which belong with the rest of routing.

### D32. The dev servers and stale code
- The Next.js dev server sometimes keeps an old copy of a changed file or old Tailwind CSS. The fix is to stop it, delete `apps/web/.next` and start it again (also in the README).
- The API's watch build now also watches `packages/shared` and `packages/db`, so a regenerated database client is picked up. This applies only with `--watch`; a plain `build` must exit, which tests and deployment rely on.

### D33. Gemini model: 3.5 Flash Lite with minimal thinking
- **Decision:** `GEMINI_MODEL=gemini-3.5-flash-lite` and `GEMINI_THINKING=MINIMAL`, both set in `apps/api/.env`.
- **Why:** tried on 24 Oct 2026 with the project's free-tier key.
  - `gemini-2.5-flash` is closed to new keys.
  - `gemini-3.8-flash` didn't answer within 60 seconds, and `gemini-3.7-flash` returned "high demand".
  - 3.5 Flash Lite answered 6 of 6 calls in about 1 second.
  - Sorting one message into a fixed category doesn't need a larger model, and FR 4.3 allows 10 seconds.
- **Result on three fictional cases:** a mild rash came back minor with high confidence → Minor. Severe belly pain with vomiting came back urgent → Urgent. "I just feel strange" came back minor with low confidence → Uncertain (FR 4.5 c).
- **Temperature** is left at the model default, as Google advises for Gemini 3 models. The fixed JSON schema keeps answers in the allowed values.

## Phase 1, batch 3 (agent queue, chat and routing)

### D34. Live updates use Server-Sent Events, straight to the API
- **Decision:** chat messages, offers and queue changes reach the browser over Server-Sent Events from the API (`/events/cases/:id`, `/events/agent`). The browser opens them directly on the API's address with the session cookie, and sends messages as ordinary requests.
- **Why not through `/api`:** the Next.js docs warn that proxied long connections are closed on timeout. A direct stream avoids that. Locally the cookie reaches `localhost:4000` because cookies don't depend on the port. In production `COOKIE_DOMAIN=.ubuzima.wilsonn.tech` shares it with `api.ubuzima.wilsonn.tech`, and CORS allows only the web address, with credentials.
- **Why not Socket.IO (the earlier plan):** chat here is one-way pushes plus ordinary sends. Server-Sent Events do that with the existing cookie check, reconnect on their own, and add no extra library or second login path.
- **Proof:** an agent's message reaches the patient's stream in under 3 seconds, as NFR 4 requires (`agent.test.ts`).
- **Several instances:** events also travel through Postgres LISTEN/NOTIFY (D70).

### D35. "Connected" means the agent's stream is open
- **Decision:** while an agent's stream is open, the API marks them as seen every 15 seconds. The stream is opened on every staff page, not only the queue. The dispatcher treats 60 seconds without it as a lost connection (FR 6.14).
- **Found in testing:** at first only the Queue page opened the stream. An agent working a case looked lost after 60 seconds, and the case was given back. Fixed by `AgentPresence` in the staff layout.
- **Background tabs:** Chrome may freeze a background tab after a few minutes, which closes the stream. Agent pages hold a Web Lock, one of the conditions under which Chrome doesn't freeze a tab. Agents should still keep the tab open while on shift; the SRS treats a silent agent as Offline.

### D36. The dispatcher
- **Decision:** a loop runs every 2 seconds (`DISPATCH_MS`) inside a Postgres advisory lock, so only one instance dispatches at a time. Each pass it:
  1. marks lost agents Offline and returns their cases,
  2. moves expired offers to the next agent,
  3. offers waiting cases by level, then front-of-queue, then age, to the Available agent who has been free the longest.
- **Front of the queue:** a paused, released or returned case keeps its level and is flagged to go first within that level (FR 6.12, 6.14, 6.16).
- **Tests** shorten the offer time (`OFFER_MS`); production uses 30 seconds.

### D37. Urgent cases are routed before an agent sees them
- **Decision:** a red-flag or newborn case immediately gets a routing in the Suggested state (SRS state machine). It has the nearest suitable facility, a held bed and the automatically chosen clinician (FR 5.5, 5.7, 5.12). The agent then confirms it, which keeps the same bed, or changes it, which releases that bed and holds a new one. The `Case.suggestedFacilityId` column from batch 2 was removed.

### D38. The patient app uses the width on computers
- **Decision:** on phones nothing changes: one column (DESIGN.md §4). From 1024 px the frame widens to 1040 px. Forms and questions stay in one 480 px column. The home page and the case page use two columns: requests on the left and family on the right on the home page; guidance on the left and the chat on the right on the case page. A slim header with the logo and Log out runs across the top.
- **Why:** the user saw a phone-shaped strip in the middle of a laptop screen. A long line of text is harder to read, so forms keep one narrow column (Baymard: about 50 to 75 characters per line). The chat is beside the guidance so a patient can read where to go while they answer the agent, without scrolling between them.
- **Found in review:** raised by the user while reviewing batch 3 at 1280 px.

## Phase 1, batch 4 (clinicians) and review fixes

### D39. The routing is the visit
- **Decision:** there is no separate Visit table. A routing marked Arrived is the active visit, and Discharged, Completed or Transferred end it.
- **Why:** the SRS routing state machine already names it "Arrived (active visit)", with those three end states. A second table would repeat the same lifecycle and could drift from it.
- **Records:** clinical entries are versioned rows. An edit adds a row with the same `rootId` and points to the version it replaces (`previousVersionId`, unique, so two edits of one version can't both win). Earlier versions are never changed (FR 7.7).
- **Arrival before an agent:** an urgent patient can reach the facility before any agent took the case. Marking them arrived closes that case as Routed to facility, so agents don't spend time on someone already in care.

### D40. Passwords: at least 8 characters
- **Decision:** the minimum is 8 (was 12), still with no rules about symbols or digits, and a maximum of 128.
- **Why:** NIST SP 800-63B-4 §3.1.1.2 sets 8 as the minimum for a password used with a second factor, and 15 without one. Staff always enter an emailed code as well (FR 2.2). Raised by the user in review.

### D41. Login codes as six boxes over one field
- **Decision:** the 6-digit code shows one box per digit. Underneath is one real input laid over the boxes.
- **Why:** six separate inputs break pasting the whole code, the device's "code from email" autofill (`autocomplete="one-time-code"`), and screen readers, which announce six unlabeled fields. One input keeps all three working while the boxes show progress digit by digit. Raised by the user in review.

### D42. Leaving a screen resets it; logging out reloads the page
- **Found in review:** "Log out" showed a spinner nobody had pressed, and the staff login showed an old error with a spinning Continue button.
- **Cause:** with `cacheComponents`, Next.js 16 keeps a page's React state when you navigate away (React Activity). A button left loading by a navigation was still loading when the page came back.
- **Decision:** loading flags use `usePending`, which resets when the screen is hidden. Login and code forms also clear typed passwords, codes and errors then. Logging out (by the button or after 15 idle minutes) is a full page load, so nothing a patient or clinician saw stays in the browser's memory. That matters on shared devices (FR 1.8).
- **Confirmation:** Log out now asks first, and so does every agent status change. They end a session or change whether cases arrive, and a stray tap shouldn't do either.

### D43. Agent status colours
- **Decision:** Available is green, Away amber, Offline grey, each with a dot and the word (DESIGN.md §2: never colour alone). Busy stays the blue "Busy with a case" badge.
- **Why:** the user couldn't tell the chosen status from the others when all three looked alike.

### D44. Demo identities follow the real ID layout
- **Decision:** IDs are shown and typed in the card's six parts: `1 1987 8 0592371 0 64`. The parts are nationality (1 Rwandan, 2 refugee, 3 foreign resident), year of birth, sex (8 male, 7 female), birth-order number, times issued, and two check digits. The form groups the digits as they are typed. The API refuses 16 digits whose first or sixth digit can't be right.
- **Demo people:** each ID's year and sex digit match the person's date of birth and sex. Names follow Rwandan custom: each person has their own Kinyarwanda name, so a child seldom shares a parent's surname. Given names fit the generation: Esperance (1960), Jean Claude (1985), Aline (1992), Ange (2009), Keza (2026). Claudine's birth year moved from 1978 to 1996, because a 48-year-old mother of a 5-week-old was unlikely. The check digits are invented: NIDA doesn't publish the method.
- **Words:** patient screens say "device", not "phone": the same screens are used on laptops.

## Phase 1, batch 5 (prescriptions, records, activity)

### D45. Prescription codes and the QR code
- **Code:** `RX-` and 8 characters from Crockford's base 32: digits and capital letters without I, L, O or U, so a code read over the phone or copied by hand isn't misread. Example: `RX-7K3M-9QPD`.
- **Why that length:** 8 characters give 40 random bits, about a trillion codes. The public check page also pauses an address after 20 unknown codes in 10 minutes. Together these make guessing someone's prescription impractical (FR 11.7).
- **QR code:** it holds the check page's address (`/check/<code>`). Any phone camera opens it with no app, so a pharmacy needs nothing installed. It is drawn in the browser with `qrcode` 1.5.4, black on white as scanners expect, and is shown only while the prescription is valid.
- **Validity:** 7 days from the moment of issue, counted from one timestamp. A test found that two separate clock readings were 6 ms apart.
- **The public answer** carries only what FR 11.7 lists: status, patient name, medicines, prescriber name and licence, and dates. No internal IDs, national ID or diagnosis.

### D46. Activity is read from the audit log
- **Decision:** the patient activity list (FR 10.2) and staff activity (FR 10.3) read the same append-only `AuditEvent` table that FR 10.1 writes. Each event now stores the patient it touched. `AuditService` works this out in one place: from the patient, the case or the routing in the event, or the patient acting for themselves. Older events were linked by the migration.
- **Why:** one log, so what a patient sees is exactly what was recorded. There is nothing to keep in step.
- **Views once per sitting:** an agent's screen refreshes after every chat message, and each refresh logged "Opened the record". The patient would have seen the same agent many times. Views by the same person of the same record within 10 minutes now count as one. Changes are always logged each time.

### D47. A printable summary through the browser's own Print
- **Decision:** `/records/[id]/print` is a plain page, and its button calls the browser's Print, which also offers "Save as PDF".
- **Why:** it works on every phone and computer, the server keeps no files, and the patient decides where the copy goes. The page leaves out the national ID number on purpose.

### D48. The on-duty dashboard refreshes every 15 seconds
- **Decision:** the administrator's page asks for the latest every 15 seconds, rather than holding a live stream.
- **Why:** agents' statuses change a few times an hour. A 15-second refresh matches the agent's own heartbeat (D35) and adds no new stream type for one screen.

## Phase 2 (the full flow, and the gaps from phase 1)

### D49. "No facility can take it" is decided when the case is sent
- **Decision:** when a non-urgent case is sent, the needed service is checked against every active facility, with a clinician of that specialty on duty now (bed not required). If none matches, the case becomes Urgent, with the reason in words, and goes to the queue. The patient sees "Call 912 now" and "An agent will contact you." The event is logged (FR 5.9).
- **Seen with live data:** at night the seeded schedule has no general-medicine clinician on duty anywhere. A minor urinary complaint, which the real Gemini rated minor with high confidence, went to the agents first. This is the gap the coverage view shows managers, and it is why the rule exists.

### D50. Reassignment happens when it is caused; the shift-end case waits for the timers
- **Decision:** FR 5.13 names three causes. Two are actions and act at once: a clinician marking the shift that is on now as unavailable, and an account being deactivated (by a manager or the administrator). Each patient still on the way then goes to the on-duty colleague of the same specialty with the fewest patients, who is notified. The change is logged with its reason.
- **No colleague:** the agent handling the case gets an alert that stays on screen until dismissed. If no agent has the case any more, it goes back to the front of the queue so an agent can choose another facility, and the patient is told.
- **The third cause,** a shift ending, has no action behind it, so it runs with the other timers in phase 3.

### D51. The audit log is protected by the database, not only the code
- **Decision:** a Postgres trigger refuses every UPDATE and DELETE on `AuditEvent` (NFR 9). Even a mistake in the code, or someone with the app's database login, can't rewrite history.
- **Tests** don't delete log rows any more. The one test that leaves its address paused for 10 minutes runs last in its file.

### D52. One story test for the whole flow
- **Decision:** `flow.test.ts` follows one patient, Esperance (65), through the same endpoints the screens use:
  1. login and her request for help,
  2. the AI's triage,
  3. the queue, offer and accept,
  4. chat, the agent's triage review, and routing with a bed and a clinician,
  5. the agent closing the case,
  6. the facility's incoming list, arrival, a record entry, a prescription and discharge,
  7. the pharmacy check,
  8. her records, her rating, and her activity list in the right order.
- **Why the agent decides she is Urgent, not the AI:** the AI breaker (FR 4.7) is shared by the whole test run. An earlier file trips it on purpose, so the AI's answer depends on file order. Having the agent judge the case makes the story the same every time and also covers the agent's routing path. The AI's own urgent path stays covered in `cases.test.ts`.
- **Found by it:** "Nearest facility given" was logged before "Sent the request". The case is now logged as sent first.

## Phase 3, batch A (timers, escalations, alerts)

### D53. One timer loop, beside the dispatcher
- **Decision:** `TimersService` runs every 10 seconds (`TIMER_MS`; 300 ms in tests) under its own Postgres advisory lock, so only one instance runs it. It expires routings (24 h), releases held beds (6 h), reassigns patients whose clinician's shift ended, escalates waiting cases, watches for no agent online, and counts AI failures.
- **Why separate from the dispatcher:** the dispatcher must answer within seconds (offers last 30 s). These jobs work in minutes and hours. Keeping them apart means a slow pass of one never delays the other.
- **Why every 10 seconds:** the SRS deployment diagram (Appendix B, Figure 11) says the timers are checked every ten seconds. The tightest deadline is 2 minutes (FR 6.10), so every alert fires within 10 s of its deadline, for a few small queries.

### D54. Escalation is measured from when the case started waiting again
- **Decision:** a case returned to the queue (released, paused, lost connection, or a facility that can't take the patient) gets a fresh waiting time and escalation level 0.
- **Why:** FR 6.10 is about a case nobody has accepted for 2 minutes. A case an agent had for 10 minutes and then released has not been ignored for 10 minutes.
- **Repeats:** at level 2 the in-app alerts repeat every 2 minutes (FR 6.11). The email goes once per case, so the administrator's inbox isn't flooded by one stuck case.

### D55. Alerts are saved, pushed live, and emailed when serious
- **Decision:** every administrator alert is a row in `Alert`, shown at `/staff/alerts` and as a pop-up on any administrator page. Delay incidents, 5 minutes with no agent online, and AI failure surges are also emailed (FR 6.11 asks for email, and the administrator may not have the app open). Level 1 escalations and no-capacity events stay in the app.
- **Agents** get level 1 and 2 escalations as a pop-up that stays until dismissed, on whatever staff page is open, Busy agents included (FR 6.10).

### D56. Database times are UTC; tests compare in UTC
- **Found in testing:** the timestamp columns hold UTC without a zone, but Postgres `now()` follows the session's time zone (Kigali, +2 h). A test setting "25 hours ago" with `now()` really set 23 hours ago. Tests use `now() at time zone 'utc'`, as the lock tests already did. The app itself only compares JavaScript dates, so it was never affected.

## Phase 3, batch B (push notifications)

### D57. Web Push with our own keys, not a notification company
- **Decision:** standard Web Push (the browser's own push service: Google's for Chrome, Apple's for Safari, Mozilla's for Firefox), signed with VAPID keys kept in `apps/api/.env`. The `web-push` library (3.6.7) encrypts and signs; the API sends with `fetch`.
- **Why:** no third-party account, nothing to pay, and the message is encrypted end to end (RFC 8291), so the push service can't read it. Sending with `fetch` instead of the library's own sender works with any push service, including the test one; the library's sender only speaks HTTPS.
- **Limit:** on iPhone, Safari allows Web Push only for an app added to the Home Screen. That comes with the installable app in batch C.

### D58. Push only when the app isn't open, and only "You have a new message"
- **Who gets what:** the patient who opened the case gets a push for each message from the agent or the system, whenever they don't have the app open (FR 6.6). A clinician gets one when a patient is assigned or handed over to them (FR 5.12, 7.11).
- **One place:** the push service listens to the live event bus, so every message reaches it without push code at each place a message is made. "App open" means an open live stream; those people already see the message.
- **NFR 13:** the title is "UbuzimaConnect" and the text is always "You have a new message." Only the page it opens differs. A test decrypts what the API really sends, as a browser would, and checks it.
- **FR 1.8:** a session started with "This is not my device" can't turn notifications on; the API refuses.
- **Asked in context:** the switch sits where it helps (the patient's waiting screen and the clinician's Patients page), never at login. People usually refuse a permission prompt that comes with no reason. A browser that says the subscription is gone (404 or 410) is forgotten.

## Phase 3, batch C (offline use and the installable app)

### D59. The offline cache holds public pages only, and only in production builds
- **What is kept:** the welcome page, the emergency page, the prescription check page and the login page, plus the app's code and icons. Any other page opened without a connection shows the emergency page. API answers and logged-in pages are never cached, so nothing about a patient is left on the device (FR 1.8).
- **How:** the code (`/_next/static`) is cached first because its file names change whenever it changes. Pages always try the network first, so they're never out of date while online. The worker caches the public pages and the files they name when it installs, so the first offline visit already works.
- **Production only:** the app registers `/sw.js?cache=1` only in a production build. In development a cache would serve old code after every change. Push notifications use the same worker address, so neither replaces the other.
- **Checked for real:** with a production build, the web server was stopped completely. `/emergency` still opened with Call 912 and the 5 saved facilities. `/home` opened the emergency page and showed no patient details.

### D60. A request continues offline on the device; the server stays the judge
- **Decision:** with each red-flag question the server also sends the ones still to come. Without a connection, the patient keeps answering on the device, and each answer waits in an ordered queue (`lib/outbox.ts`). When the connection returns, the queue is sent in order, and the server's own view takes over.
- **What the device decides alone:** only what FR 3.10 says. A Yes means "Call 912 and go to the nearest health facility". Anything else means "Not sent yet: waiting for connection", with the saved facilities marked "Availability not confirmed". Triage, routing and the AI stay on the server.
- **Edge cases:** the pregnancy answer changes which questions follow, so after it the device waits instead of guessing. If the server refuses a queued step because the request moved on meanwhile, the rest are dropped and the patient sees the request as it really is. Only one sender runs at a time, so nothing is sent twice.
- **Logout** clears every waiting queue on the device (FR 1.8).

### D61. Installing is offered, not pushed
- **Decision:** "Install the app" appears on the welcome page and the patient home when the browser supports installing (Chrome, Edge, Android). iPhone Safari has no install prompt, so it shows "To install: tap Share, then Add to Home Screen" instead. Nothing shows once installed, or on a shared device.
- **Why it matters here:** installing is what lets an iPhone get notifications (D57), and an installed app opens the emergency page from the home screen without a connection.

## Phase 3, batch D (Kinyarwanda)

### D62. Kinyarwanda for patients and pharmacies, drafted here and reviewed by a speaker
- **Scope (agreed with the user):** every screen a patient or a pharmacy sees is in Kinyarwanda or English. Staff screens stay in English, the language of their clinical documentation. A staff page that shares a component (the chat, a prescription card) shows the English, because it sits outside the patient language setting.
- **Who writes it (agreed with the user):** the developer drafted all 392 texts, including the 23 danger-sign questions, and isn't a native speaker. `docs/translations/kinyarwanda-review.csv` puts each draft beside its English for a Kinyarwanda speaker to correct. The danger signs are marked to be checked with a clinician too. `pnpm translations` makes the sheet again.
- **How the language is chosen:** a switch on every patient page (Kinyarwanda · English) sets a cookie. The server reads it to render the page, so there is no flash of the other language. A logged-in patient's choice is also saved on their record, so the red-flag questions and notifications come in it.
- **One catalogue per language:** `i18n/en.ts` and `i18n/rw.ts` have the same shape, so TypeScript refuses a missing line. A test flattens both and fails if any Kinyarwanda line is empty or still the English.
- **Sentences from the server** (system messages in the chat, form and API errors, activity labels) stay English in the database, which is what agents read. The patient app translates them through one table (`i18n/sentences.ts`), with patterns for those that carry a name or a code. An unknown sentence is shown as it is, never hidden.
- **Dates:** date-fns has no Kinyarwanda, so the months (Mutarama to Ukuboza) are written out, still in Rwanda time.
- **Screen readers:** the patient pages carry `lang="rw"` or `lang="en"`, so a screen reader pronounces Kinyarwanda as Kinyarwanda (WCAG 3.1.2).
- **What patients type:** they may describe their problem in Kinyarwanda. Gemini reads both languages, and the agent sees their own words.

## Phase 3, batch E (reports and performance)

### D63. Reports are counted from what the app already records
- **Decision:** no separate statistics tables. Each report is computed when asked, from the cases, routings, prescriptions and the audit log (D46), so a report can never disagree with what happened. Every role gets the same layout: headline numbers, then the tables behind them, with one screen and one CSV download for all.
- **Periods:** one day, one week (Monday to Sunday) or one calendar month, in Rwanda time, with ‹ › to move between periods. The next period is disabled when it's still in the future.
- **"Nothing to measure" is not zero:** a period with no rated cases shows a dash, not "0 / 5". An average of nothing would mislead.
- **Speed:** a month at 1,000 requests a day (30,000) takes about 0.16 s to compute (D65), so nothing needs to be cached.
- **Downloads are logged:** the agent performance table names staff.
- **Layout follows the dataviz guidance:** headline numbers as stat tiles (sentence-case label, value in proportional figures, no colour for its own sake), and tables with aligned digits. There are no charts: no question here needs one, and a table is readable by everyone, including screen readers.

### D64. Performance is measured at the SRS's scale, and the network is modelled openly
- **Server:** `scale.test.ts` builds 50 facilities, 100 staff and 30,000 requests, then makes 200 requests of each common action with 20 people at once. It fails if a 95th percentile reaches 3 seconds.
- **Network:** a 3G line can't be simulated faithfully on one computer. The time is therefore calculated from WebPageTest's published 3G profile and the measured sizes and server times, with the formula written in `docs/PERFORMANCE.md`. A check on a real phone over 3G is left to phase 4 and is stated as such.
- **First visit:** at about 3 seconds on 3G, it's at the limit. Most of that is round trips, which only a server closer to Rwanda removes (a phase 4 deployment choice). The service worker makes repeat visits about 1.5 s.

### D65. Bed counts for all facilities in one go
- **Found by measuring:** the list of facilities an agent routes to counted beds with 2 queries per facility. At 50 facilities its 95th percentile was 208 ms.
- **Decision:** two grouped queries for all facilities. It's now 55 ms, under the same rule as `setup/beds.ts` (free = total − occupied − reserved).

## Phase 4 (deployment, GitHub, README and the video plan)

### D66. A demo inbox for the made-up staff accounts
- **Problem:** staff log in with a password and a 6-digit emailed code (FR 2). Graders can't read email sent to `agent@ubuzima.test`, so without help they could never log in as staff on the live site.
- **Decision:** the page `/demo/inbox` shows the last 20 emails sent to `@ubuzima.test` addresses only. It's on in production only when `DEMO_INBOX=1`; otherwise it answers 404. Emails to `@ubuzima.test` are never handed to Resend, so nothing is sent to a domain nobody owns. Real staff addresses go through Resend and never appear on the page.
- **On the code screen:** a demo account is told "This is a demo account" with a link to the inbox, so a grader isn't left waiting for an email.
- **Trade-off:** anyone can log in as a demo staff member. That's the point of a demo; the accounts only see synthetic patients (README, Known limitations).

### D67. How the code reaches Azure, and the two proxies in front of the API
- **Plan:** as agreed before phase 4: Vercel for the web app, one Azure App Service B1 plan in Central India for the API and the mock NIDA, Supabase in Mumbai next to it, Resend for email, DNS at get.tech ([`docs/DEPLOY.md`](../DEPLOY.md)).
- **Packaging:** `scripts/azure-package.sh` builds each app and uses `pnpm deploy --prod` to copy only its runtime packages into `.deploy/<app>`, then zips it. Azure runs `node dist/main.js` and builds nothing (`SCM_DO_BUILD_DURING_DEPLOYMENT=false`), so what was tested locally is what runs. Optional peers (the Prisma CLI and Studio) are left out: 43 MB instead of 399 MB.
- **Two proxies:** a patient's request passes through Vercel and then Azure's front end. The guessing pauses and rate limits count per address, so the API must read the patient's address, not a proxy's. `TRUST_PROXY_HOPS` (1 by default, 2 in production) tells Express how many proxies to skip.
- **The generated Prisma client** isn't committed; `pnpm install` generates it.
- **Found on the first upload:** Azure's Node startup script moves a top-level `node_modules` to `/node_modules`. CommonJS finds it there through `NODE_PATH`; our ES modules don't, and the app crashed with "Cannot find package 'reflect-metadata'". Each zip therefore holds the app in `app/` (started with `node app/dist/main.js`), with pnpm's flat layout so no symlinks are lost.
- **Found on the first login:** Azure's front end writes the caller into X-Forwarded-For as "address:port". Express took the whole string as the address, so the mock NIDA refused the API, and every connection would have counted as a new visitor for the guessing pauses. Both apps now drop the port before Express reads the header (`forwarded.ts`, tested in `forwarded.test.ts`). Proved live: the same call to the mock NIDA went from 403 to 200 once the fix was uploaded.
- **Found on Vercel:** Turborepo's strict mode hides environment variables a task doesn't declare (except `NEXT_PUBLIC_*`). The web build never saw `API_URL`, fell back to `http://localhost:4000`, and Vercel refused the rewrite with DNS_HOSTNAME_RESOLVED_PRIVATE. `turbo.json` now declares `API_URL` and `NEXT_PUBLIC_API_URL` for the build.
- **The API's certificate** is a Let's Encrypt certificate uploaded to Azure (valid to 23 Jan 2027), because Azure's free managed certificate never completed for `api.ubuzima.wilsonn.tech`, twice. Renewal: request a new one with a DNS TXT record (`lego --dns manual`), then upload it.
- **The mock NIDA is at `nida.ubuzima.wilsonn.tech`** (25 Oct), as in the SRS deployment diagram: a CNAME and an `asuid` TXT record at get.tech, and a Let's Encrypt certificate (valid to 23 Jan 2027) uploaded to Azure, the same way as the API's. get.tech took about 2 hours 40 minutes to publish the challenge record. The API's `NIDA_URL` points there; the IP allowlist and the API key still decide who may call it.


### D68. Logos as vectors, three placements
- **Decision:** the logos come from the UbuzimaConnect Logo Pack's `.ai` files, converted to SVG with `pdftocairo -svg` and cropped to the artwork (the pack's PNGs carry a wide empty border, which made the old header logo about 13 px tall). They live in `apps/web/public/brand/`, and `components/app/logo.tsx` places them by height.
- **Where each one goes** (revised after Wilson's review: one line, centred, and no symbol repeated inside the app):
  - **Horizontal with the tagline** ("Your Health, On Time"), centred: the welcome page, the patient login and the staff login, where the brand is seen first.
  - **The name alone (wordmark), 22 px tall:** headers inside the app (patient pages on a computer, the staff sidebar, the prescription check). The symbol beside it would only repeat the brand.
  - **The symbol alone, under 640 px:** headers that share a phone-width row with Log out or the language switch. The name would push the button off a 375 px screen.
  - **Black wordmark:** printed pages, including the printable summary (FR 7.2).
- **The icons** (favicon, Apple touch, PWA 192 and 512, maskable) were already the pack's own files, byte for byte.

### D69. The live demo stays staffed
- **Found by the live tests (25 Oct):** the seed filled only the week it ran in, with one clinician per specialty working either every day shift or every night shift. In the day no paediatrician was on duty anywhere, so a child could not be routed, and from Monday 26 October nobody was on duty at all: routing would have found no facility for anyone.
- **Decision:** `scripts/demo-schedule.mjs` does, through the app's own API, what the managers and the administrator would do. Kacyiru's manager invites a partner for each specialty (6 clinicians), so every specialty there is covered day and night; the administrator creates a manager for Remera Health Centre; each manager fills 12 weeks of shifts, and the administrator the two agents'. It is safe to run again and only adds what is missing.
- **Why through the API, not the seed:** it needs no database password, it leaves the same trail in the activity log as a real manager would, and it proves FR 2.6, 8.2 and 8.4 work on the live site.
- **Gaps kept on purpose:** Kibagabaga has no emergency clinician at night and Remera no one at night, so the coverage view and the shift-gap report still show real gaps.
- **Before mid-January 2027** run it again (`node scripts/demo-schedule.mjs 12`), or the schedule runs out (after the 26 Oct reset it runs to 17 Jan 2027).

### D70. Live events cross API instances through Postgres (NFR 5)
- **Decision:** `EventsService` delivers each event to the browsers connected to its own instance at once, and also sends it with `pg_notify('uc_live', …)`. Every instance keeps one connection that `LISTEN`s on that channel and passes the other instances' events to its own browsers. Its own events are skipped by an instance id, so nothing arrives twice.
- **Why Postgres:** the database is already shared by every instance, so this adds no new service (no Redis), and Supabase's session pooler supports LISTEN.
- **Push notifications** are sent only by the instance where the event started, so a phone is never notified twice. The "app is open" check is per instance: a patient whose app is open on another instance may still get a push, which carries no medical details anyway.
- **Large messages:** NOTIFY refuses payloads of 8000 bytes or more. A longer chat message reaches the other instances as "case changed", and their browsers reload the case.
- **Already safe before this:** the dispatcher and the timers each run under a Postgres advisory lock, so only one instance offers cases or fires a timer at a time.
- **Proof:** `instances.test.ts` starts a second API instance on the same database: a message sent through one reaches a patient connected to the other within 3 seconds, and back.
- **Scaling out** is then only a setting: Azure App Service → Scale out → more instances, behind its built-in load balancer (NFR 5, SRS deployment diagram). The B1 plan allows up to 3.

### D71. The staff menu folds to its icons
- **Decision:** from 768 px a button at the top of the staff menu folds it from 240 px to 76 px: icons only (each with its name as a tooltip and for screen readers), the heart symbol instead of the name, the person's initials, and Log out as an icon. The choice is kept on the device (`localStorage`, with an in-memory fallback where storage is blocked); the server always renders it open. Phones keep the row at the top.
- **The slide:** the grid column animates over 500 ms with a springy ease (`cubic-bezier(0.34, 1.4, 0.64, 1)`), so the panel overshoots a little and settles; labels fade and slide away in 300 ms. Measured: 76 → 168 → 221 → 247 → 248 → 241 → 240 px. It is turned off for people who ask their device for reduced motion.
- **Why:** on a laptop the agent's case screen needs the width (Wilson's review, 25 Oct).

### D72. Tabs on the agent's case and the clinician's visit
- **Decision:** the agent's case screen keeps the patient card on top and splits the rest into tabs: **Case** (what the patient said, triage review), **Routing**, **Prescribe** and **History**, with counts. The clinician's visit uses **Why they came**, **Record**, **Prescribe** and **History**. The chat, the case actions, the bed and "End or hand over" stay in the right-hand column, always visible.
- **Why:** both screens had grown to six stacked cards, so the agent scrolled past the triage to reach routing while the patient waited (Wilson's review, 25 Oct).
- **Forms survive switching tabs:** the tab panels stay mounted and are only hidden, so a half-filled prescription or record entry is not lost.

### D73. The administrator can add made-up people to the mock NIDA
- **Decision:** an administrator-only page, **Mock NIDA** (`/staff/nida`), adds a person to the practice identity records: names (2 to 4, letters only), sex, date of birth, district, an optional phone, an optional parent, and an optional JPG or PNG photo under 1 MB. A person of 16 or more gets a new ID in the card's format (1 · year of birth · 7 or 8 · birth order · 1 · two check digits), unique in the records; a younger child gets no ID and must have a parent at least 12 years older, as FR 1.3 describes. They can log in at once.
- **Why:** so a facilitator can create their own patient during the presentation, instead of only using the six built-in people.
- **Storage:** the built-in people stay in code; added people live in a `nida` schema (`nida.person`) that the mock NIDA creates itself, reached through `NIDA_DATABASE_URL`. Without it, the mock NIDA works as before and refuses additions.
- **Security, in layers:** the same rules (`packages/shared/src/nida.ts`) run in the form, the API and the mock NIDA; the photo is checked by its first bytes, not its name, and served with its real type and `nosniff`; every query passes values as parameters, never joined into SQL; the mock NIDA still accepts calls only from the API's addresses with its key; the route is for administrators only and every addition is logged (`nida.person.added`). Tests try SQL in the names and the parent, a disguised SVG photo and a child without a parent, and check the table is intact (`nida-admin.test.ts`).
- **Limit:** only this route accepts a 2 MB body, for the photo; the rest of the API keeps the 100 kB default.

### D74. Voice notes in the chat
- **Decision:** patients and agents can send voice notes of up to one minute. When the message box is empty the send button becomes a microphone; recording shows a red dot, the time out of 1:00, cancel and send, and stops by itself at a minute. Notes play in the chat with the browser's own player, also on closed cases. Recording uses the browser's recorder (WebM/Opus, or MP4 on Safari) at 32 kbit/s, about 240 kB a minute.
- **Why:** people who can't read or type well can explain in their own voice (NFR 7), without needing a phone call on a shared phone.
- **Storage and access:** the sound is kept in its own table (`ChatAudio`), so loading a chat never loads audio; the message keeps its length (`audioMs`). Only WebM, Ogg, MP4 or MP3 audio is accepted, checked by the file's first bytes, and served with its real type and `nosniff`. A note can be played only through the same checks as the chat: the patient (or parent) on their own case, or the agent while handling it. The AI never receives voice notes: triage reads only the written description.
- **Limit:** the voice routes alone accept a 2 MB body. If the microphone is refused, the chat says how to allow it.

### D75. A clean demo before submission
- **Decision:** on 26 October the live database was emptied (every table except the migration history, and the people added to the mock NIDA) and filled again with the seed and `scripts/demo-schedule.mjs`. The test runs had left dozens of cases, prescriptions, alerts, ratings and test accounts that showed in the reports.
- **The activity log:** it is append-only row by row (NFR 9); emptying the whole table is the deliberate exception for starting an environment afresh, as for the test database. The new log begins with one entry, `demo.reset`, saying so.
- **Afterwards:** only read-only checks were run, so graders see the demo as a new deployment. The full live check (`scripts/live-check.mjs`) creates cases and test accounts; run it again only if the demo is reset once more.
