const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [...fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js')).map(f => 'assets/js/' + f),
  ...fs.readdirSync(path.join(root, 'tools')).filter(f => f.endsWith('.js')).map(f => 'tools/' + f)];
for (const file of files) cp.execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) {
  if (!fs.existsSync(path.join(root, match[1]))) throw Error('Missing asset: ' + match[1]);
}
if (/PortalAuth|\.\/login\.html|\.\/case\.html|\.\/tables\.html/.test(fs.readFileSync(path.join(root, 'assets/js/analytics.js'), 'utf8'))) throw Error('Portal page dependency remains');
if (!fs.readFileSync(path.join(root, 'src/analytics.css')).equals(fs.readFileSync(path.join(root, 'assets/css/analytics.css')))) throw Error('Build analytics CSS first');
if (!fs.readFileSync(path.join(root, 'src/dashboard.css')).equals(fs.readFileSync(path.join(root, 'assets/css/dashboard.css')))) throw Error('Build dashboard CSS first');
console.log('JavaScript syntax, assets and standalone route references checked.');
