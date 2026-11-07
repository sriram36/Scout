'use strict';

// The dashboard must not depend on next/font/google: Vercel's build could not resolve its loader
// (Turbopack: "Can't resolve '@vercel/turbopack-next/internal/font/google/font'"), so the fonts are
// self-hosted from dashboard/public/fonts and declared with plain @font-face.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DASHBOARD = path.join(__dirname, '..', 'dashboard');
const layout = fs.readFileSync(path.join(DASHBOARD, 'src', 'app', 'layout.tsx'), 'utf8');
const css = fs.readFileSync(path.join(DASHBOARD, 'src', 'app', 'globals.css'), 'utf8');

test('the layout does not import next/font/google', () => {
  assert.doesNotMatch(layout, /from\s+["']next\/font\/google["']/);
  assert.doesNotMatch(layout, /require\(\s*["']next\/font\/google["']\s*\)/);
});

test('no dashboard source imports next/font/google anywhere', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const offenders = walk(path.join(DASHBOARD, 'src'))
    .filter(f => /\.(tsx?|jsx?)$/.test(f))
    .filter(f => /["']next\/font\/google["']/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('both families are declared with @font-face and exposed through the CSS variables the styles use', () => {
  assert.match(css, /@font-face\s*{[^}]*font-family:\s*["']Bricolage Grotesque["']/);
  assert.match(css, /@font-face\s*{[^}]*font-family:\s*["']Instrument Sans["']/);
  assert.match(css, /--font-display:\s*["']Bricolage Grotesque["']/);
  assert.match(css, /--font-text:\s*["']Instrument Sans["']/);
});

test('every font file the CSS points at exists and is a real woff2', () => {
  const urls = [...css.matchAll(/url\(["']?(\/fonts\/[^"')]+)["']?\)/g)].map(m => m[1]);
  assert.ok(urls.length >= 4, `expected at least four font files (two families, latin and latin-ext), found ${urls.length}`);
  for (const url of urls) {
    const file = path.join(DASHBOARD, 'public', url);
    assert.ok(fs.existsSync(file), `${url} is missing from dashboard/public`);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${url} is not a woff2 file`);
    assert.ok(bytes.length > 5000, `${url} is suspiciously small`);
  }
});

test('the font licences and sources are recorded next to the files', () => {
  const notice = fs.readFileSync(path.join(DASHBOARD, 'public', 'fonts', 'README.md'), 'utf8');
  assert.match(notice, /SIL Open Font License/i);
  assert.match(notice, /Bricolage Grotesque/);
  assert.match(notice, /Instrument Sans/);
});
