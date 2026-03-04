# RUNBOOK_PREBIM.md

## Codes strategy

- See `docs/CODES_STRATEGY_KDS_US.md` for the KDS(KR)+US(ASCE7/AISC) phased plan.

## Roadmap

- UI route: `#/roadmap`
- Default milestones live in `public/prebim/app.js` (`ROADMAP_DEFAULT`).
- Completion state is stored per device in `localStorage` under key `prebim_roadmap_v1`.

## Deploy

This repo uses a simple, auditable, AI-assisted deploy script.

- Destination: `/var/www/sengvis-playground/prebim`
- Backups: `/root/clawd-dev/backups/prebim/*.tgz`
- Deploy tags: `deploy-YYYYMMDDTHHMMSSZ`

Run:

```bash
cd /root/clawd-dev/prebim
./scripts/deploy.sh
```

### Notes
- The deploy script uses an SSH deploy key.
  - Recommended: set `DEPLOY_KEY_PATH` in your shell/environment (not committed to git).
  - If unset, the script uses its default local path (see `scripts/deploy.sh`).
- `.keys/` is excluded from deploy rsync.
- Each deploy snapshots the deployed folder before/after as a `.tgz` archive.

## AI trace / auditability

- Deploy tag annotation contains `(AI-assisted)`
- `DEPLOY_LOG.md` is appended on each deploy
- Human-friendly change summaries:
  - `CHANGELOG.md` (feature-focused)
  - `WORKLOG_YYYY-MM-DD.md` (optional, narrative log)
  - Workspace daily log: `/root/clawd-dev/memory/YYYY-MM-DD.md` (agent work diary)
