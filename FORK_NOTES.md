# Fork Notes — PG2047/fieldtheory-cli

This is a personal fork of [afar1/fieldtheory-cli](https://github.com/afar1/fieldtheory-cli)
maintained primarily for self-use. The commits beyond upstream are small,
self-contained, and intended to be contributed back.

## Commits beyond upstream (fork base: `f218784`)

| SHA | Date | Type | Summary |
|-----|------|------|---------|
| `4d9c43a` | 2026-05-23 | `fix(deps)` | Regenerate `package-lock.json` to match `package.json`. Upstream renamed `ft-bookmarks 1.3.0` → `fieldtheory 1.3.2`, dropped `zod`, and added a `fieldtheory` bin alias, but the lock file was not regenerated in the same commit. Without this fix, `npm install` silently rewrites the lock on first run. |
| `25f501f` | 2026-04-08 | `security` | Fix 3 issues from a dual-model audit (Claude Opus 4.6 + GPT-5.4 cross-validation). Full report in [`SECURITY.md`](./SECURITY.md). 19 new tests, 0 regressions. |

### `25f501f` highlights

- **P0-1** — Harden `/tmp` cookie database copies: `chmodSync(0o600)` immediately after `copyFileSync` in both Chrome and Firefox paths; Firefox WAL/SHM sidecars also restricted; cleanup failures now surface as warnings instead of being swallowed.
- **P0-2** — Upgrade prompt injection defense: Unicode NFKC normalization before regex filtering, control-character stripping, blocklist expanded 3 → 9 patterns, response parsing capped to batch size.
- **P1** — Harden skill installation supply chain: explicit `0o644` writes, SHA-256 checksum displayed on install, write-back integrity verification, new `verifySkill()` export for runtime integrity checks.

## Status vs upstream

```
afar1/fieldtheory-cli  main HEAD = 46 commits ahead of f218784 (fork base)
PG2047/fieldtheory-cli main HEAD = 4d9c43a
                                   ├─ 2 ahead of fork base
                                   └─ 46 behind upstream
                       status     = diverged
```

## Future intent

- [ ] Open PR upstream for `25f501f` (security fix)
- [ ] Open PR upstream for `4d9c43a` (lockfile regeneration)
- [ ] Sync the 46 upstream commits — may require rebase if upstream already addressed `package-lock.json` mismatch independently

## Local usage notes

This fork is installed via `npm link` (not `npm install -g`), exposing the
`ft` command from local source. Data lives in `~/.ft-bookmarks/` with both
SQLite FTS5 index and an Obsidian-compatible markdown wiki.
