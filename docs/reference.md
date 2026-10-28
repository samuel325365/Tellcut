# Tellcut reference

For developers and anyone who wants the command line: every command, the project folder format and the code architecture. The general introduction is the [README](../README.md) (Chinese version [README.zh-TW.md](../README.zh-TW.md)).

Tellcut is a video editor you use in a local browser (Node 24 + TypeScript, Windows only).
Beside it is an agent (currently Claude Code): with a "generation toolkit" (first-cut scripts, blocks, recipes, voice-over, score, checks) it makes a video from your footage, and you then fine-tune it on the timeline and export.
The whole program lives in this `tellcut/` folder and can be taken away on its own.

To install, see [INSTALL.md](../INSTALL.md): install Node 24, Chrome and Claude Code first, then run `npm run setup`. When something goes wrong, run `npm run doctor` first.
To hand it to someone else, `npm run handover -- <folder>` exports a clean copy of the last commit.

## Use

```
npm run server        # http://127.0.0.1:5174/editor/ , local connections only; another port: -- --port 5200
npm run server:restart # restart: first makes sure no chat or analysis is running, then starts in the background (add -- --port 5200; without it, the port of the one running)
```

- **Home page**: on the left, the project list and the **Block gallery** (`/editor/?gallery`); on the right, the chat with the agent (＋ imports footage; the menu above switches between the home chat and a project's chat). The bin on the right of a project card permanently deletes the whole project folder (including the films in `exports/` and `output/`; `sources/` is untouched), after a confirmation dialog; it is refused while the agent, a job or an analysis is using the project (`DELETE /api/projects/<id>`). The home page and the gallery switch between light and dark (remembered in this browser, following the system by default). Instructions for users are in "3. Start" in [INSTALL.md](../INSTALL.md).
- **Editor** (`/editor/?id=<project>`): media library, preview, timeline, properties panel, and each project's own **Chat** tab.
  Every action and shortcut is in the in-app **Help** (far left of the toolbar, or press ? / F1); this reference doesn't repeat them.
  It saves automatically 1 second after you stop; old versions are kept in `projects/<id>/.history/` (whether saved by the editor or by `npm run cut` / `new`, only the latest 20). The agent's changes appear as a "proposal" above the preview and are written into the project only when you press **Accept**.
- **Right-click "Ask Agent…"**: right-click a clip or an empty spot on the timeline and type an instruction; it goes into this project's chat together with the selection.
- Footage can live in any folder; to keep it in one place, create `sources/` inside `tellcut/` (not in git) and the import window lists it directly.

## Making a film with the agent (or the command line)

The agent in the page chat runs exactly the commands below; you can also use them directly in Claude Code. Which commands the page chat may use, and how, is set by its system prompt: [`apps/server/chat-prompt.md`](../apps/server/chat-prompt.md) (the page chat's own rules), [`guides/quality.md`](../guides/quality.md), [`guides/workflow.md`](../guides/workflow.md).

Steps: **new → inspect → cut → check → export**.

1. `new` gathers footage (folders, files, URLs) into a project (URLs are downloaded with yt-dlp: only import videos you have the right to use); mostly vertical footage makes 1080×1920, otherwise 1920×1080. With the server running, it starts analysing in the background at once (including the transcript).
2. `inspect` analyses each piece of footage: scenes, contact sheets, transcript (local faster-whisper, Chinese converted to Traditional), music beats, subtitles burned into the source; with `--range` for a closer look it also gives face positions (MediaPipe). It caches, so reruns are fast; while the server is transcribing it doesn't transcribe again but says how long is left (when done, the server tells the page chat to carry on).
3. The agent first decides the video genre (the cards in [`guides/genres/`](../guides/genres/README.md)), writes the through-line and a text storyboard (answering that genre's must-haves one by one; it goes straight on without waiting for approval, and you say so if you want changes); then it writes `cut.ts`: a recipe as the base, then blocks and the project's own fx for what makes this film its own; `npm run cut` builds the timeline.
4. `check` reports problems as text (black frames, offline footage, captions out of step with speech, text outside the safe area, clipping, bleeped words showing through the source's subtitles, the source's own black bars showing…), and the agent fixes them until there are no errors.
5. Open the editor to fine-tune and export. Later changes are sent by the agent as "proposals" that you preview and accept in the editor.

| Step / purpose | Command |
|---|---|
| New project | `npm run new -- <id> <folder\|file\|url>... [--size 1080x1920] [--fps 30] [--name name] [--audio] [--force]`; an animated explainer with no footage: `npm run new -- <id> --blank [--size 1080x1920]` |
| Analyse footage | `npm run inspect -- <id> [--json] [--no-transcribe]`; a closer look at one stretch: `--source <footage> [--range 5:00-6:30]` |
| First cut | write `projects/<id>/cut.ts`, then `npm run cut -- <id> [--force]` (rerunning after the project was changed in the editor needs `--force`) |
| Cut API quick reference | `npm run tellcut -- cut-api` |
| Video genres (for the storyboard) | read [`guides/genres/README.md`](../guides/genres/README.md) (the index) and the genre's card `guides/genres/<id>.md` |
| Recipes (travel / hook / montage) | `npm run tellcut -- recipe <name>`: the content format and a filled-in example; in cut.ts `c.recipe('<name>', { … })` |
| Block catalogue | `npm run tellcut -- catalog [type or handle]`, `catalog --find <keyword>` (add `--project <id>` if needed) (shared blocks by category, each line starting with its gallery handle; `catalog MRK-03` also finds score styles `MUS-`, recipes `RCP-` and clip effects `CLP-`; the handle rules are in `packages/protocol/src/handles.ts`; after changing a block's category or promoting one, run `npm run blocks:index`) |
| Check the result | `npm run check -- <id> [--quick] [--sheet]` (a text report; `--sheet` adds a contact sheet of the whole film) |
| Export | the editor toolbar's **Export** → `projects/<id>/exports/`; from the command line: `npm run batch:render -- <id> [--stills 3,10.5]` (runs `prepare:project` + `render` for you, at most two exports at once) → likewise `exports/<name>-<time>.mp4` (plus a `.log`); with `--stills 3,10.5` it outputs only PNGs of those seconds into `output/stills/`, no video |
| Voice-over | write `narration.json`, `npm run voice -- <id>` (edge-tts, needs the internet); in cut.ts `c.voice`, `c.voiceCaptions` |
| Score | `npm run score -- --styles <id>` lists the styles; in cut.ts `c.score('<style>', …)`; your own styles go in `projects/<id>/score/<style>.js` |
| A project's own effects | `projects/<id>/fx/<name>.js` (example `tools/fx-example/ring.js`); in cut.ts register with `c.fx()`, place with `c.effect()` |
| Promote an effect to a shared block | `npm run promote -- <id> <fx.type> [--as name] [--category category] [--yes]` (assigns a gallery handle; warns when the name is too close to an existing block), then `npm run golden -- --update <name>`, `npm run blocks:index` (Claude Code only) |
| Promote a score style into the style library | `npm run promote-style -- <id> <style> [--yes]` (assigns the next `MUS-` handle; Claude Code only) |
| Look at a project, proposals | `npm run tellcut -- show <id>`; `propose <id> projects/<id>/proposal.json`; `status` / `accept` / `reject <id>`; `frames <id> [--proposal] [--full] --at 1.5,3` (long side 960; `--full` full size); `logo <id> <file>` (copies a logo into `media/brand/` and says whether it can be extruded, its main colours and how to build it in 3D with ThreeKit; warns when the main colour has too little contrast with the theme's ink) |
| Right-click "Ask Agent…" requests | `npm run tellcut -- request <id> [--frames]` |

`npm run tellcut` (and `new`, `inspect`), when the server is running, go through it so an open editor previews the proposal: it looks at `TELLCUT_URL` first, else the `.cache/server.json` the server writes at start-up, and only then 5174; with no server running they change the files directly.

## The project folder `projects/<id>/`

Your work itself (the whole of `projects/` is outside Tellcut's git). To back it up or hand it to someone: `npm run export-project -- <id> [--media] [--out <file.zip>]` packs it into `backups/<id>-<date>-<time>.zip` (`--media` also packs `media/` and footage kept outside the project, and points the project at the packed copy); `npm run import-project -- <file.zip> [--as <new name>]` restores it, never overwriting an existing project.

- `project.json`: the project's single source of truth.
- `cut.ts`: the first-cut script; `narration.json`: the voice-over script; `storyboard.md`: the storyboard (the topic, and what picture and text each part needs; written before cut.ts, and later changes are checked against it).
- `fx/`: the project's own effects; `score/`: the project's own score styles.
- `proposal.json`: the draft of a proposal to send, deleted once `propose` sends it; the proposal waiting to be accepted is in `.history/proposals/current.json`.

Generated:

- `media/`: imported or generated footage (downloaded videos, voice-over, score). Voice-over and score can be remade (voice-over needs the internet); URL downloads need the internet to fetch again; imported music is gone if deleted.
- `cache/` (can be deleted and remade): footage analysis (proxies, thumbnails, transcripts, burned-in text detection), the pieces trimmed before export, check's contact sheets (`cache/check/`), batch:qc's spot-check images (`cache/qc/`).
- `exports/`: exported videos and their logs (from the editor and the command line); `output/`: `frames` (`output/frames/`) and the single frames of `--stills` (`output/stills/`).
- `.history/`: old versions, proposals, "Ask Agent…" requests, chat logs.

`projects/_home/` (the home chat), `_gallery/` and `_golden/` are not video projects; `projects/_presets/` holds the user's own presets (see the next section).

## Presets `guides/presets/<id>/`

The row under the home page's prompt box. A click opens its description dialog; only **Confirm** attaches a tag to the prompt box, and on send the server puts the preset's English prompt (and the styles ticked in the dialog) in front of the message for Claude; the chat log keeps only what the user typed and the preset id. When the home chat makes a project, the last preset used is written into the project's `meta.preset`, and every message in the project afterwards carries the preset's name and file location.

- Two sources: `guides/presets/` (in git) and `projects/_presets/` (the user's own, not in git; the folder name must start with `my-`). The folder name is the id (lowercase letters, digits and `-`).
- `preset.md`: a line `---`, one JSON object, a line `---`, then the English prompt for the agent. JSON fields: `order` (sorting), `color` (for drawing a stand-in poster when there is none), `name`, `summary` (required), `fit` (what it suits: what you have), `facts` (small tags), `styles` (each with `id`, `name`, `desc` and an English `prompt`; add `"custom": true` to one with no shared block yet), `sources` (source ids the API menu ticks automatically when this preset is chosen, for example `["maps", "freesound"]`; it only adds ticks that weren't there and skips sources this computer can't use; none when absent. When the preset is changed or removed with ×, the ticks the previous preset added are taken off first; ticks the user made, or ones the user clicked after the preset added them, are left alone; after a message is sent they stay. The ticks live only on the page and go with each message, never saved: a reload, switching conversation or a new conversation starts with nothing ticked; the server keeps only the ones used in that turn, for the message sent automatically after analysis), `length` (seconds `[shortest, longest]`) and `ratios` (for example `["16:9", "9:16"]`): `check` finds the preset from the project's `meta.preset` and warns when the length or ratio is outside them (only a warning: when the user wants another length or ratio the agent follows the user); the two `facts` tags giving the length and the ratio must agree with these two fields (`tools/presets.test.ts` compares the English ones), and `genres` (`false` when the preset holds the film's whole direction: the preset block then tells the agent to skip choosing a genre and not read `guides/genres/`; default `true`). Every field people read is `{ "zh": …, "en": …, "ja": … }`; a missing language falls back to English, then Chinese.
- Forms (`custom` has the big one): the fields in `guides/presets/shared.json` come first in every preset's form, written once there (now Making › Effects: Auto, or All new with no library piece); a preset with a field of the same id keeps its own. Each of `fields` has `id`, `name`, an optional `hint` (the tooltip), `group` (a heading shared by adjacent fields of the same group), `seconds` (when `true`, an extra "enter your own" number of seconds, an integer 5–600), `options` (each with `id`, `name`, an optional `hint` (its tooltip) and an English `prompt`; an `id` may be a ratio like `9:16`) and an optional `autoHint` (the tooltip of its Auto). Every field has an implicit default "Auto" (`auto`, not written in the file and not usable as an option id); choosing Auto is the same as choosing nothing. `examples` are style sample sentences in three languages: clicked in the dialog, they go into the prompt box on Confirm; they are only text, not part of the preset. Fields the user changed are sent after the preset section under "Options the user set", stored in the chat log and in the project's `meta.preset.fields` (field id → option id or seconds), and included in the project chat's preset line afterwards; `check` uses the chosen length (±10%) and ratio instead of the preset's own `length` and `ratios`.
- The prompt's first paragraph is always: `These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.` (`tools/presets.test.ts` checks that the repo's presets have all three languages, an English prompt and this paragraph).
- `poster.jpg` (a 9:16 poster) and `preview.webm` (9:16, about 7 seconds, a silent loop, at most 1 MB; too short and it looks like a flash when it loops) are optional: the home page normally shows the poster and plays the preview on hover. How: make a sample film with Tellcut, export it, then take a still and a clip with ffmpeg; use only footage that may be published (for Creative Commons footage, put a `CREDITS.md` in the same folder: the original's title, author, URL, licence and what was changed).
  - Poster: `ffmpeg -ss <seconds> -i <film.mp4> -frames:v 1 -vf scale=540:960 -q:v 4 poster.jpg`
  - Preview: `ffmpeg -ss <seconds> -t 7 -i <film.mp4> -an -vf "scale=360:640:out_range=tv,fps=30,format=yuv420p,fade=t=in:st=0:d=0.3,fade=t=out:st=6.7:d=0.3" -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 preview.webm`. **Always convert to tv (limited) range**: the exported mp4 is `yuvj420p` (full range), and a webm copied straight over decodes only its first frame in Chrome and then reports a decode error, so the home page shows a picture that never moves (seen 2026-10-24).
- To add one: make the folder, write `preset.md`, and reload the home page (the server rereads them every time). A malformed one is skipped, with the reason in the server log. API: `GET /api/presets` (without prompts), `GET /api/presets/<id>/poster.jpg|preview.webm`.

## Interface languages

- Three: Chinese, English, Japanese. The switch "中 / EN / 日" is only on the home page (next to the theme button) and in the block gallery; the editor has no switch and follows the setting. The choice is stored in the browser's localStorage as `tellcut.lang` (`zh` / `en` / `ja`); when nothing is stored, the browser language decides (`zh…` Chinese, `ja…` Japanese, anything else English).
- The editor's "labels" (button text, dialog titles, field names, panel and tab titles) are English in every language; its "descriptions" (tips, aria-labels, body text, input placeholders, empty states, progress and status messages, confirmation questions, the chat's status text) follow the language. Not translated: text drawn by blocks, project and file names, Claude's replies, server error messages, check reports.
- New UI text: add the same key to the three dictionaries `apps/editor/src/i18n/zh.ts`, `en.ts`, `ja.ts` (a test checks the keys match and none is empty), and use `t('key')` in the component; tips use `data-tip` plus `aria-label` (shown by TooltipLayer), not `title=`. A missing translation falls back to English, then Chinese.
- New blocks (or sound effects, score styles, recipes): add display names and descriptions to `apps/editor/src/i18n/blocks.en.ts` and `blocks.ja.ts` (`blocks.test.ts` checks nothing is missing); Chinese uses the block's own name. Each parameter's English and Japanese name and description go in `params.en.ts`, `params.ja.ts` (keyed `<type id>.<param key>`, checked by `params.test.ts`): the gallery's parameter section shows names in the UI language, and the editor's properties panel shows the English name with the description in a tooltip; parameter values (default text, dropdown options) aren't translated, nor is `ParamDef.label` itself. Category and plugin group names are not in those two files but in the three dictionaries `zh.ts` / `en.ts` / `ja.ts` (`cat.block.*`, `cat.sfx.*`, `group.*`).
- The page chat replies in the UI language; captions, voice-over and on-screen text in the film follow the conversation, or the UI language when none is given.

## Development

```
packages/   engine (project format, edit commands, stage, audio), media-node (ffmpeg, analysis, export, outside programs),
            plugin-common (common.* shared blocks and golden images), plugins (the plugin list: core + common)
apps/       player (the browser player, shared by preview and export), editor (the Preact editor and home page), server (local server and page chat)
tools/      command-line tools (new, inspect, cut, check, tellcut, voice, score, setup…), cut/ (Cut API and recipes), py/, ps/ (Python / PowerShell scripts)
guides/     what agents read to make films (workflow, quality), video genres (genres/) and presets (presets/<id>/)
score-library/  promoted score styles    providers.json  which outside tool to use    sources.json  switches for outside media sources
docs/       this reference and the README pictures (docs/readme/)
```

`packages/*` and `apps/*` are npm workspaces; `tools/` holds scripts run directly with tsx.
Outside programs (ffmpeg, ffprobe, uv, Chrome, claude) are always found through `packages/media-node/src/deps.ts` (environment variable → `vendor/` → usual locations → PATH).
The Python environment is defined by `pyproject.toml` and `uv.lock` and installed in `.venv/`, with Python itself in `vendor/python` and models in `models/`; the system Python is never used.

| Purpose | Command |
|---|---|
| Install / check the environment / hand-over copy | `npm run setup`, `npm run doctor`, `npm run handover -- <folder>` |
| Tests / type check | `npm test` (everything), `npm run test:fast` (the group that needs no Chrome), `npm run test:browser` (export, check, golden, editor e2e), `npm run typecheck` |
| Build | `npm run build:player`, `npm run build:editor` |
| Editor development mode | `npm run server` plus `npm run dev:editor`, then open `http://localhost:5173/editor/?id=<project>` |
| Golden images of the shared blocks | `npm run golden -- [--update] [<name prefix>]` (images in `packages/plugin-common/golden/`) |
| Download fonts | `npm run fonts` (setup runs it; needed by preview and export) |
| Tokens used by a chat | `npm run tokens -- <id \| home>`, `npm run tokens -- --session <file.jsonl>` (1-hour and 5-minute cache separately, number of full rewrites, estimate at list prices), `--subagents <file.jsonl>` (including every subagent it sent) |
| Render queue, spot check | `npm run batch:render -- <id> [--slots 2]` (at most two exports at once), `npm run batch:qc -- <id>` (spot-check images of a finished export) |
| Outside tools (speech, transcription, text recognition, faces) and their status | `npm run providers [-- --all]`; which one is used is set in `providers.json` |
| Outside media (sound effects, music, pictures, maps…): search, download, data lookups | `npm run tellcut -- assets sources｜source <id>｜search <keyword>｜get <project> <ref> [<ref>…] [--from seconds --len seconds]｜credits <project>｜data <source> <query>｜map <project> --at <place> (or --from … --to …)`; switches in `sources.json` (defaults) and `sources.local.json` (personal, not in git; keys and `contact` too, see "API keys" in the [README](../README.md#api-keys-optional)). BBC Sound Effects (`bbc-sfx`) is off by default: under the RemArc licence its sounds are for personal, educational and research use only and may not be redistributed |
| Switches and status of outside media sources | `npm run sources [-- --live]` (goes online to check; `doctor` lists it too); a source found broken is hidden from the agents and comes back when a later check passes |

**After changing `packages/*/src` or `apps/player/src`, rebuild the player** (`npm run build:player`): export, `check`, `frames` and golden all run the built player. When `check` finds the build older than the source it runs `build:player` first by itself; only if the build fails does it report an error, skipping the picture and sound checks.

The HTTP API has no separate list: the routes are in the files of `apps/server/src/` (`projects.ts` projects and history, `media.ts` analysis and media, `export.ts` export, `jobs.ts` jobs and progress, `live.ts` proposals and live sync with the editor, `requests.ts` "Ask Agent…" requests, `gallery.ts` the block gallery, `fs.ts` folder browsing for import, `presets.ts` presets, `sources.ts` the chat box's API menu, `delete.ts` project deletion, `chat/routes.ts` the chat; `cleanup.ts` is not a route but clears temp files left from last time at start-up), each with a description at the top. The server only accepts local connections.
