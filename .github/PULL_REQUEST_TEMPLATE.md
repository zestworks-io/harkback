## What and why

## Checklist

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm format:check` pass
- [ ] `pnpm e2e` passes (if `apps/extension` changed)
- [ ] `pnpm check:build` passes (if permissions, the manifest or the content script changed)
- [ ] Tests cover the new behavior
- [ ] Documentation in `guide/` and `CHANGELOG.md` updated for user-visible changes
- [ ] New interface text is translated in every language table
- [ ] If this changes what is sent to a model or how sensitive sources are handled, `PRIVACY.md`, `guide/privacy.md` and the privacy notes in the extension are updated together
