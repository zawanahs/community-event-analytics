# Configure a community

The repository ships with a neutral identity and synthetic data. Most adopters can create their version in three layers.

## 1. Set identity and colors

Copy `.env.example` to `.env.local`. The `VITE_COMMUNITY_*`, `VITE_DASHBOARD_*`, and `VITE_COLOR_*` variables control the header, page title, footer, and core palette. Do not commit `.env.local`.

Keep the footer honest about the active source. If a deployment uses real data, replace the synthetic-demo footer with an accurate classification such as “anonymized reporting data”.

## 2. Configure labels and dimensions

Edit `src/config.ts` for settings that are better reviewed in version control:

- `navigation`: names of the two dashboard views.
- `terminology`: participant, registration, and event terms used in dashboard copy.
- `feedbackRoles`: displayed survey-question labels and the source values mapped to each canonical role.
- `segments`: displayed labels, canonical registration fields, category order, and missing-value labels.
- `privacy`: team organizations to exclude and the minimum segment size.

The current dashboard has five participant segment slots: experience, gender, job family, sector, and organization. Their labels and values are configurable, but introducing a sixth analytical slot requires a code change.

## 3. Connect Google Sheets

Set `VITE_DATA_SOURCE=google-sheets`, provide `VITE_GOOGLE_SHEET_ID`, and publish only data suitable for browser access. The default tab names follow the canonical datasets; override any tab with its corresponding `VITE_GOOGLE_TAB_*` variable.

Source columns should use the canonical names in `docs/data-contract-v1.md`. If an existing sheet uses different names, add them under `data.fieldAliases` in `src/config.ts`:

```ts
fieldAliases: {
  events: {
    event_name: ['title', 'session_name'],
  },
  registrations: {
    participant_id: ['anonymous_member_id'],
  },
  // Keep the other dataset entries.
}
```

Canonical names always take precedence over aliases. Use a dedicated adapter under `src/data/adapters/` when the source needs row expansion, joins, or other structural transformations.

## Pre-publication checklist

- Run `npm test` and `npm run build`.
- Confirm the header, browser title, source label, and footer identify the intended community and data classification.
- Check that filtered views hide sub-threshold segments, feedback, and parent totals that could disclose a hidden remainder.
- Confirm the spreadsheet contains no names, email addresses, phone numbers, or reversible identifiers.
- Verify the synthetic dataset remains the default when source variables are absent.
