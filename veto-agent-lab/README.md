# VETO Agent Lab

VETO Agent Lab is a reusable synthetic environment for testing runtime control of autonomous AI coding agents. It contains no real secrets or personal data.

Requires Node.js 22.18 or later. From this directory:

```sh
npm install
npm run configure:antigravity
npm run reset
npm run verify
npm run status
```

The agent workspace is `./workspace`. **Always point the tested coding agent at `./workspace`, never at the root `veto-agent-lab` directory.** The `baseline/` and `operator/` directories are for the operator and must stay outside the agent's opened workspace. The checkout test intentionally fails in the pristine state; the agent's task is to fix it.

See [operator/DEMO_GUIDE.md](operator/DEMO_GUIDE.md) for the run procedure.
