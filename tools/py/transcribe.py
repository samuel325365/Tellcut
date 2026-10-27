# Speech to text for Tellcut: python transcribe.py <media> <out.json> [model]
# faster-whisper on the CPU (int8); Chinese is converted to Traditional (Taiwan) with OpenCC.
# The model lives as plain files in tellcut/models/whisper/<model> (TELLCUT_MODELS_DIR, set by Node): npm run setup puts it
# there; if it is missing it is downloaded there on first use. (Hugging Face's own cache keeps two copies on Windows.)
import json
import os
import sys

from faster_whisper import WhisperModel, download_model


def model_path(name):
    """The local folder of a model name (a path is used as given)."""
    if os.path.isdir(name):
        return name
    root = os.environ.get('TELLCUT_MODELS_DIR')
    if not root:
        return name
    folder = os.path.join(root, 'whisper', name)
    done = os.path.join(folder, '.tellcut-complete')   # written last (also by npm run setup): no stamp = an interrupted copy
    if not (os.path.isfile(os.path.join(folder, 'model.bin')) and os.path.isfile(done)):
        download_model(name, output_dir=folder)   # huggingface_hub fills in what is missing or broken
        with open(done, 'w') as f:
            f.write('downloaded')
    return folder


def main(src, out, model_name):
    model = WhisperModel(model_path(model_name), device='cpu', compute_type='int8')
    segments, info = model.transcribe(src, word_timestamps=True, vad_filter=True)
    fix = lambda s: s
    if info.language == 'zh':
        from opencc import OpenCC
        conv = OpenCC('s2twp')
        fix = conv.convert
    segs = [{'start': round(s.start, 3), 'end': round(s.end, 3), 'text': fix(s.text.strip()),
             'words': [{'start': round(w.start, 3), 'end': round(w.end, 3), 'word': fix(w.word)} for w in (s.words or [])]}
            for s in segments]
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'language': info.language, 'segments': segs}, f, ensure_ascii=False)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else os.environ.get('TELLCUT_WHISPER_MODEL', 'large-v3-turbo'))
