import { arrayToDc } from './asm_utils';
import { fs } from './fs_electron';
import { calculatePalette } from './palette';
import { CollisionMap, convertToAsm } from './res_collision';
import { getImagePixelData } from './utils';

type Sprite = {
  id: string;
  frameWidth: number;
  animations: {
    name: string;
    imageURL: string;
  }[]
};

export type CompileData = {
  collisionMap: CollisionMap,
  bgA: {
    imageURL: string;
    tiles: {
      map: number[][];
    };
  };
  bgB: {
    imageURL: string;
    tiles: {
      coverMode?: string;
    };
  };
  sprites: Sprite[]
};

export async function compileRom(compileData: CompileData) {
  const bgaPalettes = await processBackgroundWithTileMap(
    'bga',
    compileData.bgA.imageURL,
    compileData.bgA.tiles.map
  );
  const bgbPalettes = await processBackgroundWithTileMap(
    'bgb',
    compileData.bgB.imageURL,
    [],
    [[0]]
  );

  for await (const sprite of compileData.sprites) {
    await processSprite(sprite)
  }

  const mdPalette = bgaPalettes
    .concat(bgbPalettes)
    .flat()
    .map((color) => '0x' + color.toString(16))
    .join(', ');
  const hFileContents = `#ifndef _RES_H_
    #define _RES_H_
    
    extern const TileSet bga_tileset;
    extern const TileMap bga_tilemap;

    extern const TileSet bgb_tileset;
    
    #endif // _RES_H_`;
  fs.writeFile('res/res.h', hFileContents);

  const mainFileContents = `#include <genesis.h>
#include "res.h"
// Depends on presence of sprites
#include "gfx.h"

// Depends on player.ts/c
#include "player.h"
#include "camera.h"

Player player;
Camera camera;

// forward declarations
static void joyEvent(u16 joy, u16 changed, u16 state);

int main(bool hard) {
    u16 ind = TILE_USER_INDEX;

    // Load BG_A
    VDP_loadTileSet(&bga_tileset, ind, DMA);
    // VDP_setTileMap(BG_A, &bga_tilemap, 0, 0, 64, 32, CPU);
    VDP_setTileMapEx(BG_A, &bga_tilemap, ind, 0, 0, 0, 0, 64, 32, CPU);
    ind += bga_tileset.numTile;

    // Load BG_B
    VDP_loadTileSet(&bgb_tileset, ind, DMA);

    // Generates tilemap on the fly - by tiling the whole screen with repeating pattern
    u16 tilemap[64 * 32];
    TileMap bgb_tilemap = {.w = 64, .h = 32, .compression = 0, .tilemap = tilemap};
    for (size_t y = 0; y < 32; y++)
    {
        for (size_t x = 0; x < 64; x++)
        {
            size_t i = y * 64 + x;
            tilemap[i] = (y % 8) * 8 + x % 8;
        }
    }
    VDP_setTileMapEx(BG_B, &bgb_tilemap, TILE_ATTR_FULL(PAL2, FALSE, FALSE, FALSE, ind), 0, 0, 0, 0, 64, 32, CPU);

    // Load palette
    u16 colors[] = { ${mdPalette} };
    PAL_setColors(0, colors, sizeof(colors) / 2, CPU);

    // Load sprites 
    // init sprite engine with default parameters
    SPR_init();
    Sprite *ninja_frog_sprite = SPR_addSprite(&ninja_frog_sprite_def, 0, 0, TILE_ATTR(PAL3, TRUE, FALSE, FALSE));
    PAL_setPaletteColors(16*3, ninja_frog_sprite_def.palette, CPU);

    PLAYER_constructor(&player, ninja_frog_sprite, &bga_tilemap);
    CAMERA_constructor(&camera, &player, 512, 256);
    
    JOY_setEventHandler(joyEvent);

    while (TRUE)
    {
      u16 joyState = JOY_readJoypad(JOY_1);

      // First
      PLAYER_handleInput(&player, joyState);
      PLAYER_update(&player);

      SPR_setHFlip(player.sprite, player.hFlip);

      // then set camera from player position
      CAMERA_centerOn(&camera, fix32ToInt(player.posX), fix32ToInt(player.posY));

      VDP_setHorizontalScroll(BG_A, -camera.bgaPosX);
      VDP_setHorizontalScroll(BG_B, -camera.bgbPosX);
      VDP_setVerticalScroll(BG_A, camera.bgaPosY);
      VDP_setVerticalScroll(BG_B, camera.bgbPosY);

      s16 x = fix32ToInt(player.posX) - camera.camPosX;
      s16 y = fix32ToInt(player.posY) - camera.camPosY;
      SPR_setPosition(player.sprite, x, y);

      // update sprites
      SPR_update();
      SYS_doVBlankProcess();
    }

    return 0;
}

static void joyEvent(u16 joy, u16 changed, u16 state)
{
    PLAYER_doJoyAction(&player, joy, changed, state);
}`;

  fs.writeFile('src/main.c', mainFileContents);

  writeCollisionMap(compileData.collisionMap);

  console.log('started compilation');
  const response = await window.project.compile();
  console.log(response);
}

function writeCollisionMap(collisionMap: CollisionMap) {
  const { header, asm } = convertToAsm(collisionMap);
  fs.writeFile('/res/res_collision.h', header);
  fs.writeFile('/res/res_collision.s', asm);
}

async function processBackgroundWithTileMap(id: string, imgUrl: string, tileMap: number[][], existingPalettes?: number[][]) {
  const { pixels, canvas, context } = await getImagePixelData(imgUrl);
  // Increase the tilemap offset
  const flatTileMap = tileMap.flat();

  // Calculate unique colors
  const { palettePerTile, tilePixels, palettes } = calculatePalette(canvas, existingPalettes);

  // Build array of tileData bytes
  const bytes = [];
  const tileCount = pixels.data.length / 256;

  for (let tileIdx = 0; tileIdx < tileCount; tileIdx++) {
    const selectedPaletteIdx = palettePerTile[tileIdx];
    const selectedPalette = palettes[selectedPaletteIdx];
    if (selectedPaletteIdx) {
      // Find all the tilemap entries and set palette idx
      flatTileMap.forEach((entry, i) => {
        if (entry === tileIdx) {
          flatTileMap[i] += selectedPaletteIdx << 13;
        }
      });
    }

    for (let y = 0; y < 8; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        const i = y * 8 + x;
        const key = tilePixels[tileIdx][i];
        let colorIndex = selectedPalette.indexOf(key);

        if (isNaN(colorIndex) || colorIndex === -1) {
          debugger;
        }

        if (x % 2 === 0) {
          byte = colorIndex << 4;
        } else {
          byte += colorIndex;
          bytes.push(byte);
        }
      }
    }
  }

  // 8px * 8px * 4 bytes = 256 bytes
  writeTileSetFile(id, bytes, tileCount);

  const asmFileContents = `.section .rodata_binf

    .align  2
${id}_tilemap_data:
${arrayToDc(
  flatTileMap,
  4,
  'w'
)}

    .align 2
    .global ${id}_tilemap
${id}_tilemap:
    dc.w    0  /* compression */ 
    dc.w    64 /* w */
    dc.w    32 /* h */
    dc.l    ${id}_tilemap_data`;

  fs.writeFile(`res/${id}_tilemap.s`, asmFileContents);

  return palettes;
}

function writeTileSetFile(id: string, bytes: any[], tileCount: number) {
    const asmFileContents = `.section .rodata_binf

    .align  2
${id}_tileset_data:
${arrayToDc(bytes, 4)}

    .align 2
    .global ${id}_tileset
${id}_tileset:
    dc.w    0
    dc.w    ${tileCount} /* number of tiles */
    dc.l    ${id}_tileset_data`;

    fs.writeFile(`res/${id}_tileset.s`, asmFileContents);
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

async function processSprite(sprite: Sprite) {
  const { canvas, context } = await convertAnimationsIntoSpritesheet(sprite);
  
  // Calculate unique colors
  const { palettes, coloredImage } = calculatePalette(canvas);

  // Add space for palette
  canvas.height += 8 * 4;
  palettes[0].forEach((color, i) => {
    context.fillStyle = i === 0 ? 'rgba(0,0,0,0)' : convert333BGRTo888RGB(color);
    context.fillRect(i * 8, 0, 8, 8);
  });

  context.putImageData(coloredImage, 0, 32);

  const blob = await canvas.convertToBlob();
  const buffer = await blob.arrayBuffer();
  
  const fileName = sprite.id + '.png';
  fs.writeFile(`res/${fileName}`, new Uint8Array(buffer));

  fs.writeFile('res/gfx.res', `SPRITE ${sprite.id}_sprite_def "${fileName}" 4 4 FAST 5`);
}

export async function convertAnimationsIntoSpritesheet(sprite: Sprite) {
  let sheetWidth = 0;
  let sheetHeight = 0;
  let bitmaps: ImageBitmap[] = [];
  const animFrameCount = [];
  for await (const animation of sprite.animations) {
    const response = await fetch(animation.imageURL);
    const fileBlob = await response.blob();
    const bitmap = await createImageBitmap(fileBlob);
    sheetWidth = Math.max(sheetWidth, bitmap.width);
    sheetHeight += bitmap.height;
    bitmaps.push(bitmap);
    animFrameCount.push(bitmap.width / sprite.frameWidth);
  }

  const canvas = new OffscreenCanvas(sheetWidth, sheetHeight);
  const context = canvas.getContext('2d')!;
  let yOffset = 0;
  bitmaps.forEach((bitmap) => {
    context.drawImage(bitmap, 0, yOffset);
    yOffset += bitmap.height;
  });
  
  return { canvas, context, animFrameCount };
}

function convert333BGRTo888RGB(color: number) {
  const mdR = color & 0xf;
  const mdG = (color >> 4) & 0xf;
  const mdB = (color >> 8);

  const mdColors = [mdR, mdG, mdB];

  return '#' + mdColors.map(color => (color * 18).toString(16).padStart(2, '0')).join('');
}