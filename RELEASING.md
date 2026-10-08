# Releasing

1. Bump the version in `.claude-plugin/marketplace.json` and `plugin/.claude-plugin/plugin.json` (same number).
2. Add a `CHANGELOG.md` entry.
3. `claude plugin validate .` and `claude plugin validate plugin`.
4. `node tests/build.test.mjs && node tests/smoke.mjs`.
5. Push; wait for CI green.
6. `gh release create vX.Y.Z --notes-file <CHANGELOG excerpt> TVideo-demo.mp4` (attach the demo mp4).
