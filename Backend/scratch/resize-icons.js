const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcLogo = path.join(__dirname, '../../Frontend/public/logo.png');
const destIconsDir = path.join(__dirname, '../../Frontend/public/icons');
const backendLogoDir = path.join(__dirname, '../src/assets');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generate() {
  if (!fs.existsSync(destIconsDir)) {
    fs.mkdirSync(destIconsDir, { recursive: true });
  }

  // Generate PWA icons
  for (const size of sizes) {
    const dest = path.join(destIconsDir, `icon-${size}x${size}.png`);
    await sharp(srcLogo)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(dest);
    console.log(`Generated ${dest}`);
  }

  // Copy to Backend/src/assets/logo.png
  fs.copyFileSync(srcLogo, path.join(backendLogoDir, 'logo.png'));
  console.log('Copied to backend assets');
  
  // Create a 32x32 for favicon.ico in public
  await sharp(srcLogo)
      .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(path.join(__dirname, '../../Frontend/public/favicon.ico'));
  
  // Overwrite placeholders just to be safe
  await sharp(srcLogo)
      .resize(200, 200, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(path.join(__dirname, '../../Frontend/public/placeholder-logo.png'));

  console.log('Done');
}

generate().catch(console.error);
