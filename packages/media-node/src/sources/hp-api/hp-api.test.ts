import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { hpApi } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
const DOBBY = 'b1f099e4-c360-4c61-af9d-57a3e49935eb';
let dir: string, sent: string[];
const fakeFetch = (async (url: string | URL) => {
  const u = String(url), p = new URL(u).searchParams;
  sent.push(u);
  const json = (b: string, status = 200) => new Response(b, { status, headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/api/characters')) return json(fx('hp-characters'));
  if (u.endsWith('/api/spells')) return json(fx('hp-spells'));
  if (u.includes('potterdb.com/v1/characters/')) return u.endsWith(DOBBY) ? json(JSON.stringify({ data: JSON.parse(fx('pdb-characters-dobby')).data[0] })) : json('{"errors":[{"status":"404"}]}', 404);
  if (u.includes('potterdb.com/v1/characters')) return json(p.get('filter[name_cont]') === 'Dobby' ? fx('pdb-characters-dobby') : '{"data":[]}');
  if (u.includes('potterdb.com/v1/spells')) return json(p.get('filter[incantation_cont]') === 'Expelliarmus' ? fx('pdb-spells-expelliarmus') : '{"data":[]}');
  // wiki images named .jpg come as WebP
  return new Response('img', { headers: { 'content-type': u.includes('wikia') ? 'image/webp' : 'image/jpeg' } });
}) as typeof fetch;
const ctx = (): SourceCtx => {
  const http = createHttp({ source: 'hp-api', cacheDir: dir, limits: hpApi.limits, fetch: fakeFetch });
  return { http, sub: () => http, options: {}, tmpDir: dir };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hp-')); sent = []; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('search: HP-API\'s portraits by name or actor first, then PotterDB\'s wiki pictures', async () => {
  const hermione = await hpApi.search({ text: 'Hermione', opts: {}, limit: 5 }, ctx());
  expect(hermione[0]).toMatchObject({ source: 'hp-api', kind: 'image', title: 'Hermione Granger', detail: 'HP-API · Gryffindor · Emma Watson' });
  expect(hermione[0].id).toMatch(/^hp-[0-9a-f-]{36}$/);
  expect((await hpApi.search({ text: 'radcliffe', opts: {}, limit: 5 }, ctx()))[0].title).toBe('Harry Potter');
  // Dobby has no HP-API picture: PotterDB's
  const dobby = await hpApi.search({ text: 'Dobby', opts: {}, limit: 5 }, ctx());
  expect(dobby).toEqual([{ ref: `hp-api:pdb-${DOBBY}`, source: 'hp-api', id: `pdb-${DOBBY}`, kind: 'image', title: 'Dobby',
    thumbUrl: 'https://static.wikia.nocookie.net/harrypotter/images/8/82/Dobby.jpg', detail: 'PotterDB（維基圖）' }]);
});

test('get downloads the picture under the extension of what came back', async () => {
  const f = await hpApi.get(`pdb-${DOBBY}`, ctx());
  expect(f.file).toBe(join(dir, `hp-api-pdb-${DOBBY}.webp`));
  expect(existsSync(f.file)).toBe(true);
  expect(f.meta).toMatchObject({ title: 'Dobby', author: 'Warner Bros.', license: expect.stringContaining('Warner') });
  const harry = JSON.parse(fx('hp-characters')).find((c: any) => c.name === 'Harry Potter');
  expect((await hpApi.get(`hp-${harry.id}`, ctx())).file).toMatch(/\.jpg$/);
  const vernon = JSON.parse(fx('hp-characters')).find((c: any) => c.name === 'Vernon Dursley');
  await expect(hpApi.get(`hp-${vernon.id}`, ctx())).rejects.toMatchObject({ kind: 'missing', message: 'Vernon Dursley 沒有可用的圖' });
  await expect(hpApi.get('pdb-00000000-0000-0000-0000-000000000000', ctx())).rejects.toMatchObject({ kind: 'missing' });
  await expect(hpApi.get('dobby', ctx())).rejects.toMatchObject({ kind: 'missing' });
});

test('data tells characters and spells', async () => {
  const harry = await hpApi.data!('Harry Potter', ctx());
  expect(harry).toMatch(/^角色：\nHarry Potter（又名 .+）：學院 Gryffindor｜.*守護靈 stag｜魔杖 holly、phoenix tail feather、11 吋｜演員 Daniel Radcliffe/);
  const spell = await hpApi.data!('Expelliarmus', ctx());
  expect(spell).toContain('咒語：\nExpelliarmus(ex-PEL-lee-ar-muss)（Disarming Charm）：Disarms an opponent｜類別 Charm｜光 Scarlet');
  // PotterDB's spell stands for HP-API's of the same incantation
  expect(spell).not.toContain('Expelliarmus：');
  expect(await hpApi.data!('Dobby', ctx())).toContain('Dobby：');
  expect(await hpApi.data!('zzz', ctx())).toContain('找不到「zzz」的角色或咒語');
});
