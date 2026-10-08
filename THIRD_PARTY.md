# Third-party assets

These files are bundled for convenience and are **not** covered by this repository's MIT license; each keeps its
own license.

| File | Work | Author | License |
|---|---|---|---|
| `plugin/skills/tvideo/templates/editor/assets/fonts/IBMPlexSansThai-*.ttf` | IBM Plex Sans Thai | IBM Corp. | SIL Open Font License 1.1 — full text in `assets/fonts/OFL.txt` |
| `plugin/skills/tvideo/templates/editor/assets/music/ende-happy-beats-business-moves-vol-12.mp3` | "Happy Beats / Business Moves Vol. 12" | ende.app | Creative Commons Attribution 4.0 (CC BY 4.0) — https://ende.app/en/standard-license. Commercial use allowed; credit is printed on each video's outro card via `music.credit`. |

Not bundled (fetched from the user's own installs at run time):

- Sound effects (`click-soft`, `whoosh-short`, `chime`, `sparkle`) — copied by `scripts/sfx.sh` from the
  Hyperframes `media-use` skill.
- GSAP — loaded by the generated composition from a CDN.
- Playwright, Hyperframes CLI — installed via npm / npx.
