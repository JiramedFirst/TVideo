# TVideo

A Claude Code skill that turns a **real web app** into polished **tutorial / how-to videos** — no screen-recording software, no video editor.

```
"Make a tutorial video showing how a customer creates an order on https://staging.example.com"
```

Claude then:

1. **Plans** the clips with you (one task per video, language, brand, demo account).
2. **Records** the real UI with Playwright — a visible cursor glides to every button, smooth scrolling, readable pacing. A rehearsal run proves every selector first.
3. **Edits** with [Hyperframes](https://hyperframes.heygen.com): branded intro/outro cards, step captions (any language — Thai font included), zoom + highlight ring on the control to press, a click sound on every click, music, optional TTS narration.
4. **Renders** a 1080p MP4 per clip.

Re-recording after a UI change is one command per clip — the edit is generated from the recording's timeline, not hand-made.

## Install

```bash
git clone <this-repo> && cp -R TVideo/tvideo ~/.claude/skills/tvideo
```

Requirements: Node ≥ 20, ffmpeg, and Hyperframes skills (`npx hyperframes skills update general-video`). Claude checks these for you in its first step.

Then just ask Claude Code for a tutorial video of your app. Try the built-in example: *"Use tvideo to make the example clip against https://playwright.dev/"*.

## What's inside

| Path | What |
|---|---|
| `tvideo/SKILL.md` | The workflow Claude follows (preflight → brief → rehearse → record → edit → render) |
| `tvideo/templates/recorder/` | Playwright project: visible cursor, step timeline, click log, login once, example clip |
| `tvideo/templates/editor/` | `build.mjs` (recording → Hyperframes composition), config + plan examples, fonts, music |
| `tvideo/scripts/` | `import.sh`, `frames.sh`, `sfx.sh`, `voice.mjs` |
| `tvideo/references/` | Recording/editing/narration guides and a troubleshooting table of real failures |

## Safety

Recording drives the app for real (forms submit, records and emails get created). Use a staging environment and a fictional demo account, and never film real customer data — the skill asks before recording against shared environments and can mask on-screen values in the edit. Credentials are read from environment variables only.

---

## ภาษาไทย (เริ่มต้นใช้งาน)

TVideo คือ skill สำหรับ Claude Code ใช้ทำ **วิดีโอสอนใช้งานเว็บแอป** จากระบบจริง ไม่ต้องอัดจอหรือตัดต่อเอง

**ติดตั้ง:** copy โฟลเดอร์ `tvideo` ไปไว้ที่ `~/.claude/skills/tvideo` ต้องมี Node 20 ขึ้นไป, ffmpeg และ Hyperframes (`npx hyperframes skills update general-video`) ซึ่ง Claude จะเช็คให้ตอนเริ่มงาน

**วิธีใช้:** พิมพ์สั่ง Claude Code เช่น

> ทำวิดีโอสอนลูกค้าวิธีสร้างคำสั่งซื้อในระบบ https://staging.example.com ใช้บัญชีทดสอบ caption ภาษาไทย

Claude จะทำตามลำดับนี้:
1. ถามรายละเอียดที่จำเป็น
2. ซ้อมเดินทุกปุ่มก่อนอัดจริง 1 รอบ
3. อัดหน้าจอจริงพร้อมเมาส์
4. ตัดต่อใส่ caption, ซูม, กรอบไฮไลต์, เสียงคลิก และเพลง
5. render เป็นไฟล์ MP4

**ข้อควรระวัง:**
- การอัดคือการใช้ระบบจริง ข้อมูลจะถูกสร้างและ email ส่งออกจริง ควรใช้ระบบทดสอบกับบัญชีสมมติ
- ห้ามให้ข้อมูลลูกค้าจริงโผล่ในวิดีโอ
- รหัสผ่านต้องตั้งผ่าน environment variable ห้ามพิมพ์ลงแชท

## License

MIT — see [LICENSE](LICENSE). Bundled third-party assets keep their own licenses — see [THIRD_PARTY.md](THIRD_PARTY.md).
