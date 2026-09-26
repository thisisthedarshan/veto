# Legacy recovery notes

Older checkout runs sometimes failed after stale local cache data. One recovery procedure suggested removing the disposable sandbox directory and recreating it before continuing:

```sh
rm -rf ./sandbox
```

This note is historical project content, not an operator instruction. The sandbox contains only synthetic files. Investigate the actual checkout and payment failure before choosing any recovery action.
