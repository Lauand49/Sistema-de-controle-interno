const sharp = require('sharp');
const fs = require('fs');

async function processMascot() {
  const inputPath = '/Users/felipelauand/.gemini/antigravity/brain/e9d10fa6-f25d-4920-883a-f5b32dcf5f49/.user_uploaded/media_1790165207778.png';
  const outputPath = 'public/brand/mascote.png';
  const outputPathRoot = 'public/mascote.png';

  const image = sharp(inputPath);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const isBg = new Uint8Array(width * height);
  const queue = [];

  // Color distance / brightness test for background white
  function isWhitePixel(idx) {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const minC = Math.min(r, g, b);
    const maxC = Math.max(r, g, b);
    return minC >= 205 && (maxC - minC) < 30;
  }

  // Seed with borders
  for (let x = 0; x < width; x++) {
    const topIdx = (0 * width + x) * channels;
    if (isWhitePixel(topIdx)) {
      isBg[0 * width + x] = 1;
      queue.push(x, 0);
    }
    const btmIdx = ((height - 1) * width + x) * channels;
    if (isWhitePixel(btmIdx)) {
      isBg[(height - 1) * width + x] = 1;
      queue.push(x, height - 1);
    }
  }

  for (let y = 0; y < height; y++) {
    const leftIdx = (y * width + 0) * channels;
    if (isWhitePixel(leftIdx) && !isBg[y * width + 0]) {
      isBg[y * width + 0] = 1;
      queue.push(0, y);
    }
    const rightIdx = (y * width + (width - 1)) * channels;
    if (isWhitePixel(rightIdx) && !isBg[y * width + (width - 1)]) {
      isBg[y * width + (width - 1)] = 1;
      queue.push(width - 1, y);
    }
  }

  // Enclosed hole inside waving bionic hand (112, 287)
  const handIdx = (287 * width + 112) * channels;
  if (isWhitePixel(handIdx) && !isBg[287 * width + 112]) {
    isBg[287 * width + 112] = 1;
    queue.push(112, 287);
  }

  // Flood Fill BFS
  let head = 0;
  const dx = [1, -1, 0, 0, 1, -1, 1, -1];
  const dy = [0, 0, 1, -1, 1, 1, -1, -1];

  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];

    for (let i = 0; i < 8; i++) {
      const nx = cx + dx[i];
      const ny = cy + dy[i];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPos = ny * width + nx;
        if (!isBg[nPos]) {
          const nIdx = nPos * channels;
          if (isWhitePixel(nIdx)) {
            isBg[nPos] = 1;
            queue.push(nx, ny);
          }
        }
      }
    }
  }

  // Defringe pass: find pixels adjacent to background with high brightness
  // and smooth their alpha / remove white halo
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const idx = pos * channels;

      if (isBg[pos]) {
        // Pure background -> 100% transparent
        data[idx + 3] = 0;
      } else {
        // Check if touches background
        let touchesBg = false;
        for (let i = 0; i < 4; i++) {
          const nx = x + dx[i];
          const ny = y + dy[i];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (isBg[ny * width + nx]) {
              touchesBg = true;
              break;
            }
          }
        }

        if (touchesBg) {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const brightness = (r + g + b) / 3;

          if (brightness > 200) {
            // Anti-alias edge: scale alpha based on outline darkness
            const alpha = Math.max(0, Math.min(255, Math.round(255 - ((brightness - 200) / 55) * 255)));
            data[idx + 3] = alpha;
            // Also darken RGB slightly to prevent white halo bleeding onto dark backgrounds
            const factor = alpha / 255;
            data[idx] = Math.round(r * factor);
            data[idx + 1] = Math.round(g * factor);
            data[idx + 2] = Math.round(b * factor);
          }
        }
      }
    }
  }

  // Save with sharp
  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(outputPath);

  fs.copyFileSync(outputPath, outputPathRoot);
  console.log('Successfully saved transparent mascot to', outputPath, 'and', outputPathRoot);
}

processMascot().catch(console.error);
