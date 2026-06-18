/**
 * pwa-patch.js — runs after `expo export --platform web`
 * 1. Copies all public/ files into dist/
 * 2. Ensures dist/index.html has manifest link + SW registration
 */
const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const PUBLIC  = path.join(ROOT, 'public');
const DIST    = path.join(ROOT, 'dist');
const INDEX   = path.join(DIST, 'index.html');

if (!fs.existsSync(DIST)) {
  console.error('[pwa-patch] dist/ not found — did expo export succeed?');
  process.exit(1);
}

// ── Copy public/ → dist/ ─────────────────────────────────────────────────────
let copied = 0;
for (const file of fs.readdirSync(PUBLIC)) {
  const src = path.join(PUBLIC, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(DIST, file));
    console.log(`[pwa-patch] copied: ${file}`);
    copied++;
  }
}
console.log(`[pwa-patch] ${copied} file(s) copied`);

// ── Patch index.html ─────────────────────────────────────────────────────────
if (!fs.existsSync(INDEX)) {
  console.warn('[pwa-patch] dist/index.html not found — skipping patch');
  process.exit(0);
}

let html = fs.readFileSync(INDEX, 'utf8');

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', '  <link rel="manifest" href="/manifest.json" />\n</head>');
  console.log('[pwa-patch] injected manifest link');
}

if (!html.includes('serviceWorker')) {
  const swScript = `  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .catch(function (err) { console.warn('[SW] Registration failed:', err); });
      });
    }
  </script>`;
  html = html.replace('</body>', swScript + '\n</body>');
  console.log('[pwa-patch] injected service worker registration');
}

fs.writeFileSync(INDEX, html, 'utf8');
console.log('[pwa-patch] done.');
