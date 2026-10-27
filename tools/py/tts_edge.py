# One narration line through edge-tts (Microsoft's online voices) for Tellcut's edge provider.
# Run: uv tool run --from edge-tts==<version> python tts_edge.py   (JSON on stdin, not through the repo .venv)
#   in : {"text", "voice", "rate" (percent, +8 = faster), "pitch" ("+0Hz"), "out" (mp3 path)}
#   out: {"words": [{"text", "t", "d"}]}  seconds from the start of the audio (stdout, last line)
import asyncio
import json
import sys

import edge_tts


async def main(req):
    rate = int(round(req.get("rate") or 0))
    comm = edge_tts.Communicate(req["text"], req["voice"], rate=f"{rate:+d}%", pitch=req.get("pitch") or "+0Hz", boundary="WordBoundary")
    audio, words = bytearray(), []
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            words.append({"text": chunk["text"], "t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
    if not audio:
        raise SystemExit("edge-tts returned no audio (no network, or the voice name is wrong?)")
    with open(req["out"], "wb") as f:
        f.write(audio)
    print(json.dumps({"words": words}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main(json.loads(sys.stdin.read())))
