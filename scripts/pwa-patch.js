/**
 * Run after `expo export --platform web` to inject PWA tags and copy public/ files.
 * Usage: node scripts/pwa-patch.js
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist');
const publicDir = path.join(__dirname, '../public');
const indexPath = path.join(distDir, 'index.html');

// Copy public/ files into dist/
const publicFiles = fs.readdirSync(publicDir);
for (const file of publicFiles) {
  fs.copyFileSync(path.join(publicDir, file), path.join(distDir, file));
  console.log(`Copied: ${file}`);
}

// Patch index.html
let html = fs.readFileSync(indexPath, 'utf8');

const pwaHead = `
    <!-- PWA manifest -->
    <link rel="manifest" href="/manifest.json" />

    <!-- iOS PWA support -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="FTG" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png" />`;

const swScript = `
    <!-- Service worker registration -->
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function (err) {
            console.warn('SW registration failed:', err);
          });
        });
      }
    </script>`;

if (!html.includes('manifest.json')) {
  html = html.replace('</head>', pwaHead + '\n  </head>');
}

if (!html.includes('serviceWorker')) {
  html = html.replace('<div id="root"></div>', '<div id="root"></div>\n' + swScript);
}

fs.writeFileSync(indexPath, html);
console.log('Patched: index.html with PWA tags');
