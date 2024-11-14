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

export function downloadCanvasAsImage(canvas: OffscreenCanvas) {
  let downloadLink = document.createElement('a');
  downloadLink.setAttribute('download', 'CanvasAsImage.png');
  canvas?.convertToBlob().then((blob) => {
    let url = URL.createObjectURL(blob!);
    downloadLink.setAttribute('href', url);
    downloadLink.click();
  });
};

export function showCanvasInNewWindow(canvas: OffscreenCanvas) {
  canvas.convertToBlob().then((blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url);
  });
}

export function arrayIsSubset(arraySmall: Array<any>, arrayBig: Array<any>) {
  return arraySmall.every((val) => arrayBig.includes(val));
}

/**
 * TrapsSaw -> Traps_Saw
 */
export function camelToSnakeCase(str: string) {
  return str.split(/(?=[A-Z])/).join('_');
} 

export function snakeCaseToPascalCase(string) {
  return `${string}`
  .toLowerCase()
  .replace(new RegExp(/[-_]+/, 'g'), ' ')
  .replace(new RegExp(/[^\w\s]/, 'g'), '')
  .replace(
    new RegExp(/\s+(.)(\w*)/, 'g'),
    ($1, $2, $3) => `${$2.toUpperCase() + $3}`
  )
  .replace(new RegExp(/\w/), s => s.toUpperCase());
}

export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function replaceColor(
  imageData: ImageData,
  searchValue: { r: number; g: number; b: number },
  replaceValue: { r: number; g: number; b: number }
) {
  // iterate through pixel data (1 pixels consists of 4 ints in the array)
  for (var i = 0, len = imageData.data.length; i < len; i += 4) {
    var r = imageData.data[i];
    var g = imageData.data[i + 1];
    var b = imageData.data[i + 2];

    if (
      r == searchValue.r &&
      g == searchValue.g &&
      b == searchValue.b
    ) {
      imageData.data[i] = replaceValue.r;
      imageData.data[i + 1] = replaceValue.g;
      imageData.data[i + 2] = replaceValue.b;
    }
  }

  return imageData;
}