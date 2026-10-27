// Picks the MediaResolver for the player's URL parameters.
//   media=api&id=<project>   editor preview through the Tellcut server (no prepared cache needed)
//   media=source             original files; stills/audio from the prepared cache when it exists (M-9)
//   media=cache [&index=…]   render: clips cut by prepare (index defaults to cache/index.json)
import { apiResolver, cacheResolver, sourceResolver, type CacheIndex, type MediaResolver, type Project } from '@tellcut/engine';

export async function makeResolver(q: URLSearchParams, project: Pick<Project, 'sources'>, projectUrl: string, origin: string, json: (url: string) => Promise<any>): Promise<MediaResolver> {
  const mode = q.get('media') ?? (q.get('mode') === 'render' ? 'cache' : 'source');
  if (mode === 'api') return apiResolver(q.get('id') ?? '', origin);
  const indexUrl = new URL(q.get('index') ?? 'cache/index.json', projectUrl).href;
  // like ?project= (main.ts): the index names every clip URL, so only one from this server
  if (new URL(indexUrl).origin !== origin) throw new Error(`index 只能來自這台伺服器：${indexUrl}`);
  if (mode === 'cache') return cacheResolver((await json(indexUrl)) as CacheIndex, projectUrl);
  const index = (await json(indexUrl).catch(() => undefined)) as CacheIndex | undefined;
  return sourceResolver(project, projectUrl, index && cacheResolver(index, projectUrl));
}
