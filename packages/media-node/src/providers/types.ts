// Third-party tools behind small interfaces (toolkit phase 3): the rest of Tellcut asks for a capability ("speak this", "transcribe that"),
// and tellcut/providers.json says which tool answers. Replacing a tool means a new provider class and one line in that file.

export interface ProviderStatus {
  /** can it run right now */
  ok: boolean;
  version?: string;
  /** one line for people: what is wrong, or what it is using */
  detail: string;
  /** the command that fixes it, when it is not ok */
  install?: string;
}

export interface Provider {
  id: string;
  label: string;
  /** whether it needs the internet to work */
  online: boolean;
  check(): Promise<ProviderStatus>;
}

export interface TtsRequest {
  text: string;
  /** a voice of this provider (see `voices`); absent: the provider's default */
  voice?: string;
  /** speaking speed in percent relative to normal: +8 is 8 % faster, -10 slower */
  rate?: number;
  /** a pitch shift as the engine writes it (edge: "+5Hz"); absent: the voice's own */
  pitch?: string;
  /** where the audio goes (wav) */
  out: string;
  signal?: AbortSignal;
}
export interface TtsWord { text: string; start: number; end: number }
/** `words: null` when the engine gives no word times: the caller aligns the audio with the transcribe provider */
export interface TtsResult { dur: number; words: TtsWord[] | null }
export interface TtsProvider extends Provider {
  voices(): string[];
  synth(req: TtsRequest): Promise<TtsResult>;
}

export interface TranscribeProvider extends Provider {
  /** the model it transcribes with: with the id, the record of who made a transcript (a change makes it again) */
  readonly model?: string;
  /** speech in `src` to a transcript JSON at `out` (the shape of Transcript in @tellcut/engine) */
  transcribe(src: string, out: string, o?: { model?: string; signal?: AbortSignal }): Promise<void>;
}

/** a line of text found in an image, its box in pixels (toolkit phase 5) */
export interface OcrLine { text: string; box: [number, number, number, number] }
export interface OcrResult { image: string; width: number; height: number; lines: OcrLine[] }
export interface OcrProvider extends Provider {
  /** the text in each image, in the order given (one run for the whole batch) */
  read(images: string[], o?: { signal?: AbortSignal }): Promise<OcrResult[]>;
}

/** a face in a still, as fractions of the picture: its box, the middle of its mouth and the mouth's width (toolkit phase 5) */
export interface FaceInfo { box: [number, number, number, number]; mouth: [number, number]; mouthW: number }
export interface FacesProvider extends Provider {
  /** the faces in each image, in the order given (one run for the whole batch) */
  detect(images: string[], o?: { signal?: AbortSignal }): Promise<FaceInfo[][]>;
}

export type Capability = 'tts' | 'transcribe' | 'ocr' | 'faces';
