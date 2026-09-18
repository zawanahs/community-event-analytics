# Contributing

Thanks for helping make Community Event Analytics useful to more communities.

## Before opening a change

1. Create a focused branch from `main`.
2. Install dependencies with `npm ci`.
3. Keep synthetic data as the default and do not commit participant data, credentials, private spreadsheet identifiers, or direct personal identifiers.
4. Update the data contract or configuration guide when a change affects schema, metric definitions, privacy behavior, or adopter setup.

## Validate the change

Run:

```bash
npm test
npm run scan:generic
npm run typecheck
npm run build
```

For interface changes, also inspect both dashboard tabs, test at least one filter, and check narrow-screen behavior.

## Pull requests

Describe the user problem, the approach, the checks performed, and any data-contract or privacy implications. Keep unrelated changes in separate pull requests.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
