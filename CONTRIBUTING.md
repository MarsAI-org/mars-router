# Contributing to Mars Router

Thanks for taking the time to contribute! This document explains how to get a
development environment running, the conventions the project follows, and how
to submit changes.

## Getting started

Requirements:

- **Node.js 20+** (the installer and CI target Node 20 and 22)
- **git**
- Optional: **Docker** (for the container workflow), **Bun** (alternative runner)

```bash
git clone https://github.com/MarsAI-org/mars-router.git
cd mars-router
cp .env.example .env
npm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

The dashboard is then at `http://localhost:20128/dashboard` and the
OpenAI-compatible API at `http://localhost:20128/v1`.

## Project layout

| Path | What it is |
| --- | --- |
| `src/` | Next.js app + dashboard/compat APIs |
| `open-sse/` | Provider-agnostic routing/translation engine |
| `cli/` | The `mars-router` launcher package (separate npm package) |
| `tests/` | Vitest suite (independent package) |
| `docs/` | Architecture and design notes |

Read `docs/ARCHITECTURE.md` and `open-sse/AGENTS.md` before touching those areas.

## Running tests

Root dependencies must be installed first (the tests import from `src/`):

```bash
npm install                 # root deps
cd tests && npm install     # tests' own deps (vitest)
npx vitest run              # all tests
npx vitest run unit/<file>.test.js   # a single file
```

> The suite is not expected to be 100% green on a clean checkout — a small set
> of known pre-existing failures is catalogued in
> `tests/__baseline__/known-fails.txt`. Judge regressions with
> `node tests/__baseline__/verify-no-regression.mjs <results.json>` rather than a
> raw pass/fail count.

## Conventions

- **Plain JavaScript (ESM)**, no TypeScript. The `@/*` path alias resolves to `src/*`.
- **Conventional Commits** (`feat:`, `fix(translator):`, `docs:`, …).
- Keep changes small and focused; add a test for new behaviour.
- Never hand-edit generated catalog files under `packages/*` — regenerate them.
- Log user-facing changes in `CHANGELOG.md` and bump the version where relevant
  (root `package.json` and `cli/package.json` version independently).

## Security

Security is the top priority. When proposing changes, call out any impact on
authentication, credential/token storage, header handling, or SSRF. Do not
commit secrets. Report vulnerabilities privately rather than in a public issue.

## Submitting a pull request

1. Fork the repository and create a branch from `master`.
2. Make your change, run `npx eslint .` and the relevant tests.
3. Open a pull request describing the change, the motivation, and the testing
   you performed.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
