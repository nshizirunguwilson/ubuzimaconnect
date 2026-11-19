# Kinyarwanda review

`kinyarwanda-review.csv` lists every text a patient or a pharmacy sees: the English, the Kinyarwanda draft, and an empty **Correction** column. Open it in Excel, Google Sheets or Numbers.

The texts were written by the developer and reviewed on 19 Nov 2026. To check them again, look at each line for meaning, tone and spelling.

- **Danger-sign questions** (Area "red flag") are the most important: a patient's safety depends on understanding them. Please check them with a clinician as well.
- **Example rows:** sentences with a name or a number in them show one example (a name such as Kevin, a number such as 3, or a date). The real name or number changes.
- **Where corrections go:**
  - `apps/web/src/i18n/rw.ts` for screen texts;
  - `apps/web/src/i18n/sentences.ts` for rows with Area "server";
  - the administrator's **Red-flag list** screen for the danger signs, or `apps/api/src/seed.ts` for new installs.
- **Make the sheet again** after corrections:

```bash
pnpm translations
```
