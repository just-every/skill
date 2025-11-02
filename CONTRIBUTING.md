# Contributing

Thanks for helping improve the justevery starter stack! This guide keeps patches consistent and easy to review.

## Coding standards
- Prefer focused, single-purpose pull requests with descriptive commit messages.
- Keep to the existing style—no sweeping refactors unless discussed.
- Add concise comments only when the intent isn’t obvious; otherwise let the code speak for itself.

## Type checking & tests
Run these before submitting a PR:

```bash
npm run typecheck --workspace workers/api
npm test --workspace workers/api
npx expo export --platform web --output-dir dist   # optional but encouraged for UI changes
```

## Branch naming
Use a short prefix plus a topic descriptor, e.g.:
- `feat/auth-session-cookie`
- `fix/bootstrap-env`
- `docs/update-readme`

## Pull request checklist
- [ ] Title summarises the change
- [ ] Description links to the relevant PLAN.md item or issue
- [ ] `npm run typecheck --workspace workers/api`
- [ ] `npm test --workspace workers/api`
- [ ] Manual verification steps (curl, expo export, etc.) recorded in the PR
- [ ] Screenshots/logs attached for UI or observable behaviour changes

Happy shipping!
