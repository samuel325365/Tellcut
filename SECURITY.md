# Security

## Reporting a problem

Please don't open a public issue for a security problem. Report it privately on GitHub instead: on the repository's **Security** tab, click **Report a vulnerability**. Say what you found, how to reproduce it, and what someone could do with it. You'll get an answer there.

## Supported versions

Tellcut is still at 0.x. Only the latest release and `main` get fixes.

## What Tellcut trusts

Tellcut runs on your own PC, for you. Knowing where its limits are helps you use it safely and tells you what counts as a security problem.

**The server is for this PC only.** `npm run server` listens on `127.0.0.1` and refuses requests that name another host, come from another site, or change something from a page that isn't its own. Don't put it behind a proxy or forward its port to make it reachable from other machines: anyone who can reach it can use the agent and read your projects. A way around these checks from a web page is a security problem; please report it.

**The page chat runs Claude Code on your account.** Each message starts a headless Claude Code with its own settings: it may read files, run only Tellcut's own `npm run` commands, and write only inside a project (its cut, effects, narration and a few others). Common secret folders (`~/.ssh`, `~/.claude`, cloud credentials, `sources.local.json`) are blocked. These are guardrails, not a sandbox: the agent writes effects as JavaScript, which runs when the project plays or renders. Treat what you type into the chat, and footage or links you give it, as instructions to an assistant that can change your projects. A way for the chat to do more than this (run other commands, write outside a project, read a blocked file) is a security problem; please report it.

**A project is code.** A project's `cut.ts`, `fx/` effects and music styles are JavaScript that runs with your user's rights when you open, preview or render it. Only import or download projects (`npm run examples`, a shared zip, a folder from someone else) from people you trust, as you would any other program.

**Footage and links.** Tellcut reads media with ffmpeg and downloads links with yt-dlp, so a flaw in either is a flaw in Tellcut too. Each release pins their versions: after updating Tellcut, run `npm run setup` again so your copies (ffmpeg in `vendor/`, yt-dlp in `.venv/`) match.
