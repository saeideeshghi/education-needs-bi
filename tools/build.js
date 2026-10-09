/* Build the ready-to-host root into dist using only Node built-ins. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.copyFileSync(path.join(root, 'src/analytics.css'), path.join(root, 'assets/css/analytics.css'));
fs.copyFileSync(path.join(root, 'src/dashboard.css'), path.join(root, 'assets/css/dashboard.css'));
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Standalone dashboard built in dist. Root files are also ready for GitHub Pages.');
