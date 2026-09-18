# Community Event Analytics

Open-source event analytics dashboards for community organizers. The project helps a community understand:

- **Programme effectiveness:** which events, topics, and formats attract demand and receive strong participant feedback.
- **Community profile:** who participates, which groups return, and how outcomes vary across supported segments.

## Start your community version

Use this project as a GitHub template or copy a reviewed clean snapshot into a new repository. Avoid forking an older development history if it previously contained private data or organization-specific artifacts; deleting a file does not remove it from earlier commits.

1. Create the new repository.
2. Run the synthetic demo locally.
3. Configure identity and colors using `.env.local`.
4. Review segment labels, source aliases, and privacy settings in `src/config.ts`.
5. Keep synthetic data as the default until the real source has been reviewed.

The full publishing checklist is in [`docs/publishing.md`](docs/publishing.md).
For an adopting community, use the [adoption workflow](docs/adopting-community.md) rather than copying historical data or branding into this repository.

## Safe demo by default

A fresh clone loads deterministic synthetic data generated locally in the browser. The demo contains fictional events, participants, registrations, survey ratings, and comments. It does not contact any external data source.

The sample deliberately includes repeat participants, missing demographics, unknown attendance, small segments, and events without feedback so empty and incomplete states can be tested honestly.

```text
Bundled synthetic adapter
  → canonical normalization
  → contract validation
  → client-side metrics
  → dashboards
```

The source architecture lives under `src/data/`. `src/data.ts` is the stable dashboard-facing facade.

## Develop

```bash
npm install
npm run dev
npm test
npm run build
```

Stack: React, TypeScript, Vite, Apache ECharts, PapaParse, Sentiment, and Vitest. The application is fully static: no backend, database, API keys, or paid services are required for the synthetic demo.

## Optional Google Sheets source

Google Sheets remains available as an opt-in adapter. Copy `.env.example` to `.env.local`, then configure:

```dotenv
VITE_DATA_SOURCE=google-sheets
VITE_GOOGLE_SHEET_ID=replace_with_your_sheet_id
VITE_REPORTING_TIMEZONE=UTC
```

The configured spreadsheet uses these tabs by default:

- `events`
- `survey_responses`
- `feedback_answers`
- `registrations`
- `participants`

Each tab name can be overridden with the `VITE_GOOGLE_TAB_*` variables shown in `.env.example`. Canonical fields and accepted source-column aliases are configured in `src/config.ts`.

The current adapter reads the public CSV endpoint in the participant's browser. Do not place personal identifiers, secrets, or data that is unsuitable for public access in that spreadsheet.

## Data contract

The versioned canonical schema, dataset grains, joins, metric denominators, normalization rules, privacy behavior, and feature-degradation policy are defined in [`docs/data-contract-v1.md`](docs/data-contract-v1.md).

Source-specific column names are mapped into canonical fields before metrics or charts use them. Invalid keys, duplicate identities, orphaned joins, inconsistent returning status, and malformed values produce structured contract errors instead of silently changing the population.

See [data preparation](docs/data-preparation.md) for the safe path from a community's source data to a deployment.

## Configuration

Community identity and core colors can be set with environment variables. Navigation labels, terminology, feedback-question mappings, segment labels/order, source-column aliases, exclusions, and the minimum segment size live in `src/config.ts`.

See [`docs/configuration.md`](docs/configuration.md) for the adopter checklist and mapping examples.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes `dist/` to GitHub Pages. One-time repository setup: **Settings → Pages → Source: GitHub Actions**.

Environment variables used during the build determine whether the deployed site uses synthetic data or an explicitly configured Google Sheet. Synthetic remains the default when no variables are supplied.

## Contributing and license

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a change and [`SECURITY.md`](SECURITY.md) for private vulnerability and data-exposure reporting guidance.

The project is available under the [MIT License](LICENSE).
