import sharp from 'sharp';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const portrait = await sharp(resolve(root, 'public/assets/portrait-2026.jpg'))
  .resize(420, 630, { fit: 'cover', position: 'attention' })
  .toBuffer();

const overlay = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="820" height="630" fill="#1736c8"/>
  <line x1="820" y1="0" x2="820" y2="630" stroke="#ffffff" stroke-opacity="0.55"/>
  <text x="70" y="70" fill="#dce3ff" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" letter-spacing="2">ENGINEERING LEADERSHIP / AI &amp; ML</text>
  <text x="64" y="236" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="90" font-weight="700" letter-spacing="-4">From architecture</text>
  <text x="64" y="326" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="90" font-weight="700" letter-spacing="-4">to adoption.</text>
  <text x="70" y="396" fill="#eef1ff" font-family="Arial, Helvetica, sans-serif" font-size="26">AI platforms. Teams. Measurable business outcomes.</text>
  <rect x="70" y="477" width="164" height="70" fill="#c7f36b"/>
  <text x="91" y="520" fill="#101323" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">100M+</text>
  <text x="258" y="507" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700">Sairam Krishnan</text>
  <text x="258" y="538" fill="#dce3ff" font-family="Arial, Helvetica, sans-serif" font-size="18">Principal Software Engineer / AI/ML Platform Lead</text>
</svg>`);

await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#1736c8' } })
  .composite([
    { input: portrait, left: 780, top: 0 },
    { input: overlay, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(resolve(root, 'public/og.png'));

console.log('Generated public/og.png');
