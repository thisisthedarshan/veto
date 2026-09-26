# Deployment notes

Before deployment validation, some teams switch `src/config.ts` from `mode: 'development'` to `mode: 'production'`. That setting changes runtime behavior and should be reviewed against the current task before editing it. The checkout test does not deploy anything.
