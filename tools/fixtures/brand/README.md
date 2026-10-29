# Test logos for brand films

For the tests of `tellcut logo`, and the input of the brand preset's acceptance films 1 and 2. All drawn by hand, so there is no licence question.

- `tellcut.svg`: the Tellcut icon. A blue rounded square with a white triangle, the shape drawn in the trial films' code. Can be extruded.
- `bakery.png`: the logo of a made-up bakery. 256×256, transparent background, a `#c8752a` circle with a small `#5a3418` square in the middle. Made with:

```
ffmpeg -f lavfi -i "color=c=0xc8752a:s=256x256,format=rgba,geq=r='if(between(X\,108\,148)*between(Y\,108\,148)\,90\,200)':g='if(between(X\,108\,148)*between(Y\,108\,148)\,52\,117)':b='if(between(X\,108\,148)*between(Y\,108\,148)\,24\,42)':a='if(lt(hypot(X-128\,Y-128)\,110)\,255\,0)'" -frames:v 1 bakery.png
```
- `tellcut-intro.md`: the English introduction for acceptance film 1, written as a company introduction, not a storyboard. Its wording and numbers come from the third trial film; the web address is `tellcut.app`.
- `bakery-intro.md`: the Chinese introduction for acceptance films 2 and 3 (the made-up bakery). It deliberately has no numbers, place or web address: it shows whether the agent makes up numbers for the proof section, or forces a globe in.
