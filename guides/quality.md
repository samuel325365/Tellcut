# What makes a good film

Every film is judged by this, wherever it is made (the page chat, a developer's batch subagent). How to make it is in `guides/workflow.md`.

Most of this holds for a film of any length. The lines marked **Short-form** are for vertical feed videos up to about 3 minutes (Reels, Shorts, TikTok), which is most of what Tellcut makes. A longer film loosens them in proportion (the hook may take longer to land, lines on screen may be longer); the preset and what the user says come first either way.

## Make people want to watch

- **Hook early**: a question, a contrast, the strongest shot or the strongest line. **Short-form**: within the first 2 seconds.
- **One through-line runs through the film, and it can be seen on screen**: first write one sentence for it (for example "diving deeper and deeper"), then how it shows on screen (for example "a depth gauge running down, the background darkening with depth"). Signboards, counters, maps, meters and chapters all work; it must not live only in the captions, nor only in the storyboard.
- **End with closure**: a conclusion, a twist, or a callback to the opening.
- **Length**: as the user says; otherwise as the preset says; otherwise the genre card's "Length" (`guides/genres/<id>.md`) (**Short-form**: mostly within 60–90 s). Lots of footage is no reason to run long: pick the best parts and drop the rest.

## Make it easy to follow

- **Each section says one thing**; information comes in layers, so the viewer can follow without knowing anything first.
- Say a technical term in plain words first, then name it in small type; **at most one hero number per screen**.
- **On-screen text**: letters at least 48 px tall (vertical: on a 1080 width; horizontal: on a 1080 height), and on screen long enough to read. **Short-form** lines: at most 12 characters in Chinese or Japanese, about 32 characters (5–6 words) in English and other Latin-script languages.
- **On-screen text is in the viewer's language**: as the user says; otherwise the language of the conversation (the UI language), with foreign-language speech subtitled in it. That includes every word inside effects and blocks (labels, buttons, dates, stamps, UI words of phone screens), not only the captions.

## Get it right

- **Do not overstate facts**: correlation is not causation, animal studies are not people; say what you are unsure of cautiously. Where something is disputed, show the dispute as it is.
- **Use only what the footage or a source really has**: never invent names of people or shops, prices, dates, years or places. Genre cards and presets only give general rules. A video's title can overstate: check what its footage really shows.
- **Check who is speaking against their lips**: where a caption names the speaker, or the story rests on "someone said this line", look at frames first to confirm who said it; if you cannot confirm it, do not label it, or use another line.

## Do not look like a template

- Whether to use a library block or write a new one is decided by **whether the result looks good and suits this film**, not by "the library has something that will just about do": a checkered sticker look does not suit a deep-sea mystery, and a small badge cannot carry a film's through-line.
- The style (the theme's colours, fonts, background) suits the subject. From the viewer's seat: anywhere that reads at a glance as "this is a template" is where to write something new or adjust.
- A recipe is only a skeleton: a film that is just a recipe with nothing added is usually a poor film.

## Technical floor

- The footage's own text (subtitles, labels, watermarks) must not show, above all not flashing at a cut or half cut off by a frame.
- Stamps, counters, cards and labels never sit on a face; a speaker's label never lingers onto the next person's shot.
- Slow motion no slower than 0.5× (there is no frame interpolation; slower stutters).
- No noise or grain that changes the whole frame every frame: the output file balloons.
- Fonts: only the player's built-in ones, or OFL-licensed fonts (subset to the characters used). **Never copy Windows system fonts** (DFKai-SB and the like) into a project: they may not be redistributed. Use a font made for the script: a Chinese font for Chinese, a Latin face for English (the fonts loaded are listed under "Shared blocks and theme" in the workflow).
- Sound: you cannot hear the result. The balance of music and original sound, the sound at cuts, and the TTS's reading of words that can be read more than one way all need a person to listen; never claim the music sounds good or the narration sounds natural.

## Before delivering, look with a critical eye

Look at the contact sheet of `check --sheet` and ask, item by item:

1. Is the length within the target?
2. Can the through-line be seen? Does the hook land early enough (**Short-form**: within the first 2 s)?
3. Is the text big enough on a phone? Is any of it cut off, or outside the safe area?
4. Are there large empty areas in the frame?
5. Does the style suit the subject? Is anything obviously a template?
6. Does the footage's own text show (check's 「畫面裡有原片自己的字」)? Is every word on screen in the film's language?

For each problem, write where it is (which second, which item) and how to fix it. **What you can see and can fix, fix yourself first**; only ask the user about trade-offs of taste. At most two rounds of fixes: after two rounds, deliver with an explanation of what is left instead of grinding on.
