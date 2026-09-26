# VETO

### Runtime control for autonomous AI

> **Agents act. VETO decides if they should.**

An autonomous agent can propose commands that delete files or repeat expensive work long after its plan stops making sense. VETO's MVP is a small MCP authorization gateway: the agent host asks VETO before acting, then executes only when VETO allows the exact request.

```text
User goal ──► External agent ──► Host asks ║ VETO ║ ──► ALLOW / DENY
                    ▲                                  │
                    └──────── REPLAN ◄─────────────────┘
                   Host executes only after ALLOW
```

## The idea

The external agent plans and proposes actions. VETO calls a pinned local [Laya](https://github.com/NandhaKishorM/laya) model through its Python worker for typed predictions. VETO combines those predictions with deterministic policy, then returns ALLOW or DENY with a reason. VETO does not execute commands; the agent host owns execution and workspace restrictions.

This separation matters: the agent that wants to act does not get to approve its own action.

| Failure | VETO decision |
| --- | --- |
| Destructive or goal-contradicting action | DENY: blocked |
| Consequential action | DENY: manual review |
| Repeated work with little progress | DENY: replan |
| Repeated failed replans or exhausted budget | DENY: stop |

VETO identifies repeated calls and costly build/test requests from normalized arguments, recent outcomes, and host-reported cost metadata. It can assess other costly tool calls when the host routes them through the same authorization hook. Calls that bypass the hook are outside VETO's control. No savings figure is claimed yet.

## Architecture at a glance

The MVP exposes **VETO as an MCP server** with `authorize_action` and `report_action_result`. A pre-tool host hook submits the exact proposed action to VETO. VETO applies hard restrictions, asks the local Laya model for safety and goal-alignment probabilities when needed, and returns a fingerprint-bound verdict. The host executes an allowed action once or requests operator review for a reviewable verdict.

The live demonstration should show a repetitive command loop interrupted, an attempted critical-folder deletion blocked, a hallucinated command/path flagged, and costly calls recorded. A transcript and compact decision log are enough; the full product UI is deferred.

## Set up and test

Use [the agent integration guide](docs/agent-integration.md) to install Node.js and Python dependencies, configure the MCP server, and add a host pre-tool hook. The [host specification](docs/mcp-host-spec.md) explains the request contract and how another coding tool can enforce VETO. The [Antigravity guide](docs/antigravity.md) provides a worked example; the [disposable agent lab](veto-agent-lab/README.md) provides test files and reset scripts.

The MCP connection alone does not intercept a coding tool's commands. The host hook must cover each protected tool path, and the host must enforce the returned decision. Run `npm run mcp:smoke` for an MCP/model connection check and `npm run test:micro` for the repository's micro tests.

## Documentation

- [Agent integration guide](docs/agent-integration.md) — how a host asks VETO before actions and enforces its decisions.
- [MCP host specification](docs/mcp-host-spec.md) — schemas, fingerprint checks, manual review, and host responsibilities.
- [Antigravity setup](docs/antigravity.md) — local connection, hook, and demo procedure.
- [Agent lab](veto-agent-lab/README.md) — disposable checkout scenario and reset commands.

## Current status

**MVP implemented.** The MCP server, local model worker, policy engine, Antigravity hook, decision log, and disposable checkout lab are in the repository. Focused micro tests have passed. A complete test run, live host evidence, and Linux/Windows host validation remain outstanding. The sample hook covers named tool paths and bounded command forms; another host needs its own adapter.

---

<p align="center"><strong>Something is always watching.</strong></p>
