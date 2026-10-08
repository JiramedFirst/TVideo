#!/usr/bin/env bash
# sfx.sh <editor-project-dir>
# Copy the four sound effects the editor uses (click-soft, whoosh-short, chime,
# sparkle) from the user's own Hyperframes media-use install into the project.
# TVideo does not redistribute these files; they ship with Hyperframes
# (`npx hyperframes skills update media-use` installs them).
set -euo pipefail
PRJ="${1:?usage: sfx.sh <editor-project-dir>}"
for d in "$HOME/.claude/skills/media-use/audio/assets/sfx" "$HOME/.agents/skills/media-use/audio/assets/sfx"; do
  if [ -d "$d" ]; then SRC="$d"; break; fi
done
if [ -z "${SRC:-}" ]; then
  echo "media-use SFX not found — run: npx hyperframes skills update media-use   (or set \"sfx\": false in tvideo.config.json)" >&2
  exit 1
fi
mkdir -p "$PRJ/assets/sfx"
for n in click-soft whoosh-short chime sparkle; do cp "$SRC/$n.mp3" "$PRJ/assets/sfx/"; done
ls "$PRJ/assets/sfx"
