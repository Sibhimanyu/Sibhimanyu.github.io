// Content-hashes every local js/css/asset reference: path -> path?v=<8 hex of sha256>. Idempotent. Run: node scripts/stamp.mjs
// GitHub Pages serves max-age=600 with no versioned URLs, so a deploy could pair a new index.html with a cached old js file.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => createHash('sha256').update(b).digest('hex');
const EXT = 'js|css|webp|png|jpe?g|svg|woff2|gif';
const V = '(?:\\?v=[0-9a-f]{8})?';
const REF = new RegExp(`(?<![\\w./-])((?:assets|js)/[\\w./-]+?\\.(?:${EXT}))${V}(?![\\w.-])`, 'g');          // page-relative refs
const IMP = new RegExp(`((?:from|import)\\s*['"])(\\.{1,2}/[\\w./-]+?\\.js)${V}(['"])`, 'g');               // static imports
const rel = f => path.relative(root, f).split(path.sep).join('/');
const BUILD_RE = /(export const BUILD = ')[0-9a-f]*(')/;

const hashes = new Map(), texts = new Map(), active = new Set();
// Returns the stamped text of a js file (deps first); hashes assets by bytes.
function hashOf(file) {
  if (hashes.has(file)) return hashes.get(file);
  if (!file.endsWith('.js') && !file.endsWith('.css')) { const h = sha(readFileSync(file)).slice(0, 8); hashes.set(file, h); return h; }
  if (active.has(file)) throw new Error('import cycle at ' + rel(file));
  active.add(file);
  const dir = path.dirname(file);
  const v = (target) => existsSync(target) ? '?v=' + hashOf(target) : '';
  let text = readFileSync(file, 'utf8')
    .replace(IMP, (m, a, spec, q) => a + spec + v(path.resolve(dir, spec)) + q)
    .replace(REF, (m, p) => p + v(path.join(root, p)));
  texts.set(file, text);
  // the BUILD line is excluded from its own hash (it is derived from the hashes of everything)
  const h = sha(text.replace(BUILD_RE, '$1$2')).slice(0, 8);
  active.delete(file); hashes.set(file, h); return h;
}

const index = path.join(root, 'index.html');
const jsFiles = ['js/hover.js', 'js/portrait.js', 'js/ui.js', 'js/work.js'].map(f => path.join(root, f)).filter(existsSync);
let page = readFileSync(index, 'utf8');
const refs = [...page.matchAll(REF)].map(m => path.join(root, m[1])).filter(existsSync);
for (const f of [...refs, ...jsFiles]) hashOf(f);

// BUILD: one id for the whole set, written into index.html (window.__BUILD) and js/portrait.js (BUILD); they must agree at boot.
const build = sha([...hashes].map(([f, h]) => rel(f) + ':' + h).sort().join('\n')).slice(0, 8);
const pj = path.join(root, 'js/portrait.js');
if (texts.has(pj) && BUILD_RE.test(texts.get(pj))) texts.set(pj, texts.get(pj).replace(BUILD_RE, `$1${build}$2`));
for (const [f, t] of texts) writeFileSync(f, t);
// portrait.js carries BUILD, so its URL hash is of its final bytes; re-stamp the page after that
hashes.set(pj, sha(texts.get(pj)).slice(0, 8));
page = page.replace(REF, (m, p) => { const f = path.join(root, p); return existsSync(f) ? p + '?v=' + hashes.get(f) : m; })
  .replace(/(window\.__BUILD=")[0-9a-f]*(")/, `$1${build}$2`);
writeFileSync(index, page);
console.log('stamped build', build);
