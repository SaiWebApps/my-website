import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { managerReviews, featuredRecommendations, colleagueRecommendations } from '../src/data/recommendations.ts';
import { materialMetrics, auditedProjects, smallTools } from '../src/data/materialPrototype.ts';

const root = resolve(import.meta.dirname, '..', 'dist');
const production = process.argv.includes('--production');
const base = production ? '' : '/explore/material-intelligence';
const routes = ['', '/leadership', '/projects', '/research', '/record', '/contact'];
const pages = new Map(routes.map(route => [route, readFileSync(resolve(root, `.${base}${route}/index.html`), 'utf8')]));
const plain = value => value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"').replace(/\s+/g, ' ').trim();
const contains = (route, value) => assert.ok(plain(pages.get(route)).includes(plain(value)), `${route || 'home'} missing: ${value.slice(0, 100)}`);

for (const [route, html] of pages) {
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${route}: one h1`);
  assert.ok(html.includes(`name="robots" content="${production ? 'index,follow' : 'noindex,nofollow'}"`), `${route}: correct indexing policy`);
  if (production) assert.ok(!/href="\/explore/.test(html), `${route}: production navigation must not lead to prototypes`);
  assert.ok(html.includes('rel="canonical"'), `${route}: canonical`);
  const data = JSON.parse(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(data['@graph'][0].name, 'Sairam Krishnan');
  contains(route, 'Contact Me');
  assert.ok(!plain(html).includes('Work + Ideas'), `${route}: obsolete combined destination`);
  assert.ok(!plain(html).includes('Start a conversation'), `${route}: repeated CTA`);
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (!href.startsWith('/') && !href.startsWith('#')) continue;
    const url = new URL(href, `https://sairambkrishnan.com${base}${route}/`);
    const path = resolve(root, `.${url.pathname}${extname(url.pathname) ? '' : '/index.html'}`);
    assert.ok(existsSync(path), `${route}: missing ${href}`);
    if (url.hash && extname(path) === '.html') {
      const target = readFileSync(path, 'utf8');
      assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${route}: missing fragment ${href}`);
    }
  }
}
assert.equal((pages.get('').match(/class="metric-trigger"/g) || []).length, 7);
for (const metric of materialMetrics) { contains('', metric.value); contains('', metric.label); contains('', metric.detail); }
contains('', 'Software engineering leader');
for (const value of ['ten vendors', 'three continents', 'including Siri', '45%', 'GraphQL', 'Prime Day', 'Black Friday', 'Cupertino, Seattle, London, and Singapore']) contains('/leadership', value);
for (const review of managerReviews) {
  for (const quote of review.quotes) contains('/leadership', quote);
  contains('/leadership', `From Apple Senior Engineering Manager, ${review.year}`);
}
for (const person of [...featuredRecommendations, ...colleagueRecommendations]) {
  contains('/record', person.person);
  for (const quote of person.quotes) contains('/record', quote);
}
for (const value of ['CTO and Curriculum Designer', 'GPA 4.0/4.0', 'Jesse Jones Scholarship', 'National Merit Finalist', 'Benjamin Franklin Award', 'First Year Honors', 'Palmer Scholar', 'Graduation With Honors', 'Dean’s List', 'Director’s List']) contains('/record', value);
const honorSection = pages.get('/record').match(/<section id="honors"[^>]*>([\s\S]*?)<\/section>/)[1];
const awards = [...honorSection.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g)].map(m => m[1]);
assert.ok(awards.find(a => a.includes('Benjamin Franklin Award')).includes('class="award-citation"'));
assert.equal((awards.find(a => a.includes('<h3>First Year Honors</h3>')).match(/<img /g) || []).length, 1);
assert.equal((awards.find(a => a.includes('<h3>Director’s List</h3>')).match(/<img /g) || []).length, 3);
for (const project of [...auditedProjects, ...smallTools]) {
  for (const field of ['title', 'purpose', 'status', 'built', 'checked']) contains('/projects', project[field]);
  assert.ok(pages.get('/projects').includes(`href="${project.href}"`));
}
for (const doi of ['10.2139/ssrn.7083078', '10.2139/ssrn.6732598', '10.31224/6924', '10.31224/6987']) contains('/research', doi);
for (const href of ['mailto:sairambkrishnan@gmail.com', 'https://linkedin.com/in/sairambkrishnan', 'tel:+12815131263']) assert.ok(pages.get('/contact').includes(`href="${href}"`));
assert.equal((pages.get('/contact').match(/<dt>/g) || []).length, 3);
assert.ok(!readFileSync(resolve(root, 'sitemap-0.xml'), 'utf8').includes('/explore'));
assert.ok(readFileSync(resolve(root, `.${base}/work/index.html`), 'utf8').includes(`${base}/projects`));
console.log('Material content verified: six routes, seven metrics, four complete Apple reviews, seven complete recommendations, ten projects, four DOI links, three contact details, metadata, internal fragments, and legacy redirect.');
