# RUNBOOK_PREBIM.md

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
- The script uses the GitHub Deploy Key at: `./.keys/prebim_deploy_ed25519`
- `.keys/` is excluded from deploy rsync.
- Each deploy snapshots the deployed folder before/after as a `.tgz` archive.

## AI trace / auditability

- Deploy tag annotation contains `(AI-assisted)`
- `DEPLOY_LOG.md` is appended on each deploy
