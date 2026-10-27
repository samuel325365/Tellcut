import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { readProposal } from '@tellcut/media-node';
import { fixture } from '../packages/engine/src/commands/test-fixture.ts';
import { decideOnDisk, proposeOnDisk, showProject } from './tellcut.ts';
import { saveRequest, projectHash as hashOf } from '@tellcut/media-node';
import { describeRequest, logoArgs } from './tellcut.ts';

function proj(p: unknown = fixture()) {
  const d = mkdtempSync(join(tmpdir(), 'cli-'));
  writeFileSync(join(d, 'project.json'), JSON.stringify(p, null, 2) + '\n');
  return d;
}
const read = (d: string) => JSON.parse(readFileSync(join(d, 'project.json'), 'utf8'));

test('show lists every track and item with its times, source range and children', () => {
  const p: any = fixture(); p.tracks[1].magnetic = true;
  const out = showProject(parseProject(p));
  expect(out).toMatch(/▸ v .*磁吸/);
  expect(out).toMatch(/c2 +4\.00–8\.00 +素材 s 10\.00–18\.00/);
  expect(out).toMatch(/↳ tap .*blk/);
  // a shared block shows its gallery handle, so a request that says MRK-03 can be matched to the item
  p.tracks[0].items[0].type = 'common.stamp';
  expect(showProject(parseProject(p))).toMatch(/blk .*common\.stamp（MRK-03）/);
});

test('accepting on disk applies the proposal, keeps the old version and closes it', () => {
  const d = proj();
  proposeOnDisk(d, '剪短', [{ op: 'trimEnd', id: 'c1', dt: -1 }]);
  expect(decideOnDisk(d, 'accept')).toEqual({ outcome: 'accepted' });
  expect(read(d).tracks[1].items[0].end).toBe(3);
  expect(readProposal(d)).toBeNull();
});

test('a proposal made stale by a later edit is closed as stale and the project is left alone', () => {
  const d = proj();
  proposeOnDisk(d, '剪短', [{ op: 'trimEnd', id: 'c1', dt: -1 }]);
  const p = read(d); p.tracks[1].items.shift(); writeFileSync(join(d, 'project.json'), JSON.stringify(p));
  const r = decideOnDisk(d, 'accept');
  expect(r).toMatchObject({ outcome: 'stale', reason: expect.stringContaining('c1') });
  expect(read(d).tracks[1].items).toHaveLength(1);
});

test('rejecting on disk just closes the proposal', () => {
  const d = proj();
  proposeOnDisk(d, 'x', [{ op: 'trimEnd', id: 'c1', dt: -1 }]);
  expect(decideOnDisk(d, 'reject')).toEqual({ outcome: 'rejected' });
  expect(read(d).tracks[1].items[0].end).toBe(4);
});

test('show keeps each item on one line even when its text has line breaks', () => {
  const p: any = fixture();
  p.tracks.find((t: any) => t.id === 'sc').items[0].params = { text: '第一行\n第二行' };
  expect(showProject(parseProject(p))).toMatch(/blk .*「第一行 第二行」/);
});


test('request shows the instruction, the selected lines, how the source is used, and that it was not analysed', () => {
  const d = proj(), text = readFileSync(join(d, 'project.json'), 'utf8'), p = parseProject(JSON.parse(text));
  const r = { id: 'r1', created: '2026-10-16T00:00:00Z', text: '換一個更亮的鏡頭', selection: ['c2'], playhead: 5, range: [4, 8] as [number, number], base: hashOf(text) };
  saveRequest(d, r);
  expect(describeRequest(d, p, r, text)).toMatch(/素材檔不在：.*離線/);
  writeFileSync(join(d, 's.mp4'), 'not a real video');   // present but never analysed
  const out = describeRequest(d, p, r, text);
  expect(out).toMatch(/指示：換一個更亮的鏡頭/);
  expect(out).toMatch(/c2 +4\.00–8\.00/);
  expect(out).toMatch(/素材 s：30\.00 秒/);
  expect(out).toMatch(/片中已用：1\.00–5\.00、10\.00–16\.00/);   // c2 freezes 3 s in (speed 2)
  expect(out).toMatch(/尚未分析（npm run inspect -- /);
  expect(out).not.toMatch(/送出後專案有被改過/);
  expect(describeRequest(d, p, r, text + ' ')).toMatch(/⚠ 送出後專案有被改過/);
});

test('a request without a selection lists what is under the playhead', () => {
  const d = proj(), text = readFileSync(join(d, 'project.json'), 'utf8'), p = parseProject(JSON.parse(text));
  const out = describeRequest(d, p, { id: 'r2', created: 'x', text: '加字幕', selection: [], playhead: 5, range: null, base: hashOf(text) }, text);
  expect(out).toMatch(/播放頭 5\.00 秒附近/);
  expect(out).toMatch(/c2 +4\.00–8\.00/);
});

test('request: a frozen clip uses only the source up to its freeze; a photo gives its file to look at', () => {
  const base: any = fixture();
  base.sources.ph = { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' };
  base.tracks[1].items.push({ id: 'pc', source: 'ph', in: 0, speed: 1, start: 8, end: 11, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  const d = proj(base), text = readFileSync(join(d, 'project.json'), 'utf8'), p = parseProject(JSON.parse(text));
  const out = describeRequest(d, p, { id: 'r', created: 'x', text: 'y', selection: ['c2', 'pc'], playhead: 0, range: [4, 11], base: hashOf(text) }, text);
  expect(out).toMatch(/片中已用：1\.00–5\.00、10\.00–16\.00/);   // c2 freezes 3 s in at speed 2 → 10–16
  expect(out).toMatch(/素材 ph：.*照片/);
  expect(out).toMatch(/照片檔：.*p\.jpg/);
});

test('logo takes the file wherever --name is written', () => {
  expect(logoArgs(['logo.svg', '--name', 'Acme'])).toEqual({ file: 'logo.svg', name: 'Acme' });
  expect(logoArgs(['--name', 'Acme', 'logo.svg'])).toEqual({ file: 'logo.svg', name: 'Acme' });
  expect(logoArgs(['--name', 'Acme'])).toEqual({ file: undefined, name: 'Acme' });
  expect(logoArgs(['logo.png'])).toEqual({ file: 'logo.png', name: undefined });
});
