# Simplified → Traditional (Taiwan phrasing, the same s2twp the transcripts use) for a batch of texts (toolkit phase 5):
# the leak check compares what OCR read off the footage with the transcript's words.
# stdin: a JSON list of strings (UTF-8). stdout: the same list converted, as ASCII-only JSON.
import json
import sys

from opencc import OpenCC

texts = json.loads(sys.stdin.buffer.read().decode("utf-8"))
cc = OpenCC("s2twp")
print(json.dumps([cc.convert(t) for t in texts]))
