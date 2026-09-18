# Prepare community data

Start with the bundled synthetic data. Keep it as the default while preparing a separate, access-controlled source for a real deployment.

## 1. Minimise the source

Export only the fields required by the canonical contract in [data-contract-v1.md](data-contract-v1.md). Do not include names, email addresses, phone numbers, free-form identifiers, raw platform IDs, or fields that can be joined back to people.

Use a stable, non-reversible participant key only where the contract requires participant-level deduplication. Keep the mapping to any real identity outside this repository and outside a browser-accessible source.

## 2. Map and validate

The five datasets are `events`, `survey_responses`, `feedback_answers`, `registrations`, and `participants`. Their required fields, joins, allowed nulls, and grains are defined by the contract.

If an existing source uses different column names, configure aliases in `src/config.ts`. If it needs a transformation such as a join, row expansion, or calculation, create a dedicated adapter in `src/data/adapters/`; do not hide that transformation in a spreadsheet formula without documenting it.

Run the dashboard with the proposed source and resolve contract errors before deployment. The app rejects orphaned records, duplicate identifiers, inconsistent returning status, and malformed values rather than silently changing the reported population.

## 3. Review disclosure risk

Set `privacy.minimumSegmentSize` before publishing. The application hides small segments, feedback, and comparisons that could reveal a suppressed group through subtraction. This is a safeguard, not a substitute for consent, policy, or legal review.

Review every available filter and drill-down using a small selection. Confirm no free-text response, tooltip, total, or derived percentage reveals a group below the threshold.

## 4. Choose a delivery path

The included Google Sheets adapter reads a public CSV endpoint in the visitor's browser. Use it only when the sheet is deliberately suitable for public access. The sheet ID is deployment configuration, not a secret.

For private data, create an adapter and deployment architecture that keeps source access off the public client. Do not add credentials to Vite environment variables, browser bundles, Git history, issue reports, or pull requests.

## 5. Release review

Before publishing, run:

```bash
npm run scan:generic
npm test
npm run typecheck
npm run build
```

Then inspect both dashboard tabs with the intended source classification and verify that the footer accurately explains the data in use.
