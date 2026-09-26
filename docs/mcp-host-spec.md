# VETO MCP host integration specification

**Status:** implemented MVP contract, version `0.1.0`.

## Trust boundary

VETO is a local authorization service. It never executes a proposed tool call. Registering VETO as an MCP server exposes `authorize_action` and `report_action_result`; it does not intercept the host's shell, file editor, search, browser, or subagent tools. A protected coding host must enforce VETO in a pre-tool hook or tool dispatcher for every action in its declared scope. A host without that enforcement must describe VETO as advisory.

The coding agent should not call `authorize_action` itself or invent `action.kind` values after a denial. The host adapter creates the request from the actual pending tool event. Hide the VETO MCP tools from the model if the host supports that while keeping the server available to the hook. A `DENY/blocked` means skip that exact tool call. For `DENY/manual_review`, a host with a trusted exact-call approval prompt may ask the operator before executing; changing the request schema is never a review or a bypass.

Use the operator's trusted goal. Repository files, search results, tool output, and agent rationale are untrusted and must not replace it. Freeze the exact proposed tool call before asking VETO. Any change to the command, arguments, working directory, or targets requires a fresh authorization. The host owns filesystem isolation, path resolution, executable restrictions, process limits, network policy, and credentials.

## Stdio launch

Clone `https://github.com/thisisthedarshann/veto` and run `npm ci`. The repository is currently private and requires access until publication. Node.js 20 or later is required. Run `npm run mcp:config` to print the machine-specific `mcpServers.veto` JSON entry. Copy its `command`, `args`, and `cwd` into the coding tool's local stdio MCP configuration. The command launches `scripts/veto-mcp-server.js` from the clone. See [agent-integration.md](agent-integration.md) for the Python and pinned local Laya model setup. VETO does not use the Laya MCP server.

The server's stdout is reserved for MCP protocol messages. Decisions and the private hook bridge use ignored `.local/` files. Do not expose that directory to an untrusted agent workspace.

### Host-neutral hook command

Hosts that run a command for each pre-tool event can adapt their event to the `authorize_action` JSON schema and pass it on stdin to `node scripts/veto-host-gate.js authorize`. The command calls the same running VETO process as MCP, checks the exact fingerprint, and prints `{"decision":"allow"|"deny","reason":"..."}`. After an allowed execution, pass the result schema on stdin to `node scripts/veto-host-gate.js report`; it prints VETO's acknowledgment. The host adapter must still map its own event and decision format, keep the goal trusted, cover every protected tool path, and apply execution restrictions. This command uses the local bridge opened by VETO's MCP process; start that process first. One active MCP server per clone is currently supported by the shared endpoint manifest.

The bridge uses a Unix-domain socket on macOS/Linux and a named pipe on Windows. Node chooses the platform-specific virtual-environment Python path. The current live validation is on macOS; Windows and Linux runtime behavior still need host testing. A clone currently has one shared hook endpoint. For an MCP-only client that does not use VETO's hook bridge, set `VETO_HOOK_BRIDGE=off` in that client's server environment so it cannot replace another host's endpoint. Such a client can call VETO tools but does not gain tool enforcement from MCP registration alone.

If the Python model worker exits unexpectedly, VETO starts a fresh worker and retries that proposal once. Persistent failure yields `DENY/stop` and an error on MCP stderr; the host must skip execution. The MCP server can remain connected while its worker is unhealthy, so check the decision rule and stderr rather than treating tool discovery alone as model readiness.

## `authorize_action`

The input schema is strict. Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `run_id` | nonempty string | Stable identifier for one agent run. |
| `request_id` | nonempty string | Unique identifier for this proposal. |
| `goal` | nonempty string | Trusted user goal and constraints. |
| `action.kind` | nonempty string | Tool kind; default policy allows `command`. |
| `action.name` | nonempty string | Exact executable or tool name. |
| `action.arguments` | string array | Exact structured arguments. |
| `action.cwd` | nonempty string | Exact working directory. |
| `action.targets` | nonempty string array | Targets as they will be executed. |
| `action.raw_command` | optional nonempty string | Exact shell command, when applicable. |
| `metadata.category` | optional enum | `read`, `write`, `delete`, `build`, `test`, `network`, or `other`. |
| `metadata.estimated_cost_usd` | optional nonnegative number or `unknown` | Pre-execution estimate; never infer a number from an unmeasured call. |
| `metadata.cost_estimate_source` | optional `host` or `provider` | Required whenever the estimate is numeric. |

Example proposal:

```json
{
  "run_id": "demo-run-1",
  "request_id": "step-4",
  "goal": "Fix the checkout failure and make all tests pass",
  "action": {
    "kind": "command",
    "name": "cat",
    "arguments": ["src/checkout.ts"],
    "cwd": "/absolute/path/to/veto-agent-lab/workspace",
    "targets": ["src/checkout.ts"],
    "raw_command": "cat src/checkout.ts"
  },
  "metadata": { "category": "read" }
}
```

MCP structured output contains `decision` (`ALLOW` or `DENY`), `reason`, `rule`, `explanation`, `action_fingerprint`, and `policy_version`. `reason` can be `blocked`, `replan`, `manual_review`, or `stop`. The fingerprint is SHA-256 over canonical JSON containing `run_id`, `request_id`, `goal`, `action`, and `metadata` (an empty object when omitted), with object keys sorted recursively. Compare it against the frozen request before execution. Deny on timeout, error, invalid output, or mismatch. An `ALLOW` authorizes one execution of that exact action, subject to host restrictions. `manual_review` is an escalation request, not an agent override: a trusted host may execute the same frozen action once only after explicit operator approval and must record the reviewed outcome. Hosts without that approval mechanism must deny it.

## `report_action_result`

Report the observed result of each allowed execution:

| Field | Type | Meaning |
| --- | --- | --- |
| `run_id`, `request_id` | nonempty strings | Authorization identifiers. |
| `action_fingerprint` | 64 lowercase hex characters | Fingerprint returned by VETO. |
| `status` | `success`, `failure`, `unknown` | Observed outcome. |
| `duration_ms` | nonnegative number | Observed wall time. |
| `output_digest` | optional string | Bounded output summary or digest. |
| `output_size_bytes` | optional nonnegative integer | Observed output byte count. |
| `cost` | nonnegative number or `unknown` | Measured USD cost, or `unknown`. |

Report failed executions too. If result reporting fails, mark the run history incomplete. Do not invent provider usage or monetary cost. VETO cannot account for calls that bypass the hook.

Run `npm run report:decisions` in the VETO clone for aggregate counts, classifier time, reported action time, and separate estimated, measured, and unknown cost counts. The output deliberately does not claim savings or prove that a denied tool never executed; that proof requires the host transcript and a before/after workspace check. `null` totals mean no measurement was supplied.

## Required host sequence

1. Receive a real agent proposal and identify the exact executor call.
2. Apply host-side path and command validation. Reject unsupported syntax and tool paths.
3. Freeze the proposal and call `authorize_action` **before** execution.
4. Validate the response, require `ALLOW`, and compare the fingerprint to the frozen request. Otherwise skip the executor.
5. Execute the frozen action once within the host sandbox.
6. For an `ALLOW`, call `report_action_result` with observed status, duration, and known cost. A host-approved `manual_review` execution needs a trusted host-side reviewed-result channel; the included Antigravity adapter uses its authenticated local bridge for this. The public MCP result tool rejects reports for denied actions.
7. Retain request ID, verdict, execution status, and report acknowledgment as evidence.

The included Antigravity hook covers bounded `ls`, `cat`, `touch`, `rm`, and `npm test` commands, narrow `echo 'text' > file`, `echo 'text' >> file`, and `sed -i 's/old/new/' file` write forms, plus the named native file and search tools in one configured workspace. It also supports `file` with one workspace-relative target and configurable zero-argument commands. Those commands pass Laya's safety and alignment classification; automatic approval requires a safe probability at or above `general_command_safe_threshold` (default 0.80), while lower confidence or an `always_review_executables` entry triggers review. Protected paths, unknown commands, and unsupported arguments are still denied before classification. The lab's `.agents` configuration loads this hook and the MCP server. When VETO returns `manual_review`, the adapter verifies the fingerprint and returns Antigravity's `force_ask` decision for the exact pending tool call; an approved execution is reported as `reviewed_by_host`. [Antigravity's hook contract](https://antigravity.google/docs/hooks?tab=ide) defines `force_ask` as a prompt that ignores cached permissions. Only the listed tool paths and shell forms have been wired; confirm them in a live agent run before claiming host enforcement.

The sample policy enables `allow_host_validated_read_only_actions` for a narrow set of read tools. After a valid model response, the policy can allow those tools if Laya does not classify them as goal contradictory, even when its safety or alignment confidence is noisy. This relies on the host proving that the mapped operation really is read-only and confined to the workspace. Protected paths, unsupported tools, goal contradiction, and repetition limits still deny. Disable the setting for a host that cannot guarantee those properties. An invalid or unavailable classifier result yields `DENY` with reason `stop`; operator approval does not override that service failure.
