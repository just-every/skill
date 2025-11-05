# Test Artefacts

- `smoke/<timestamp>/` – outputs from the smoke harness (`report.json`, `checks.json`, `screens/`).
- `bootstrap-<ISO>/` – artefacts captured during the bootstrap validation checklist (`docs/BOOTSTRAP_VALIDATION.md`).
- Additional directories may be added by CI runs; keep directories timestamped for easy diffing.

This folder is ignored except for this note so results can be archived ad hoc without polluting commits.

