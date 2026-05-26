const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const buildDir = path.join(__dirname, '..', 'build');
const iconPath = path.join(buildDir, 'icon.png');
const pkg = require(path.join(__dirname, '..', 'package.json'));
const version = `v${pkg.version}`;

// Grava BMP 24-bit bruto (sem compressao, bottom-up, compativel NSIS)
function writeBmp(filePath, pngBuffer, width, height) {
  return sharp(pngBuffer)
    .flatten({ background: { r: 0, g: 100, b: 200 } })
    .removeAlpha()
    .raw()
    .toBuffer()
    .then(rawPixels => {
      const rowSize = Math.ceil(width * 3 / 4) * 4;
      const pixelDataSize = rowSize * height;
      const fileSize = 54 + pixelDataSize;
      const bmp = Buffer.alloc(fileSize);

      // Cabecalho BMP
      bmp.write('BM', 0);
      bmp.writeUInt32LE(fileSize, 2);
      bmp.writeUInt32LE(54, 10);
      // Cabecalho DIB (BITMAPINFOHEADER)
      bmp.writeUInt32LE(40, 14);
      bmp.writeInt32LE(width, 18);
      bmp.writeInt32LE(height, 22);
      bmp.writeUInt16LE(1, 26);
      bmp.writeUInt16LE(24, 28);
      bmp.writeUInt32LE(pixelDataSize, 34);
      bmp.writeInt32LE(2835, 38);
      bmp.writeInt32LE(2835, 42);

      // Dados dos pixels (bottom-up, BGR)
      for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * width * 3;
        const dstRow = 54 + y * rowSize;
        for (let x = 0; x < width; x++) {
          const srcOff = srcRow + x * 3;
          const dstOff = dstRow + x * 3;
          bmp[dstOff] = rawPixels[srcOff + 2];     // B
          bmp[dstOff + 1] = rawPixels[srcOff + 1]; // G
          bmp[dstOff + 2] = rawPixels[srcOff];     // R
        }
      }

      fs.writeFileSync(filePath, bmp);
    });
}

async function main() {
  console.log(`Gerando banners para ${version}...`);

  // Sidebar: 164x314 com gradiente azul + icone centralizado
  const sidebarSvg = `<svg width="164" height="314">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1a73e8"/>
        <stop offset="50%" stop-color="#0d47a1"/>
        <stop offset="100%" stop-color="#002171"/>
      </linearGradient>
    </defs>
    <rect width="164" height="314" fill="url(#g)"/>
    <text x="82" y="255" text-anchor="middle" font-family="Segoe UI, Arial" font-size="12" font-weight="bold" fill="#ffffff" letter-spacing="0.5">NFS-e Monitor</text>
    <text x="82" y="275" text-anchor="middle" font-family="Segoe UI, Arial" font-size="10" fill="#90caf9">${version}</text>
  </svg>`;

  const sidebarBg = await sharp(Buffer.from(sidebarSvg)).resize(164, 314).png().toBuffer();
  const iconResized = await sharp(iconPath).resize(90, 90).png().toBuffer();

  const sidebarPng = await sharp(sidebarBg)
    .composite([{ input: iconResized, top: 85, left: 37 }])
    .png()
    .toBuffer();

  await writeBmp(path.join(buildDir, 'installerSidebar.bmp'), sidebarPng, 164, 314);
  console.log('Banner sidebar criado (164x314 BMP)');

  // Header: 150x57 com gradiente azul
  const headerSvg = `<svg width="150" height="57">
    <defs>
      <linearGradient id="h" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#1a73e8"/>
        <stop offset="100%" stop-color="#002171"/>
      </linearGradient>
    </defs>
    <rect width="150" height="57" fill="url(#h)"/>
    <text x="75" y="35" text-anchor="middle" font-family="Segoe UI, Arial" font-size="11" font-weight="bold" fill="#ffffff">NFS-e Monitor</text>
  </svg>`;

  const headerPng = await sharp(Buffer.from(headerSvg)).resize(150, 57).png().toBuffer();
  await writeBmp(path.join(buildDir, 'installerHeader.bmp'), headerPng, 150, 57);
  console.log('Banner header criado (150x57 BMP)');

  // Desinstalador usa os mesmos banners
  fs.copyFileSync(path.join(buildDir, 'installerSidebar.bmp'), path.join(buildDir, 'uninstallerSidebar.bmp'));
  fs.copyFileSync(path.join(buildDir, 'installerHeader.bmp'), path.join(buildDir, 'uninstallerHeader.bmp'));
  console.log('Banners do desinstalador copiados');
}

main().catch(console.error);
