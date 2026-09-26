# Initial contract notes

`authorize_action` accepts `run_id`, `request_id`, trusted `goal`, `action` (`kind`, `name`, string-array `arguments`, `cwd`, string-array `targets`), and optional `metadata.category`. The exact request is canonically key-sorted and SHA-256 fingerprinted. The host must compare that fingerprint before execution. An argument, target, working directory, goal, or metadata change invalidates authorization.

`report_action_result` uses the same IDs and fingerprint, `status` (`success`, `failure`, `unknown`), and nonnegative `duration_ms`; `output_digest` is optional. It is only accepted for a previously allowed action in the future state layer.

`config/policy.yaml` is intentionally a flat YAML subset with JSON-formatted scalars/inline arrays. Unknown and duplicate keys are errors. The host must also enforce technical command/path isolation. Policy checks alone are not a sandbox.

Open prerequisites: inspect the actual Laya package/MCP schema and choose an agent host with a mandatory pre-action hook. These are Phase 2/3 gates, so no live integration claim is made yet.

Policy choices as of 2026-09-26: terminal call/replan limits take precedence; hard restrictions follow; invalid classifier output is `DENY/manual_review`; destructive or contradictory choices block; repeated no-progress work replans; dangerous or uncertain choices require manual review. `caution` with aligned goal may pass unless the category requires review. Confidence uses the winning choice's margin over the runner-up. Monetary cost is not inferred from action count or elapsed time.
