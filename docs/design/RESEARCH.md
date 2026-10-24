# UbuzimaConnect: Design Research (Stage 1)

Date: 24 October 2026
Status: Draft for approval

This document records where every design decision comes from. Each reference says what we take from it, where it applies in UbuzimaConnect, and what we deliberately leave behind. Stage 2 (`DESIGN.md`) turns these findings into rules.

> **Copyright note:** This repository will become public for the Final Project. We store **links and written notes only**, not copies of other designers' images.

---

## 1. Method

| Where | Search terms | Result |
|---|---|---|
| Dribbble | telemedicine app, healthcare dashboard minimal, triage app, hospital queue dashboard, clinic management dashboard, emergency medical app, prescription app, healthcare web app, doctor dashboard clean | About 70 shots reviewed. Most are showcase art; 3 adopted, several kept as anti-references |
| Behance | telemedicine app UX case study | 25 projects listed; 1 opened in full (CareLink); mostly student process slides with little UI reasoning |
| Pinterest | minimal healthcare app UI clean | 46 pins collected; 2 adopted |
| Published design systems | GOV.UK, NHS service manual, inbox and queue products | The strongest evidence, because these rules come from real public services and user research |

Selection test for every reference: *Would a worried patient on a cheap phone, or an agent with 20 waiting cases, be helped by this?*

---

## 2. Rules from published systems (highest weight)

### 2.1 GOV.UK: start with one thing per page
- GDS recommends splitting questions onto separate pages first, because **low-confidence users find it easier**, it suits **mobile**, and it handles **errors, branching and saving progress** better. Grouping is allowed when research supports it. [GDS design notes](https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/), [DWP accessibility manual](https://accessibility-manual.dwp.gov.uk/guidance-for-your-job-role/interaction-designer), [MoJ question pages](https://design-patterns.service.justice.gov.uk/archive/question-pages)
- **Applies to:** the patient flow (who is sick, location, red flags, symptoms, how long, how bad). Our users include people who cannot read or type well (SRS NFR 7), so this is the default.

### 2.2 NHS service manual: colour has a job, never decoration
- Colour helps users tell information apart; **red is reserved for urgent care**; contrast meets **WCAG 2.2 AA, aiming for AAA**; **meaning must never rely on colour alone**; not every palette pair passes (e.g. low-contrast borders). [NHS colour](https://service-manual.nhs.uk/design-system/styles/colour), [NHS service manual](https://service-manual.nhs.uk/), [NHS accessibility poster](https://service-manual.nhs.uk/assets/nhs-digital-design-accessibility-poster.pdf)
- **Applies to:** triage levels (Urgent, Uncertain, Minor), the emergency screen, alerts. Every status gets **icon + label + colour**. Our `#C8202F` red is used only for urgent or emergency meaning.

### 2.3 Inbox and queue products (Front, Linear): clarity over clutter, built for the backlog
- Front's rebuild: *"Clarity over clutter"*, collapsed metadata, strong defaults over endless toggles. [Front](https://front.com/blog/the-new-front-inbox)
- Queue design should hold up under a real backlog: density, grouping, clear emphasis, and few clicks per decision; keep context inside the queue. [SaaS inbox patterns](https://www.saasui.design/blog/saas-email-inbox-ux-patterns)
- Linear's redesign focused on hierarchy, balance and density, with better contrast in its inbox. [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui), [Linear changelog](https://linear.app/changelog/2024-03-20-new-linear-ui)
- **Applies to:** the agent queue, clinician incoming list, admin tables. Agents handle one case at a time with timers (FR 6), so the queue must show **only what decides the next action**.

### 2.4 Squircles in the browser
- `corner-shape: squircle` (a superellipse) has shipped in **Chrome and Edge 139+**, but **not yet in Safari or Firefox**. Use it inside `@supports`, with a fallback. [Smashing Magazine (2026)](https://www.smashingmagazine.com/2026/03/beyond-border-radius-css-corner-shape-property-ui/), [savvy.co.il](https://savvy.co.il/en/blog/css/css-corner-shape/), [ics.media](https://ics.media/en/entry/260226/), [squircle.js](https://squircle.js.org/blog/squircles-in-css)
- **Our decision (to confirm in Stage 2):** native `corner-shape: squircle` where supported (most Android phones, which run Chrome). Elsewhere (iPhone Safari), a generated smooth-corner path, so **every** rounded element is a squircle in every browser. Full circles (avatars, dots) stay circles.

---

## 3. Adopted references

### R1. RoadCheck: offline vehicle inspection and defect triage
- **Link:** <https://dribbble.com/shots/27802889-RoadCheck-Offline-Vehicle-Inspection-App-Fleet-Defect-Triage>
- **Why it fits:** an offline-first triage tool for non-expert users, the same problem shape as our red-flag checklist.
- **We take:**
  - **A checklist where each item is one row** with a single clear answer control. Applies to the red-flag questions (FR 3.6).
  - **A severity picker** (Low, Medium, Critical) where each option is a full-width row with an **icon, a label and a one-line explanation**, and the chosen one is lightly tinted. Applies to the agent's "Review and confirm triage" (FR 6.5).
  - **Segmented progress** at the top of the flow. Applies to the patient case steps.
  - **A summary screen listing only the flagged items.** Applies to the case summary before submit.
- **We leave:** the yellow-green gradient background and the glassy cards.

### R2. Upstream: AI email client (inbox)
- **Link:** <https://dribbble.com/shots/27768344-Upstream-AI-Email-Client-Landing-Page>
- **We take:**
  - **Tabs with counts** (e.g. "Needs reply 3"). Applies to the agent queue split by level: *Urgent · Uncertain · Minor* with waiting counts (FR 6.2).
  - **One status pill per row**, the name in bold, and the time on the right. Applies to queue rows: patient (anonymised until accepted), category, waiting time, level.
  - **A narrow left navigation with a few labelled items**, for the staff web app.
- **We leave:** the marketing hero, the floating notification bubbles, the grid background.

### R3. Avenra: clinical dashboard
- **Link:** <https://dribbble.com/shots/27719212-Avenra-AI-Neurology-Dashboard-SaaS>
- **We take:**
  - **A greeting with a purpose line**, e.g. "Here's what needs your attention today". Applies to the staff home: one sentence that states the number that matters (e.g. "3 incoming patients").
  - **A table with a status-pill column** (Critical, Normal, Review). Applies to the clinician's incoming patients (FR 7.4) and the admin lists.
- **We leave:** the **AI orb illustration**, the decorative "clinical reports" chart, and the oversized patient card. These are the "AI look" we reject (see 4).

### R4. Pinterest: health app with one highlighted card (Abuja, Nigeria context)
- **Link:** <https://www.pinterest.com/pin/957296464567873705/>
- **We take:**
  - **The 60-30-10 rule in practice:** neutral white and gray surfaces, dark text, and **exactly one blue card**, the most important item (the next appointment). Applies to the patient home: the **current case or routing** is the only blue card.
  - An African context with the location shown at the top. Applies to our location chip (Province, District).
- **We leave:** the decorative coloured specialty bubbles and the doctor photos as filler.

### R5. Pinterest: calm monochrome health home
- **Link:** <https://www.pinterest.com/pin/888546201542706614/>
- **We take:** generous white space, a light gray page with white cards, and **a single strong call to action**. Our main action is blue (blue-600 with white text, 4.95:1).
- **We leave:** the fitness content and the 3D dumbbell image.

---

## 4. Anti-references (what we avoid, and why)

| Pattern | Seen in | Why we reject it |
|---|---|---|
| Glowing gradients, floating stat cards, "AI probability 82%" | [PulsLine](https://dribbble.com/shots/27433195-PulsLine-AI-emergency-telemedicine-App) | Looks impressive but says nothing useful; a fake-precise number can frighten a patient. Our AI gives a suggestion that a human reviews (FR 4.9), so we never show it as a score. |
| 3D organs, skeletons, glossy dark phone mockups | [Roohi Koohi series](https://dribbble.com/shots/26380323-Health-care-application-mobile-ui-design), [Black Bulls](https://dribbble.com/shots/27124460-Health-care-application-mobile-ui-design) | Decoration that costs data on 3G and adds no meaning |
| AI "orb" or blob illustrations | [Avenra](https://dribbble.com/shots/27719212-Avenra-AI-Neurology-Dashboard-SaaS) (insights card) | The clearest sign of "AI slop"; it doesn't explain what the AI did |
| Generic people illustrations and process slides | [CareLink (Behance)](https://www.behance.net/gallery/231089713/CareLink-A-Telemedicine-App-for-Elderly-Patients) | Filler; no decision is supported |
| Many accent colours on one screen | Several Dribbble dashboards | Breaks 60-30-10; urgent states stop standing out |

---

## 5. Resulting direction (draft rules for Stage 2)

1. **60-30-10:** 60% Platinum `#F1F5F8` and white surfaces; 30% Jet Black `#1C2B33` text, lines and structure; 10% Azure Blue for the single primary action or the single most important item per screen. Red `#C8202F` only for urgent or emergency.
2. **One thing per page** in patient flows; grouped pages only for staff tools where speed matters.
3. **Queues built for decisions:** tabs with counts, one status pill per row, time waiting on the right, nothing else.
4. **Status = icon + label + tint**, never colour alone (NHS rule).
5. **Squircles for every rounded shape**, true circles only for fully round items.
6. **One icon family:** Lucide through `react-icons/lu`, one stroke weight, sizes 16/20/24. Lucide's rounded strokes match the rounded symbol and Nunito logo.
7. **No illustrations, no decorative charts, no filler numbers.** Empty states are one icon and one sentence.
8. **Type:** Outfit for headings, Google Sans Flex for everything else, Google Sans Code for codes and IDs.

## 6. Decisions needed from you
1. Approve the **direction** in section 5.
2. Approve **Lucide** as the single icon family (alternative: Phosphor, which has more weights but is less minimal).
3. Approve the **squircle approach** in 2.4 (native where supported, generated path elsewhere).
