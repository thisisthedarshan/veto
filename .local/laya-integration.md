# Direct Laya integration record — 2026-09-26

User direction: VETO calls Laya's model directly through its Python API. VETO may still expose its own MCP tools to the external host. There is no Laya MCP process.

- Installed `laya==0.3.20` in ignored `.local/venv` with Python 3.12. Its package metadata reports Apache-2.0 and the `convaiinnovations/laya` model home. Upstream package metadata and source: https://github.com/NandhaKishorM/laya/blob/main/pyproject.toml .
- Pinned English checkpoint repo and revision in `config/laya-model.json`. The downloaded checkpoint is under ignored `models/laya/`; `git check-ignore` confirms it is excluded. The worker uses the pinned local snapshot with `local_files_only=True`, so serving does not silently change model revisions.
- Real direct inference succeeded with `node scripts/laya-smoke.js`. Laya 0.3.20 returned `probabilities`, a raw progress score on the 0–2 rubric, and a `noul` probability. The adapter normalizes progress to 0–1 and validates choice probabilities.
- A real gate decision from `node scripts/laya-gate-smoke.js` was logged in ignored `.local/laya-smoke.jsonl`. For a harmless `ls` proposal, this zero-shot checkpoint returned uncertain alignment, so VETO conservatively returned `DENY/manual_review`. Observed cold classifier time was about 15 seconds on this machine; it is not a performance guarantee.
- The checkpoint emitted a warning that some calibration temperatures were invalid and corrected at load. Treat its confidence as uncalibrated until evaluated on VETO examples. Do not tune policy thresholds to this single smoke input.
- Focused worker tests use a stub process to cover request/response normalization and timeout. A live host integration and full evaluation are still pending.

Reproduction: create `.local/venv` with Python 3.12, install `config/laya-requirements.txt`, run `.local/venv/bin/python scripts/install-laya-model.py`, then run the two smoke scripts.
