# Connect VETO to Antigravity

Open `/Users/patel/Dev/veto` as the Antigravity workspace. The project includes `.agents/mcp_config.json`, which starts VETO's stdio MCP server through Node. Antigravity's [MCP configuration guide](https://www.antigravity.google/docs/mcp) documents workspace-level `.agents/mcp_config.json` and the `command`, `args`, and `cwd` fields.

## Prepare the local model

From the project root:

```sh
uv venv --python python3.12 .local/venv
uv pip install --python .local/venv/bin/python -r config/laya-requirements.txt
.local/venv/bin/python scripts/install-laya-model.py
npm ci
```

The checkpoint stays under ignored `models/laya/`. VETO's worker uses the pinned local revision during inference, so the server does not need network access after setup.

In Antigravity, refresh the MCP servers from Settings → Customizations → Installed MCP Servers, or use the MCP manager in the CLI. Confirm that `veto` exposes `authorize_action` and `report_action_result`.

## Execution boundary

The MCP connection makes VETO's two tools available to Antigravity. It does **not** automatically intercept Antigravity's built-in `run_command` or file tools. Antigravity's [hooks guide](https://antigravity.google/docs/hooks?tab=ide) documents `PreToolUse` hooks for `run_command` and file operations. Until a mandatory hook is installed and verified, use VETO's tool results as advisory and do not claim that native tool calls are governed.

For a protected run, the host must freeze the proposed action, call `authorize_action`, compare the returned fingerprint with that exact request, and execute only after `ALLOW`. It must deny on timeout, malformed response, or mismatch, then call `report_action_result` after an allowed action completes. The host must independently restrict command execution and filesystem paths.

The current project tests prove MCP tool discovery and a hard denial using the configuration in this repository. A live Antigravity agent proposal and mandatory hook test remain Phase 3 work.
