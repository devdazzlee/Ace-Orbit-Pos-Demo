const fs = require('fs');
const path = require('path');

// Running from Frontend dir
const logoPath = path.join(process.cwd(), 'public/logo.png');
const outputPath = path.join(process.cwd(), 'lib/logo-base64.ts');

if (fs.existsSync(logoPath)) {
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  // Ensure no line breaks or spaces in the base64 string
  const cleanBase64 = logoBase64.replace(/\s/g, '');
  const content = `export const LOGO_BASE64 = "data:image/png;base64,${cleanBase64}";\n`;
  fs.writeFileSync(outputPath, content);
  console.log('Successfully generated clean lib/logo-base64.ts');
} else {
  console.error('Logo not found at:', logoPath);
}
