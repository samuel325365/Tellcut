// Provider registry (toolkit phase 3): turns tellcut/providers.json into the provider objects the tools use.
import { loadProvidersConfig, type ProvidersConfig } from './config.ts';
import { edgeTts } from './edge.ts';
import { fakeFaces, fakeOcr, fakeTranscribe, fakeTts } from './fake.ts';
import { mediapipeFaces } from './faces-mediapipe.ts';
import { windowsOcr } from './ocr-windows.ts';
import type { Capability, FacesProvider, OcrProvider, TranscribeProvider, TtsProvider } from './types.ts';
import { fasterWhisper } from './whisper.ts';

export * from './types.ts';
export * from './config.ts';
export * from './fake.ts';
export { fasterWhisper } from './whisper.ts';
export { edgeTts, EDGE_VOICES } from './edge.ts';
export { windowsOcr, parseOcrLines } from './ocr-windows.ts';
export { mediapipeFaces, parseFaceLines, faceModel } from './faces-mediapipe.ts';

type Factory<T> = (options: Record<string, unknown>) => T;
/** every provider Tellcut knows by id (a new third-party tool = a new entry here and a class next to the others) */
export const TTS_FACTORIES: Record<string, Factory<TtsProvider>> = {
  edge: (o) => edgeTts(o as { version?: string; voice?: string }),
  fake: () => fakeTts(),
};
export const TRANSCRIBE_FACTORIES: Record<string, Factory<TranscribeProvider>> = {
  'faster-whisper': (o) => fasterWhisper(o as { model?: string }),
  fake: () => fakeTranscribe(),
};
export const OCR_FACTORIES: Record<string, Factory<OcrProvider>> = {
  windows: (o) => windowsOcr(o as { lang?: string }),
  fake: () => fakeOcr(),
};
export const FACES_FACTORIES: Record<string, Factory<FacesProvider>> = {
  mediapipe: (o) => mediapipeFaces(o as { model?: string }),
  fake: () => fakeFaces(),
};

export interface Providers { readonly tts: TtsProvider; readonly transcribe: TranscribeProvider; config: ProvidersConfig }

function pick<T>(cap: Capability, factories: Record<string, Factory<T>>, config: ProvidersConfig): T {
  const id = config[cap].use, make = factories[id];
  if (!make) throw new Error(`providers.json 的 ${cap} 用「${id}」，但沒有這個提供者；有：${Object.keys(factories).join('、')}`);
  return make(config[cap].options[id] ?? {});
}

/** One capability's provider on its own: asking for speech-to-text never needs the speech engine to exist. */
export const ttsProvider = (config: ProvidersConfig = loadProvidersConfig()) => pick('tts', TTS_FACTORIES, config);
export const transcribeProvider = (config: ProvidersConfig = loadProvidersConfig()) => pick('transcribe', TRANSCRIBE_FACTORIES, config);
export const ocrProvider = (config: ProvidersConfig = loadProvidersConfig()) => pick('ocr', OCR_FACTORIES, config);
export const facesProvider = (config: ProvidersConfig = loadProvidersConfig()) => pick('faces', FACES_FACTORIES, config);

/** The providers `config` names (default: tellcut/providers.json), each built when first asked for; an unknown name throws a sentence then. */
export function createProviders(config: ProvidersConfig = loadProvidersConfig()): Providers {
  return { get tts() { return ttsProvider(config); }, get transcribe() { return transcribeProvider(config); }, config };
}
