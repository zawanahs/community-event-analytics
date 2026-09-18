# Publish a reusable repository

## Important: start with clean history

A deleted file remains available in earlier Git commits. Before publishing a generalized project, do not expose a development history that contained participant data, private exports, or organization-specific review artifacts.

The safest options are:

1. Create a new repository from a clean snapshot of the reviewed working tree; or
2. Mark a reviewed, history-safe repository as a GitHub template and ask adopters to choose **Use this template**.

Do not ask adopters to fork a repository whose earlier history contained material that should not be public. Rewriting published Git history is disruptive and should be handled as a separate, explicitly approved operation.

## Repository setup

After pushing the clean snapshot:

1. In **Settings → General**, enable **Template repository**.
2. Replace the placeholder security advisory URL in `.github/ISSUE_TEMPLATE/config.yml` with the final owner and repository name.
3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. In **Settings → Actions → General**, keep workflow permissions read-only unless a workflow explicitly needs more.
5. Enable private vulnerability reporting and dependency alerts where available.
6. Add the repository description, topics, and a social preview that contain no adopter-specific data.

## Deployment variables

The Pages workflow reads optional repository variables with the same names as `.env.example`. With no variables, the public site uses the bundled synthetic community.

For a real Google Sheets deployment, set `VITE_DATA_SOURCE`, `VITE_GOOGLE_SHEET_ID`, the community identity, and an honest footer through **Settings → Secrets and variables → Actions → Variables**. The sheet ID is delivered to visitors as part of the built frontend; it is configuration, not a secret. The sheet itself must be safe for public browser access.

## Release check

- Confirm `npm ci`, `npm test`, and `npm run build` pass from a clean checkout.
- Search the entire snapshot for old organization names, spreadsheet IDs, private URLs, and attendee totals.
- Inspect both dashboard tabs using the synthetic default.
- Confirm the LICENSE, contribution guide, security policy, and issue templates are appropriate for the new owner.
- Generate a repository from the template and verify that the generated repository has only the intended clean starting history.
