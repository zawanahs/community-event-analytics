# Adopting-community workflow

This workflow is designed for a community that wants its own public dashboard repository while keeping this template neutral and history-safe.

## Create the community repository

1. Start from a reviewed clean snapshot of this repository, or choose **Use this template** once the source repository is marked as a GitHub template.
2. Create a new repository under the adopting community's GitHub organisation. Do not fork an older repository history that contained private exports, attendee data, branding assets, or planning artefacts.
3. Replace the placeholder security-advisory link in `.github/ISSUE_TEMPLATE/config.yml` with the new owner and repository name.
4. Set the new repository description, topics, and social preview using only generic or community-approved material.

## Configure and validate

1. Keep the synthetic source enabled while configuring the community name, terminology, colours, segment labels, feedback mappings, and privacy threshold.
2. Follow [configuration.md](configuration.md) and [data-preparation.md](data-preparation.md) before connecting a real source.
3. Run `npm run scan:generic`, `npm test`, `npm run typecheck`, and `npm run build`.
4. Review the dashboard at wide and narrow widths, including a small filtered selection to confirm privacy suppression.

## Publish

1. Enable GitHub Pages with **GitHub Actions** as the source if a public static dashboard is appropriate.
2. Configure only public-safe build variables. The default synthetic deployment is safest until the source is reviewed.
3. Enable GitHub's template-repository setting on the clean source repository, not on a repository with sensitive historical commits.

The complete source-template setup and release checks are in [publishing.md](publishing.md).
