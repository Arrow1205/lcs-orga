import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routes,viewForPath,pathForView,yearFromQuery,surveyLink} from '../src/routes.js';

test('chaque rubrique possède un lien direct et le millésime reste explicite',async()=>{
 const vercel=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 for(const [view,slug] of Object.entries(routes)){
  assert.equal(viewForPath('/'+slug),view);
  assert.equal(pathForView(view,2026),`/${slug}?year=2026`);
  assert.ok(vercel.rewrites.some(r=>r.source==='/'+slug&&r.destination==='/index.html'));
 }
 assert.equal(yearFromQuery('?year=2027'),2027);
 assert.equal(surveyLink('visiteur',2026),'/formulaire/visiteur.html?year=2026');
});
