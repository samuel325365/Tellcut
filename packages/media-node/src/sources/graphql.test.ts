import { gqlError, gqlErrorKind } from './graphql.ts';

test('a GraphQL error is read like an HTTP status: missing, passing, or a query the source refuses', () => {
  // AniList: the status it means rides in the error
  expect(gqlErrorKind({ message: 'Not Found.', status: 404 })).toBe('missing');
  expect(gqlErrorKind({ message: 'Too Many Requests.', status: 429 })).toBe('temporary');
  expect(gqlErrorKind({ message: 'Internal Server Error', status: 500 })).toBe('temporary');
  expect(gqlErrorKind({ message: 'The AniList API has been temporarily disabled', status: 403 })).toBe('temporary');
  expect(gqlErrorKind({ message: 'Validation error', status: 400 })).toBe('refused');
  // Hasura (PokeAPI): only a code, always HTTP 200
  expect(gqlErrorKind({ message: "field 'x' not found in type: 'query_root'", extensions: { code: 'validation-failed' } })).toBe('refused');
  expect(gqlErrorKind({ message: 'database query error', extensions: { code: 'unexpected' } })).toBe('temporary');
  expect(gqlErrorKind({ message: 'connection error', extensions: { code: 'postgres-error' } })).toBe('temporary');
  // neither: the words decide, and an unknown one is the query's
  expect(gqlErrorKind({ message: 'query timed out' })).toBe('temporary');
  expect(gqlErrorKind({ message: 'something odd' })).toBe('refused');
});

test('a refused query is broken only in a health check', () => {
  const errors = [{ message: 'nope', extensions: { code: 'validation-failed' } }];
  expect(gqlError('x', errors)).toMatchObject({ source: 'x', kind: 'temporary', message: 'GraphQL 查詢被拒絕（nope）', en: 'the GraphQL query was refused (nope)' });
  expect(gqlError('x', errors, { check: true }).kind).toBe('broken');
  expect(gqlError('x', [{ message: 'Not Found.', status: 404 }], { check: true })).toMatchObject({ kind: 'missing', status: 404 });
  expect(gqlError('x', [{ message: 'busy', status: 503 }], { check: true }).kind).toBe('temporary');
});
