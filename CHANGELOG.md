# CHANGELOG — PreBIM

This changelog is a human-friendly summary of notable changes.
For an exact audit trail, see `git log` and `DEPLOY_LOG.md`.

## Unreleased

- (none)

## 2026-03-03

- Floor (horizontal) bracing by bay (X/V/K) with A + K2 definitions.
  - UI: Bracing popup → Floor bracing toggle + type + level selector; click bays to select.
  - Data: `options.floorBracing` + `floorBraces[]`.
  - Engine: generates brace members on selected bays at selected level.

- Deployed 20260303T233200Z | commit=a360bb2 | tag=deploy-20260303T233200Z
