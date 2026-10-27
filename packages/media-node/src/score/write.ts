// A generated score as a project's music (toolkit phase 3): projects/<id>/media/score-<name>.wav + .json, registered in project.json `media`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveProjectFile } from '../projectfile.ts';
import { encodeWav16, generateScore, type ScoreInfo, type ScoreOptions } from './render.ts';

export interface WrittenScore { mediaId: string; wav: string; /** path relative to the project */ rel: string; info: ScoreInfo }

/** Generate the score and write media/score-<name>.wav and .json, without touching project.json (the cut registers it itself). */
export function scoreFiles(dir: string, o: ScoreOptions & { name?: string }): WrittenScore {
  const name = (o.name ?? o.style).replace(/[^\w-]/g, '-'), mediaId = `score-${name}`;
  const s = generateScore(o);
  mkdirSync(join(dir, 'media'), { recursive: true });
  const rel = `media/${mediaId}.wav`, wav = join(dir, rel);
  writeFileSync(wav, encodeWav16(s.L, s.R, s.info.sampleRate));
  writeFileSync(join(dir, 'media', `${mediaId}.json`), JSON.stringify(s.info, null, 1));
  return { mediaId, wav, rel, info: s.info };
}

/** Generate the score, write its files and register it as `score-<name>` in the project's media (an existing one of that name is replaced). */
export function writeScore(dir: string, o: ScoreOptions & { name?: string }): WrittenScore {
  const file = join(dir, 'project.json');
  if (!existsSync(file)) throw new Error(`${dir} 裡沒有 project.json`);
  const r = scoreFiles(dir, o);
  const project = JSON.parse(readFileSync(file, 'utf8')) as { media: Record<string, { path: string; duration?: number }> };
  project.media[r.mediaId] = { path: r.rel, duration: r.info.duration };
  saveProjectFile(dir, project, 'score');
  return r;
}
