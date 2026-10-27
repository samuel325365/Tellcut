import { makeProjects, startApp } from './test-utils.ts';

const post = (b: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

test('a request is stored with the time range of what was selected', async () => {
  const { app, base } = await startApp({ projectsDir: makeProjects() });
  try {
    const url = `${base}/api/projects/demo/requests`;
    const r = await fetch(url, post({ text: '  換一個鏡頭  ', selection: ['c', 'f'], playhead: 0.6 }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ text: '換一個鏡頭', selection: ['c', 'f'], playhead: 0.6, range: [0, 1] });
    const none = await (await fetch(url, post({ text: '加字幕', selection: [], playhead: 0.3 }))).json();
    expect(none.range).toBeNull();
    expect((await fetch(url, post({ text: ' ', selection: [], playhead: 0 }))).status).toBe(400);
    const bad = await fetch(url, post({ text: 'x', selection: ['nope'], playhead: 0 }));
    expect([bad.status, (await bad.json()).error]).toEqual([400, '找不到項目 nope']);
  } finally { await app.close(); }
});
