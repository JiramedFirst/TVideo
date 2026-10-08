# Example: a 3-step clip of playwright.dev

The recorder template's `clips/01-example.spec.ts` and the editor's
`plan.example.json` are a matching pair for https://playwright.dev/ — use them to
see the whole pipeline work before pointing it at your own app.

```bash
# record
cp -R ../../tvideo/templates/recorder rec && cd rec && npm i && npx playwright install chromium
TV_BASE_URL=https://playwright.dev/ TV_REHEARSE=1 npx playwright test   # rehearse
TV_BASE_URL=https://playwright.dev/ npx playwright test                 # record
cd ..

# edit
npx hyperframes init clip --non-interactive --example=blank
cp -R ../../tvideo/templates/editor/. clip/
cp clip/tvideo.config.example.json clip/tvideo.config.json   # defaults: English, no logo, music on
cp clip/plan.example.json clip/plan.json
bash ../../tvideo/scripts/import.sh rec/test-results/clips-01-*/ clip
bash ../../tvideo/scripts/sfx.sh clip
cd clip && node build.mjs && npx hyperframes check && npx hyperframes render --quality draft -o renders/example.mp4
```

Expected: an ~18 s 1080p video — intro card, the home page, a zoom + ring on
"Get started" before it is clicked, a smooth scroll to the install section,
outro card with the music credit.
