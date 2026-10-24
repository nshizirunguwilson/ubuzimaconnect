# UbuzimaConnect: Design Rules (Stage 2)

Status: Draft for approval
Built from: [`RESEARCH.md`](./RESEARCH.md). References are cited as R1–R5 and sections 2.x of that file.

Every screen must pass the checklist in section 12 before it is shown.

---

## 1. Principles

1. **Meaning first.** Every element answers "what does this user need to decide or do here?" If it answers nothing, remove it. (RESEARCH §4)
2. **One primary action per screen.** It is the only blue button. (R4, R5)
3. **Calm by default, loud only for danger.** Red appears only for urgent or emergency meaning. (NHS, §2.2)
4. **One thing per page for patients.** One question per screen in the case flow; grouping only where it clearly helps. (GOV.UK, §2.1)
5. **Built for the backlog for staff.** Queues and tables show only what decides the next action, readable at a glance with 20+ rows. (Front and Linear, §2.3; R2, R3)

---

## 2. Colour: 60-30-10

| Share | Role | Tokens |
|---|---|---|
| **60%** | Surfaces | `bg` gray-50 `#F1F5F8` (page) · `surface` white `#FFFFFF` (cards, inputs) · `sunken` gray-100 `#E3E9EE` (hover rows, wells) |
| **30%** | Text and structure | `text` gray-900 `#1C2B33` · `text-secondary` gray-600 `#47555F` · `text-muted` gray-500 `#5E6E7B` · `border` gray-200 `#CAD4DC` (decorative only) · `border-strong` gray-400 `#7E8E9B` (inputs, 3.4:1) |
| **10%** | Brand accent | `primary` blue-600 `#006FD6` (buttons, white text 4.95:1) · `primary-hover` blue-700 `#005FB8` · `primary-pressed` blue-800 `#004A8F` · `link` blue-700 `#005FB8` (6.3:1) · `accent-soft` blue-50 `#EAF4FF` (selected rows, the one highlighted card) · `brand` blue-500 `#0082FB` (logo and large graphics only, never body text) |

**The 10% rule, applied per screen.** Blue appears only on:
- the single primary button
- the active navigation item
- **at most one** highlighted card (e.g. the patient's current case)
- links

### Status colours (never colour alone: always icon + label)

| Status | Strong (text, icon, fill) | Tint (background) | Pairs checked |
|---|---|---|---|
| Urgent / error / emergency | red-600 `#C8202F` | red-50 `#FDECEE` | white on red 5.67 · red-700 `#A81A27` on tint 6.48 |
| Warning / Uncertain | amber-400 `#F2A900` (fill, **Jet text only**) · amber-700 `#8A5200` (text) | amber-50 `#FFF4DC` | Jet on amber 7.24 · amber-700 on tint 5.85 |
| Success / Minor | green-600 `#1A7F4B` | green-50 `#E8F6EE` | white on green 5.02 · green-700 `#146B3E` on tint 5.89 |
| Info | blue-700 `#005FB8` | blue-50 `#EAF4FF` | 6.31 |

### Triage levels (SRS FR 4.4)

| Level | Icon (Lucide) | Colour | Label |
|---|---|---|---|
| Urgent | `LuTriangleAlert` | Urgent red | "Urgent" |
| Uncertain | `LuCircleHelp` | Warning amber | "Uncertain" |
| Minor | `LuCircleCheck` | Success green | "Minor" |

### Other tokens
- **Focus ring:** a 2 px blue-500 ring with a 2 px white gap, on every interactive element (WCAG 2.4.7).
- **Disabled:** gray-100 fill and gray-400 text. This is exempt from contrast rules, but must still look disabled.
- **Overlay (behind dialogs):** gray-900 at 50%.
- **Theme:** light mode only for v1. The tokens are named by role, so a dark theme can be added later without touching components.

---

## 3. Typography

Headings use **Outfit**; everything else uses **Google Sans Flex** (optical size on); codes and IDs use **Google Sans Code**.

| Style | Font | Size / line height | Weight | Use |
|---|---|---|---|---|
| Display | Outfit | 32 / 40 | 600 | Emergency screen headline only |
| H1 | Outfit | 24 / 32 | 600 | Page title (one per page) |
| H2 | Outfit | 20 / 28 | 600 | Section title |
| H3 | Outfit | 16 / 24 | 600 | Card title |
| Body | Google Sans Flex | 16 / 24 | 400 | Default text; **inputs are 16 px** so iPhones don't zoom in |
| Body small | Google Sans Flex | 14 / 20 | 400 | Table cells, helper text |
| Label | Google Sans Flex | 14 / 20 | 500 | Form labels, buttons, tabs |
| Caption | Google Sans Flex | 12 / 16 | 500 | Timestamps, counts. **12 px is the minimum anywhere** |
| Code | Google Sans Code | 14 / 20 (16 / 24 when typed) | 500 | Prescription codes, national IDs, email codes |

- Sentence case everywhere (not Title Case, not ALL CAPS).
- Lines of reading text are at most 70 characters wide.
- Numbers in tables and timers use tabular figures (`font-variant-numeric: tabular-nums`).

---

## 4. Spacing and layout

- **A 4 pt grid.** The spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- **Mobile (patient PWA):** 16 px side padding, single column, primary action pinned at the bottom of the screen.
- **Desktop (staff app):** a 240 px left navigation (R2) as an inset `xl` squircle panel, 12 px from every edge (DECISIONS.md D18), and content up to 1200 px wide; tables use the full width.
- **Touch targets:** at least **44 × 44 px**; primary buttons are **48 px** tall on mobile and 40 px on desktop.
- Space separates groups first; dividers come second; boxes come last.

---

## 5. Shape: squircles

- **Every rounded shape is a squircle**, except fully round elements (avatars, status dots), which are true circles.
- **Radius scale:**

| Token | Radius | Used for |
|---|---|---|
| sm | 8 | Badges, chips, small icon buttons |
| md | 12 | Inputs, buttons, list rows |
| lg | 16 | Cards |
| xl | 24 | Dialogs, bottom sheets |

- **Technique (RESEARCH §2.4):**
  - Native `corner-shape: squircle` where the browser supports it (Chrome and Edge 139+).
  - Everywhere else (Safari, Firefox), a generated smooth-corner path through one shared `Squircle` primitive.
  - The two must look the same. A squircle at the same radius looks smaller than a round corner, so the native radius is scaled and calibrated side by side in Stage 2.
- **No other corner style anywhere.** Components never set `border-radius` directly; they go through the primitive or its utility class.

---

## 6. Elevation

- **Flat by default.** Structure comes from surface colour and 1 px borders, not shadows.
- **One shadow level, for overlays only** (dialogs, popovers, toasts, the pinned bottom bar): `0 8px 24px rgb(28 43 51 / 0.12)`.

---

## 7. Icons

- **Lucide through `react-icons/lu`, only this family.**
- Sizes 16 (inline), 20 (buttons, rows), 24 (navigation, empty states). The stroke is Lucide's default; never mix weights.
- Colour is `currentColor`, so it follows the text it sits with.
- **No icon without a label**, except universal controls (close, back, more), which get an `aria-label`.

---

## 8. Motion

- 150 ms ease-out for hover and press; 200 ms for overlays entering and leaving.
- Nothing moves for decoration. With `prefers-reduced-motion`, transitions are off.
- New chat messages and queue updates are announced to screen readers (`aria-live`), not animated.

---

## 9. Components (the only building blocks)

| Component | Rules |
|---|---|
| **Button** | Variants: primary (blue, **one per screen**), secondary (white, strong border, Jet text), ghost (text only), danger (red, destructive actions only). Label is a verb ("Submit case", not "OK"). |
| **Input / Select / Textarea** | A label always above (never placeholder-only); helper text below; an error state with icon + message in red-700. |
| **Choice row** | A full-width row with an icon, a label and an optional one-line explanation; the selected row is tinted. Used for red-flag answers and triage confirmation (R1). |
| **Checkbox / Radio** | 20 px controls inside a 44 px target. |
| **Card** | Surface, 1 px border, lg squircle, 16–24 padding. The "highlighted" variant uses accent-soft, **at most one per screen**. |
| **Status badge** | Icon + label + tint (section 2). Never colour-only. |
| **Tabs with counts** | e.g. "Urgent 3" (R2). The active tab is underlined in blue. |
| **Queue row / table row** | Primary text, one status badge, time on the right (R2, R3). Hover = sunken. The whole row is clickable. |
| **Step progress** | Segmented bar with "Step 2 of 5" text (R1). |
| **Code display** | Google Sans Code, grouped characters (`RX-7K3M-9P2Q`), a copy button with a "Copied" confirmation. |
| **Dialog / bottom sheet** | xl squircle with the overlay; one clear title; a primary and a secondary action. |
| **Toast** | Short past-tense message ("Case submitted"); errors stay until dismissed. |
| **Empty state** | One icon + one sentence + at most one action. No illustrations. |
| **Notice** | A page-level message: icon + short title + one sentence + tint (DECISIONS.md D10). Field errors stay under their field. |

---

## 10. Content

- Plain language; one idea per sentence; helper text is at most one sentence.
- **Kinyarwanda is often longer than English**, so no fixed-width text containers; layouts must wrap.
- Times: relative for recent ("Waiting 2 min"), with the exact time available; dates as "24 Oct 2026".
- **AI output is never shown as a percentage or score.** It appears as "Suggested by AI · reviewed by an agent", with the reason in plain words (FR 4.9).
- Errors say what happened and what to do next: "That ID doesn't match. Check the date of birth and try again."

---

## 11. Accessibility (minimum)

- WCAG 2.2 AA contrast (we aim for AAA on body text); colour never carries meaning alone.
- A visible focus ring on everything interactive; the whole app is usable by keyboard.
- 44 px targets; labelled inputs; `aria-live` for chat and the queue.
- Respect text zoom up to 200% without breaking layouts.

---

## 12. Screen checklist (run before showing any screen)

- [ ] One H1, one primary (blue) button, at most one highlighted card
- [ ] Blue covers roughly 10% or less of the screen; red only for urgent meaning
- [ ] Every rounded shape is a squircle (except true circles)
- [ ] Every status has an icon and a label
- [ ] Every element maps to a use case or FR; nothing decorative
- [ ] Contrast measured (automated check), focus visible, targets ≥ 44 px
- [ ] Checked at 375 px (phone) and 1280 px (desktop)

## 13. Decision log

Notable choices and their reasons are recorded in `DECISIONS.md` as they happen.
