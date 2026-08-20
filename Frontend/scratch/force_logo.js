const fs = require('fs');
const path = require('path');

const srcLogo = path.join(__dirname, '../public/logo.png');
const rootDirs = [
  path.join(__dirname, '../../Frontend'),
  path.join(__dirname, '../../Backend'),
  path.join(__dirname, '../../PrintServer')
];

const ignoreDirs = ['node_modules', '.git', '.next'];
const imageExts = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.ico', '.webp'];

const base64Logo = fs.readFileSync(srcLogo).toString('base64');
const svgTemplate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <image width="100%" height="100%" href="data:image/png;base64,${base64Logo}" />
</svg>`;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (!ignoreDirs.includes(file)) {
        walk(fullPath);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (imageExts.includes(ext) && fullPath !== srcLogo) {
        if (ext === '.svg') {
          fs.writeFileSync(fullPath, svgTemplate);
          console.log('Replaced SVG:', fullPath);
        } else {
          fs.copyFileSync(srcLogo, fullPath);
          console.log('Overwritten:', fullPath);
        }
      }
    }
  }
}

for (const dir of rootDirs) {
  console.log('Scanning', dir);
  walk(dir);
}
console.log('DONE REPLACING EVERY SINGLE IMAGE FILE.');
