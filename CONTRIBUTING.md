# Contributing

Thank you for looking. Issues and pull requests are welcome.

- **What lives where.** `plugin/` is the product, and the only folder users receive. `gui/` is the dashboard's source,
  built into `plugin/dist/` (committed). `site/` is the landing page and documentation. `tests/` and `e2e/` are the checks.
  Read [`AGENTS.md`](AGENTS.md) first: it is the rules file for people and agents, and says which commands to run.
- **Run the checks.** `bun install`, then `bun test` and `bun run typecheck` (the gate). After a change to the dashboard also run
  `bun run e2e` and `bun run smoke`; after a change to `site/` run `bun run site`. The last three need Chrome.
- **Keep it small.** The least code that works, no new dependency for what a few lines do, and tests for anything non-trivial.
- **Documentation.** The pages in `site/docs/` are built from `plugin/README.md` and `plugin/docs/RUNBOOK.md`: edit those
  and run `bun site/build-docs.ts`.
- **Never** put a secret in a file or a test. Tests use made-up keys.
