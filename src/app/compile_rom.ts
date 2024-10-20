import { arrayToDc } from './asm_utils';
import { fs } from './fs_electron';
import { getImagePixelData } from './utils';

export async function compileRom(bgImgUrl: string, tileMap: number[][]) {
  const { pixels, canvas, context } = await getImagePixelData(bgImgUrl);

  // Calculate unique colors
  const { colors, mdColors } = calculateUniqueColors(pixels);

  // Build array of tileData bytes
  const colorKeys: string[] = Object.keys(colors);
  // First tile should be black
  const bytes = [];
  const selectedPalettes = assignPaletteToTile(canvas, pixels, colorKeys);

  let globalNotFound = 0;
  for (let tileY = 0; tileY < canvas.height / 8; tileY++) {
    for (let tileX = 0; tileX < canvas.width / 8; tileX++) {
      const selectedPaletteName = selectedPalettes[tileY][tileX].palette;
      const selectedPalette =
        selectedPaletteName === 'PAL0'
          ? colorKeys.slice(0, 16)
          : colorKeys.slice(16);
      let notFound = 0;
      for (let y = 0; y < 8; y++) {
        let byte = 0;
        for (let x = 0; x < 8; x++) {
          const i =
            tileY * canvas.width * 4 * 8 +
            tileX * 8 * 4 +
            y * canvas.width * 4 +
            x * 4;
          const r = pixels.data[i];
          const g = pixels.data[i + 1];
          const b = pixels.data[i + 2];
          const key = ((r << 16) + (g << 8) + b).toString(16);
          let colorIndex = selectedPalette.indexOf(key);

          if (isNaN(colorIndex) || colorIndex === -1) {
            colorIndex = 0;
            notFound++;
          }

          const { mdR, mdG, mdB } = mdColors[parseInt(colors[key].mdKey, 16)];
          // replace colors with md colors
          pixels.data[i] = mdR * 18;
          pixels.data[i + 1] = mdG * 18;
          pixels.data[i + 2] = mdB * 18;

          if (x % 2 === 0) {
            byte = colorIndex << 4;
          } else {
            byte += colorIndex;
            bytes.push(byte);
          }
        }
      }
      console.log({tileX: tileX.toString(16), notFound, selectedPaletteName});
      globalNotFound += notFound;
    }
  }

  console.log({globalNotFound, selectedPalettes});

  context.putImageData(pixels, 0, 0);
//   canvas.convertToBlob().then((blob) => {
//     const url = URL.createObjectURL(blob);
//     window.open(url);
//   });
  //   return;

  const mdPalette = colorKeys.map((key) => `0x${colors[key].mdKey}`).join(', ');

  // 8px * 8px * 4 bytes = 256 bytes
  const tileCount = pixels.data.length / 256;
  writeTileSetFile(bytes, tileCount);

  const asmFileContents = `.section .rodata_binf

    .align  2
blue_tilemap_data:
${arrayToDc(tileMap.flat(), 4, 'w')}

    .align 2
    .global blue_tilemap
blue_tilemap:
    dc.w    0  /* compression */ 
    dc.w    64 /* w */
    dc.w    32 /* h */
    dc.l    blue_tilemap_data
    `;

    fs.writeFile('res/blue_tilemap.s', asmFileContents);


  const hFileContents = `#ifndef _RES_BLUE_TILESET_H_
    #define _RES_BLUE_TILESET_H_
    
    extern const TileSet blue_tileset;
    extern const TileMap blue_tilemap;
    
    #endif // _RES_BLUE_TILESET_H_`;
  fs.writeFile('res/blue_tileset.h', hFileContents);

  const mainFileContents = `#include <genesis.h>
#include "blue_tileset.h"

int main(bool hard) {
    u16 ind = TILE_USER_INDEX;
    VDP_loadTileSet(&blue_tileset, ind, DMA);

    // Generates tilemap on the fly - by tiling the whole screen with repeating pattern
    // u16 tilemap[64 * 32];
    // TileMap blue_tileMap = {.w = 64, .h = 32, .compression = 0, .tilemap = tilemap};
    // for (size_t y = 0; y < 32; y++)
    // {
    //     for (size_t x = 0; x < 64; x++)
    //     {
    //         size_t i = y * 64 + x;
    //         tilemap[i] = (y % 8) * 8 + x % 8;
    //     }
    // }

    u16 colors[] = { ${mdPalette} };
    PAL_setColors(0, colors, sizeof(colors), CPU);

    // VDP_setTileMapEx(BG_B, &blue_tileMap, TILE_ATTR_FULL(PAL0, FALSE, FALSE, FALSE, ind), 0, 0, 0, 0, 64, 32, CPU);
    VDP_setTileMapEx(BG_B, &blue_tilemap, TILE_ATTR_FULL(PAL0, FALSE, FALSE, FALSE, ind), 0, 0, 0, 0, 64, 32, CPU);

    ind += blue_tileset.numTile;

    while (TRUE)
    {
      SYS_doVBlankProcess();
    }

    return 0;
}`;

  fs.writeFile('src/main.c', mainFileContents);

  console.log('started compilation');
  const response = await (window as any).versions.ping();
  console.log(response); // prints out 'pong'

  console.log({
    colors,
    mdColors: Object.keys(mdColors).map((c) => parseInt(c).toString(16)),
    md888Colors: mdColors,
  });
}

function writeTileSetFile(bytes: any[], tileCount: number) {
    const asmFileContents = `.section .rodata_binf

    .align  2
blue_tileset_data:
${arrayToDc(bytes, 4)}

    .align 2
    .global blue_tileset
blue_tileset:
    dc.w    0
    dc.w    ${tileCount} /* number of tiles */
    dc.l    blue_tileset_data
    `;

    fs.writeFile('res/blue_tileset.s', asmFileContents);
}

function assignPaletteToTile(
  canvas: OffscreenCanvas,
  pixels: ImageData,
  colorKeys: string[]
) {
  const globalPal0Usages = new Array(16).fill(0);
  const globalPal1Usages = new Array(16).fill(0);
  const shouldBeMovedFromPal0ToPal1 = new Array(16).fill(0);

  const selectedPalettes = Array.from({ length: 64 }, () => []);
  for (let tileY = 0; tileY < canvas.height / 8; tileY++) {
    for (let tileX = 0; tileX < canvas.width / 8; tileX++) {
      let pal0Usages = new Array(16).fill(0);
      let pal1Usages = new Array(16).fill(0);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const i =
            tileY * canvas.width * 4 * 8 +
            tileX * 8 * 4 +
            y * canvas.width * 4 +
            x * 4;
          const r = pixels.data[i];
          const g = pixels.data[i + 1];
          const b = pixels.data[i + 2];
          const key = ((r << 16) + (g << 8) + b).toString(16);
          const colorIndex = colorKeys.indexOf(key);

          if (isNaN(colorIndex)) {
            debugger;
          }

          if (colorIndex > 0xf) {
            pal1Usages[colorIndex - 0x10]++;
            globalPal1Usages[colorIndex - 0x10]++;
          } else {
            pal0Usages[colorIndex]++;
            globalPal0Usages[colorIndex]++;
          }
        }
      }
      const pal0UsageCount = pal0Usages.filter(Boolean).length;
      const pal1UsageCount = pal1Usages.filter(Boolean).length;
      const sum = (acc,val) => acc + val;
      const pixelsUsedInPal0 = pal0Usages.reduce(sum);
      const pixelsUsedInPal1 = pal1Usages.reduce(sum);
      if (pal1UsageCount > pal0UsageCount && pal0UsageCount !== 0) {
        for (let i = 0; i < 15; i++) {
          shouldBeMovedFromPal0ToPal1[i] += pal0Usages[i];
        }
      }
      selectedPalettes[tileY][tileX] = {
        pal0: pal0UsageCount,
          pal1: pal1UsageCount,
          pal0Usages,
          pal1Usages,
          pixelsUsedInPal0,
          pixelsUsedInPal1,
          // 1214
          palette: pixelsUsedInPal0 >= pixelsUsedInPal1 ? 'PAL0' : 'PAL1'
        //   palette: pal0UsageCount >= pal1UsageCount ? 'PAL0' : 'PAL1'
      }
        // console.log({
        //   x: tileX,
        //   y: tileY,
        //   pal0: pal0UsageCount,
        //   pal1: pal1UsageCount,
        //   pal0Usages,
        //   pal1Usages,
        // });
    }
  }

    console.log({
      globalPal0Usages,
      globalPal1Usages,
      shouldBeMovedFromPal0ToPal1,
    });
  shouldBeMovedFromPal0ToPal1.forEach((val, i) => {
    if (val) {
      colorKeys.push(colorKeys[i]);
    }
  });

  return selectedPalettes;
}

export function calculateUniqueColors(pixels: ImageData) {
  const roundToTwo = (val) => Math.floor(val / 2) * 2;

  const colors = {};
  const mdColors = {};
  for (var i = 0, len = pixels.data.length; i < len; i += 4) {
    const r = pixels.data[i];
    const g = pixels.data[i + 1];
    const b = pixels.data[i + 2];
    const key = ((r << 16) + (g << 8) + b).toString(16);
    colors[key] = colors[key] || { r, g, b, count: 0 };
    colors[key].count++;

    let mdB = roundToTwo(b / 0x10);
    let mdG = roundToTwo(g / 0x10);
    let mdR = roundToTwo(r / 0x10);
    let mdKey = (mdB << 8) + (mdG << 4) + mdR;

    // If we found two colors that have the same 333 value but different 888 value
    // Nudge one color component based on differences in intensity
    // The idea here is not to lose close color values due to overly aggressive quantization
    // Bug: if we're at highest intensity it will roll over to next byte
    // if (mdColors[mdKey] && mdColors[mdKey].key !== key) {
    //     const rDiff = Math.abs(mdColors[mdKey].r - r);
    //     const gDiff = Math.abs(mdColors[mdKey].g - g);
    //     const bDiff = Math.abs(mdColors[mdKey].b - b);
    //     const maxDiff = Math.max(rDiff, gDiff, bDiff);
    //     if (maxDiff === rDiff) {
    //         if (mdColors[mdKey].r < r) mdR += 2;
    //         else mdR -= 2;
    //     } else if (maxDiff === gDiff) {
    //         if (mdColors[mdKey].g < g) mdG += 2;
    //         else mdG -= 2;
    //     } else if (maxDiff === bDiff) {
    //         if (mdColors[mdKey].b < b) mdB += 2;
    //         else mdB -= 2;
    //     }
    //     mdKey = (mdB << 8) + (mdG << 4) + mdR;
    // }

    colors[key].mdKey = mdKey.toString(16);
    mdColors[mdKey] = {
      r,
      g,
      b,
      mdB,
      mdG,
      mdR,
      key,
      mdKey: mdKey.toString(16),
    };

    // replace colors with md colors
    // pixels.data[i] = mdR * 18;
    // pixels.data[i + 1] = mdG * 18;
    // pixels.data[i + 2] = mdB * 18;
  }
  return { colors, mdColors };
}
