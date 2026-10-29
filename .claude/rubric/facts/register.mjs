// His data modules import each other without a file extension ("./career") and import JSON without attributes;
// resolve those to the .ts file and load JSON as JSON.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) { if (spec.startsWith('.') && !spec.endsWith('.ts') && !spec.endsWith('.json')) return next(spec + '.ts', ctx); throw e; }
}
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));
