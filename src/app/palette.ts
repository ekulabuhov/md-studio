/**
 * Implements "greedy best fit" optimizer from SuperFamiconv
 * Reference: https://github.com/Optiroc/SuperFamiconv/blob/d56c29263e9c1cffaf81458f7a3531abbcab8471/src/Palette.cpp#L380
 * 
 * @param canvas 
 * @param existingPalettes 
 * @returns 
 */
export function calculatePalette(canvas: OffscreenCanvas, existingPalettes?: number[][]): {
  /** Map with tile indexes as keys and palette indexes as values, e.g. { 0: 0, 1: 0, 2: etc. } */
  palettePerTile: { [tileIdx: number]: number };
  /** 2 dimension array [tileIdx][pixelIdx] where value is a flat array of 8*8 pixels, e.g. [[0x246, ...63 values], etc. ] */
  tilePixels: number[][];
  /** [paletteIdx][color] - each palette is up to 16 colors, each color is in 3bpp BGR format, e.g. [[0x246, ...15 values]] */
  palettes: number[][];
  coloredImage: ImageData;
} {
  const roundToTwo = (val) => Math.floor(val / 2) * 2;
  const context = canvas.getContext('2d')!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);

  const tileCount = pixels.data.length / 256;
  const bytesPerLine = canvas.width * 4;
  const tileCountPerLine = canvas.width / 8;

  let palettes: number[][] = [];
  /** key is tileIdx and values is MD palette, e.g: { 0: ["246", "028"], 1: ... } */
  const palettePerTile = {};
  /** key is tileIdx and value is a flat array of 8*8 pixels { 0: ["246", ... 63 bytes] } */
  const tilePixels = Array.from({ length: tileCount }, () => []);
  for (let tileIdx = 0; tileIdx < tileCount; tileIdx++) {
    const tileLine = Math.floor(tileIdx / tileCountPerLine);
    const tileOffset =
      tileLine * bytesPerLine * 8 + (tileIdx % tileCountPerLine) * 32;
    const palette = {};
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const i = tileOffset + y * bytesPerLine + x * 4;
        const r = pixels.data[i];
        const g = pixels.data[i + 1];
        const b = pixels.data[i + 2];

        let mdB = roundToTwo(b / 0x10);
        let mdG = roundToTwo(g / 0x10);
        let mdR = roundToTwo(r / 0x10);
        let mdKey = (mdB << 8) + (mdG << 4) + mdR;
        palette[mdKey] = true;
        tilePixels[tileIdx].push(mdKey);

        // replace colors with md colors
        pixels.data[i] = mdR * 18;
        pixels.data[i + 1] = mdG * 18;
        pixels.data[i + 2] = mdB * 18;
      }
    }

    const newPalette = Object.keys(palette).map((v) => parseInt(v));
    palettePerTile[tileIdx] = newPalette;
    const notDuplicate = !palettes.some((pal) => arraysEqual(pal, newPalette));
    const notSubset = !palettes.some((pal) => arrayIsSubset(newPalette, pal));
    if (notDuplicate && notSubset) {
      palettes.push(newPalette);
    }
  }

  const sets = existingPalettes ? existingPalettes.map(pal => new Set(pal)) : [new Set<number>()];
  palettes.forEach((pal) => {
    const palSet = new Set(pal);

    for (const [i, set] of sets.entries()) {
      const d = palSet.difference(set);
      if (set.size + d.size <= 16) {
        sets[i] = set.union(palSet);
        break;
      } else if (i + 1 >= sets.length) {
        sets.push(palSet);
      }
    }
  });

  for (let tileIdx = 0; tileIdx < tileCount; tileIdx++) {
    palettePerTile[tileIdx] = sets.findIndex((set) =>
      set.isSupersetOf(new Set(palettePerTile[tileIdx]))
    );
  }

  return {
    palettePerTile,
    tilePixels,
    palettes: sets.map((set) => new Array(...set).sort()),
    coloredImage: pixels
  };
}

function arraysEqual(array1, array2) {
  if (array1.length !== array2.length) {
    return false;
  }
  const array2Sorted = array2.slice().sort();
  return array1
    .slice()
    .sort()
    .every(function (value, index) {
      return value === array2Sorted[index];
    });
}

function arrayIsSubset(arraySmall: Array<any>, arrayBig: Array<any>) {
  return arraySmall.every((val) => arrayBig.includes(val));
}
