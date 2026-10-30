# Installing Tellcut

Tellcut is a video editor you use in your browser, with an agent beside it that can do the editing for you. Everything lives in this `tellcut` folder. Do the steps below once and it's ready.

## 1. Install these first

| You need | Notes |
|---|---|
| Windows 10 or 11 (64-bit) | Only Windows is supported for now |
| [Node.js](https://nodejs.org/) 24 or later | The LTS version is fine. Check it with `node -v` in a terminal |
| [Google Chrome](https://www.google.com/chrome/) | Exporting video needs the regular Chrome (Chromium won't do) |
| [Claude Code](https://claude.com/claude-code) 2.1.242 or later, **signed in** | The chat in the editor runs on it. After installing, run `claude` in a terminal once and sign in |
| About 4 GB of disk space and an internet connection | The first install downloads about 2 GB |

You don't need to install Python, ffmpeg or uv yourself: the next step downloads them into the `tellcut` folder.

## 2. Install

Open a terminal (PowerShell or Windows Terminal) in the `tellcut` folder and run:

```
npm run setup
```

It will:

1. Install the npm packages.
2. Download uv and ffmpeg into `vendor/` (each file is checked against its SHA-256 and rejected if it doesn't match).
3. Set up Python: Python 3.12 itself goes into `vendor/python`, the packages into `.venv/`.
4. Download the speech recognition model (about 1.6 GB) into `models/whisper/`, and the face detection model (about 4 MB, used for stickers that follow a mouth and for keeping faces in frame in vertical) into `models/mediapipe/`.
5. Download the fonts and build the player and the editor.
6. Finish with a table that ticks or crosses each item. Every cross comes with what to do about it.

It takes about 10–20 minutes, mostly downloading. If it gets interrupted, just run `npm run setup` again: whatever is already installed is skipped.

The last step sends Claude one tiny request to confirm you're signed in (it costs a handful of tokens). To skip it, run `npm run setup -- --no-login` instead.

## 3. Start

```
npm run server
```

Then open <http://127.0.0.1:5174/editor/> in your browser.

- **Home page**
  - Your projects are listed on the left.
  - In the chat on the right, **＋** picks footage from your computer (videos, photos, music, from any folder). Then tell the agent what you'd like to make.
  - The menu above the chat switches between **Home** and a project's conversation (the same thread as in that project's editor), so you can carry on from the home page.
  - **Block gallery** lets you see, hear and try every effect, sound and music style.
- **Chat**: the agent analyses your footage, writes a storyboard and goes straight on to a first cut (change direction whenever you like). When it's done, click the project on the left to open it in the editor, adjust it and export. The first analysis of a long video (making the transcript) can take from a few minutes to a quarter of an hour; the agent carries on by itself when it's ready, so you don't need to watch. Under every reply you'll see how many tokens it used; the conversation total also shows roughly what that would cost at Claude API prices.
- The server only accepts connections from this computer. To stop it, press Ctrl+C in the terminal.
- To use another port: `npm run server -- --port 5200`.

Footage can live in any folder. If you'd like to keep it in one place, create a `sources` folder inside `tellcut`: git ignores it, and the import window lists it directly.

## 4. Example projects (optional)

Finished films made in Tellcut, as projects you can open, play and take apart:

```
npm run examples                 # list them
npm run examples -- <name>       # download one into your projects
npm run examples -- --all        # download them all
```

Each comes with its footage and its finished film (in the project's `exports/`). Open it from the home page like any project of yours; the first time, Tellcut analyses its footage again. A project with the same name already in `projects/` is never overwritten.

## If something goes wrong

Run this first:

```
npm run doctor
```

It only checks; it doesn't install anything. It lists what's wrong and how to fix it. Its output (like `npm run setup`'s) is in Traditional Chinese. Common cases:

| Problem | What to do |
|---|---|
| Google Chrome not found | Install Chrome. If it's installed somewhere unusual, set the environment variable `TELLCUT_CHROME` to the path of `chrome.exe` |
| Claude Code not found, too old, or not signed in | Install Claude Code (if it's too old, run `claude update`), then run `claude` in a terminal and sign in |
| Downloads fail (a company network blocks them) | Run `npm run setup` again. If your network goes through a proxy, set `HTTPS_PROXY` and `NODE_USE_ENV_PROXY=1` first. If it still fails, install ffmpeg 8 and uv yourself and point `TELLCUT_FFMPEG`, `TELLCUT_FFPROBE` and `TELLCUT_UV` at them; setup won't download them again |
| The picture doesn't match the code, or an export uses an old effect | `npm run build:player`, then `npm run build:editor` |
| The port is already in use | `npm run server -- --port <another number>` |
| "Text recognition" (「文字辨識」) is crossed (no zh-Hant-TW text recognition) | In Windows Settings → Time & language → Language & region, add "Chinese (Traditional, Taiwan)" and install "Optical character recognition" in its language options. Tellcut works without it; `check` just can't tell whether bleeped words show through the source's own subtitles |

Environment variables you can set:

| Variable | What it does |
|---|---|
| `TELLCUT_FFMPEG`, `TELLCUT_FFPROBE` | Use your own ffmpeg / ffprobe |
| `TELLCUT_UV` | Use your own uv |
| `TELLCUT_CHROME` | Where Chrome is |
| `TELLCUT_CLAUDE` | The command that starts Claude Code |
| `TELLCUT_WHISPER_MODEL` | Use another speech recognition model, such as `small`. It's downloaded into `models/whisper/` the first time it's used |
| `TELLCUT_MODELS_DIR` | Where the models live (default `tellcut/models`); setup, doctor, speech recognition and face detection all look here |
| `TELLCUT_CONTACT` | The contact (an email or a URL) that outside sources such as Wikimedia receive in the identifying header of each download. Without it, `contact` in `sources.local.json` is used |
| `PIXABAY_API_KEY`, `FREESOUND_API_KEY`, `CARTO_API_KEY` | Keys for outside sources (the `keyEnv` in `sources.json`). Without them, `keys` in `sources.local.json` is used; a source with no key can't be used. Where to get each key: [README › API keys](README.md#api-keys-optional) |
| `TELLCUT_URL` | The Tellcut server the command-line tools (`npm run tellcut`, `new`, `inspect`) talk to. Without it they find the server running on this computer (`.cache/server.json`), and fall back to `http://127.0.0.1:5174`; the page chat sets it to the current server. You normally don't need it |

## What setup creates

`node_modules/`, `vendor/`, `.venv/`, `.cache/`, `models/`, `apps/*/dist/` and `apps/player/public/fonts/` are all made by `npm run setup` and aren't in git. If one breaks, delete it and run `npm run setup` again.

Your work is in `projects/<project>/`:
- `project.json` is the project itself.
- `media/` holds the footage you imported or that was generated.
- `exports/` holds the exported videos.

## Updating

When you get a new version of `tellcut`, run `npm run setup` again. It adds new packages and versions and keeps what you already have.
