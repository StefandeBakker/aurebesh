# Contributing to Aurebesh

Thanks for wanting to help. Aurebesh is a small, dependency-free WYSIWYG editor, and these notes keep contributions easy to review.

## Before you start

- **Open an issue first** for anything bigger than a small fix, so we can agree on the approach before you spend time on it.
- **One topic per pull request.** A feature or a fix on its own branch is easier to review and to release.
- Please be kind to each other: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setting up

```
npm install
npm run build
```

See the *Development* section of the [README](README.md) for the scripts, such as the demo page.

## Rules of the project

- **No runtime dependencies.** The package ships without any. Development dependencies are fine.
- **Tests for new behaviour.** Unit tests live in `test/` (Vitest), browser tests in `test/e2e/` (Playwright, run in Chromium, Firefox and WebKit).
- **Every interface text in all five languages** (`en`, `nl`, `de`, `fr`, `es`, in `src/locales/`). A test checks that none is missing.
- **Document it.** A new option, command or behaviour gets a place in the README.
- **No private data.** Do not put real customer data, templates or names in tests, examples or screenshots.

## Before you open a pull request

Run these and make sure they pass:

```
npm run typecheck
npm test
npm run test:e2e
```

If a browser test fails in only one browser, say so in the pull request: the engines differ in how they handle selection and editing, and that is useful to know.

## Pull requests

- Say what changed and why, and link the issue (`Closes #123`).
- Keep the change focused; unrelated clean-ups go in a separate pull request.
- You do not need to bump the version or write a changelog entry. The maintainer does that when releasing.

## License

By contributing you agree that your contribution is licensed under the project's [MIT license](LICENSE).
