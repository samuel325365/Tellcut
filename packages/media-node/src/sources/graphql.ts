// GraphQL sources (PokeAPI's Hasura, AniList) can put an error inside an HTTP 200 answer, where http.ts never sees a status. Such an
// error is read the way http.ts reads statuses: a server that is struggling (Hasura's database error, AniList's 429 / 5xx) is
// unavailable for now, an item that is not there is missing, and a query the source refuses is about that request — none of them a
// reason to hide the whole source for days, which a `broken` from a search does until `npm run sources` passes. Only a health check
// treats a refused query as broken: its query is fixed and minimal, so a refusal there means the source's schema changed.
import { SourceError } from './http.ts';

export interface GqlError { message?: string; status?: number; extensions?: { code?: string } }

/** Hasura's error codes for a query it does not accept (graphql-engine's `Code`); anything else it says is the server's own trouble */
const HASURA_REFUSED = new Set(['validation-failed', 'parse-failed', 'not-supported', 'bad-request', 'invalid-params', 'invalid-json', 'permission-denied', 'access-denied']);
const TRANSIENT_WORDS = /time(d)?\s*out|timeout|too many|rate.?limit|temporar|unavailable|overload|connection|database|internal server/i;

/** missing: the item is not there; temporary: try later; refused: the source does not accept this query */
export function gqlErrorKind(e: GqlError): 'missing' | 'temporary' | 'refused' {
  const s = typeof e.status === 'number' ? e.status : undefined, code = e.extensions?.code;
  if (s === 404 || s === 410 || code === 'not-found') return 'missing';
  // as http.ts: a 401/403 without a key is a block (AniList switched its API off with a 403), 429 and 5xx are passing
  if (s === 401 || s === 403 || s === 429 || (s !== undefined && s >= 500)) return 'temporary';
  if (s !== undefined) return 'refused';
  if (code) return HASURA_REFUSED.has(code) ? 'refused' : 'temporary';
  return TRANSIENT_WORDS.test(e.message ?? '') ? 'temporary' : 'refused';
}

/** The SourceError for an answer's `errors` (its first one speaks for it). `check`: a refused query means the source changed. */
export function gqlError(source: string, errors: GqlError[], o: { check?: boolean } = {}): SourceError {
  const e = errors[0] ?? {}, why = e.message ?? 'error', kind = gqlErrorKind(e), status = typeof e.status === 'number' ? e.status : undefined;
  if (kind === 'missing') return new SourceError(source, 'missing', { zh: `找不到（${why}）`, en: `not found (${why})` }, status);
  if (kind === 'temporary') return new SourceError(source, 'temporary', { zh: `GraphQL 暫時出錯（${why}）`, en: `GraphQL failed for now (${why})` }, status);
  return new SourceError(source, o.check ? 'broken' : 'temporary', { zh: `GraphQL 查詢被拒絕（${why}）`, en: `the GraphQL query was refused (${why})` }, status);
}
