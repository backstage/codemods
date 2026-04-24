# AGENTS.md

This repo's contributor conventions and release flow live in [`CONTRIBUTING.md`](./CONTRIBUTING.md). **Read it end-to-end before opening a PR.** Everything an agent needs to know is in there — this file just makes sure you don't miss it.

The two failure modes most likely to bite an agent here are:

- **Forgetting `yarn changeset`.** The PR will merge fine, but nothing publishes. CI does not block missing changesets — you must self-enforce. See _Adding a changeset_ in `CONTRIBUTING.md`.
- **Hand-editing versions in `package.json` or `codemod.yaml`.** Don't. The Changesets bot owns version bumps. See _Release workflow_ in `CONTRIBUTING.md`.

Before declaring a task done, check `CONTRIBUTING.md` for the conventions in _Adding a new codemod_ (directory layout, package scope, single-quoted YAML) and run the checks listed in _Making changes_.
