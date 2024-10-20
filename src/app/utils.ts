function drawMegaDrivePalette(context: OffscreenCanvasRenderingContext2D) {
  // Draws an 512 color mega drive palette
  for (let index = 0; index < 512; index++) {
    // r, g, b - values from 0 to 7 (3 bit colors)
    const r = index % 8;
    const g = Math.floor(index / 8) % 8;
    const b = Math.floor(index / 64) % 8;
    // 255 / 7 ~= 36
    const r8 = r * 36;
    const g8 = g * 36;
    const b8 = b * 36;
    context.fillStyle = `rgb(${r8},${g8},${b8})`;
    const x = (index % 8) * 8;
    const y = Math.floor(index / 8) * 8;

    context.fillRect(x, y, 8, 8);
  }
}

export async function getImagePixelData(imageUrl: string) {
  const response = await fetch(imageUrl);
  const fileBlob = await response.blob();
  const bitmap = await createImageBitmap(fileBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { pixels, context, canvas };
}

export function getUnique(value, index, self) {
  return self.indexOf(value) === index;
}