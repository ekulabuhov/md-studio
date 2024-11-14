import { arrayToDc } from './asm_utils';
import { fs } from './fs_electron';
import { calculatePalette } from './palette';
import { CollisionMap, convertToAsm } from './res_collision';
import {
  arrayIsSubset,
  camelToSnakeCase,
  getImagePixelData,
  getUnique,
  replaceColor,
  snakeCaseToPascalCase,
} from './utils';

type Sprite = {
  id: string;
  frameWidth: number;
  frameHeight: number;
  animations: {
    name: string;
    imageURL?: string;
    frames?: string[];
  }[];
  paletteIndex?: number;
  script;
  params: any[];
};

export type CompileData = {
  collisionMap: CollisionMap;
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
  sprites: Sprite[];
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

  const existingPalettes = bgaPalettes.concat(bgbPalettes);

  try {
    await fs.deleteFile('res/gfx.res');
  } catch (_) {}

  // Unique by ID
  const uniqueSprites = [
    ...new Map(compileData.sprites.map((item) => [item.id, item])).values(),
  ];
  for await (const sprite of uniqueSprites) {
    await processSprite(sprite, existingPalettes);
  }
  // Copy paletteIndex
  uniqueSprites.forEach((uSprite) => {
    compileData.sprites
      .filter((sprite) => sprite.id === uSprite.id)
      .forEach((s) => (s.paletteIndex = uSprite.paletteIndex));
  });

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

  const instanceNames: { handlesCollisions: boolean, name: string }[] = [];
  const instanceGroups: { key: string; min: number; max?: number }[] = [];
  const mainFileContents = `#include <genesis.h>
#include "res.h"
// Depends on presence of sprites
#include "gfx.h"

#include "camera.h"

${compileData.sprites
  .map(
    (sprite) =>
      `#include "${camelToSnakeCase(sprite.script.name).toLowerCase()}.h"`
  )
  .filter(getUnique)
  .join('\n')}

Player player;
Camera camera;

// forward declarations
static void joyEvent(u16 joy, u16 changed, u16 state);

int main(bool hard) {
    u16 ind = TILE_USER_INDEX;

    // Load BG_A
    VDP_loadTileSet(&bga_tileset, ind, DMA);
    VDP_setTileMapEx(BG_A, &bga_tilemap, TILE_ATTR_FULL(PAL0, TRUE, FALSE, FALSE, ind), 0, 0, 0, 0, 64, 32, CPU);
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

    ${compileData.sprites
      .map((sprite, i) => {
        const output = [];

        // We can re-use the tileset if we've seen it before
        const masterSpriteIndex = compileData.sprites.findIndex(
          (s) => s.id === sprite.id
        );
        const isSlaveSprite = masterSpriteIndex !== i;
        // Master sprite is only required if you have more than one sprite of the same type
        const hasMasterSprite = compileData.sprites.filter(s => s.id === sprite.id).length > 1;
        const isMasterSprite = !isSlaveSprite && hasMasterSprite;

        if (isMasterSprite) {
          output.push(
            `Sprite *${sprite.id}_master_sprite = SPR_addSprite(&${sprite.id}_sprite_def, 0, 0, TILE_ATTR(PAL${sprite.paletteIndex}, TRUE, FALSE, FALSE));`,
          );
          // Hide master sprite off screen so it can't be affected by player actions
          output.push(`SPR_setPosition(${sprite.id}_master_sprite, -128, -128);`);
        }

        output.push(
          `Sprite *${sprite.id}_${i}_sprite = SPR_addSprite(&${sprite.id}_sprite_def, 0, 0, TILE_ATTR(PAL${sprite.paletteIndex}, TRUE, FALSE, FALSE));`,
        );
        if (hasMasterSprite) {
          output.push(
            `SPR_setAutoTileUpload(${sprite.id}_${i}_sprite, FALSE);`
          );
          output.push(
            `SPR_setVRAMTileIndex(${sprite.id}_${i}_sprite, ${sprite.id}_master_sprite->attribut & TILE_INDEX_MASK);`
          );
        }
        if (sprite.paletteIndex === 3) {
          output.push(
            `PAL_setPaletteColors(16*3, ${sprite.id}_sprite_def.palette, CPU);`
          );
        }

        const className = camelToSnakeCase(sprite.script.name).toUpperCase();
        const structName = snakeCaseToPascalCase(className);
        let instanceName = className.toLowerCase();
        if (instanceName !== 'player') {
          instanceName += `_${i}`;
          output.push(`${structName} ${instanceName};`);
        }

        const handlesCollisions = !!sprite.script.prototype.handleCollision;
        instanceNames.push({ handlesCollisions, name: instanceName });
        if (handlesCollisions) {
          const ig = instanceGroups.find((ig) => ig.key === className);
          if (!ig) {
            instanceGroups.push({ key: className, min: i });
          } else {
            ig.max = i;
          }
        }

        const params = sprite.params.map((param) => {
          if (Array.isArray(param)) {
            output.push(
              `s16 paramPtr_${i}[${param.length}][${
                param[0].length
              }] = ${JSON.stringify(param)
                .replaceAll('[', '{')
                .replaceAll(']', '}')};`
            );
            return `paramPtr_${i}`;
          } else if (typeof param === 'string' && param[0] === '&') {
            const spriteRefIndex = compileData.sprites.findIndex(sprite => '&' + sprite.id === param);
            if (spriteRefIndex !== -1) {
              return '&' + instanceNames[spriteRefIndex].name;
            }
          }
          
          return param;
        });

        // Second param is always a Sprite definition
        params.unshift(`${sprite.id}_${i}_sprite`);

        output.push(
          `${className}_constructor(&${instanceName}, ${params.join(', ')});`
        );
        return output.join('\n\t');
      })
      .join('\n\n\t')}

    CAMERA_constructor(&camera, 512, 256);
    camera.follows = &player;
    
    JOY_setEventHandler(joyEvent);

    void* sprites[] = {${instanceNames.map(IN => IN.handlesCollisions ? '&' + IN.name : 'NULL').join(',')}};

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

      ${compileData.sprites
        .map((sprite, i) => {
          // Skip player for now due to special handling
          if (sprite.id === 'player') {
            return [];
          }

          const className = camelToSnakeCase(sprite.script.name).toUpperCase();
          const instanceName = className.toLowerCase() + `_${i}`;
          const output = [`${className}_update(&${instanceName});`];
          output.push(
            `SPR_setPosition(${instanceName}.sprite, fix32ToInt(${instanceName}.posX) - camera.camPosX, fix32ToInt(${instanceName}.posY) - camera.camPosY);`
          );

          return output.join('\n      ');
        })
        .join('\n\n      ')}

      for (size_t i = 0; i < sizeof(sprites) / sizeof(sprites[0]); i++)
      {
          if (sprites[i] == NULL) {
            continue;
          }

          GameEntity *entity = (GameEntity*)sprites[i];
          if (entity->posX < player.posX + FIX32(player.sprite->definition->w) &&
              entity->posX + FIX32(entity->sprite->definition->w) > player.posX &&
              entity->posY < player.posY + FIX32(player.sprite->definition->h) &&
              entity->posY + FIX32(entity->sprite->definition->h) > player.posY)
          {
            ${instanceGroups
              .map((ig) => {
                return (
                  `if (i >= ${ig.min} && i <= ${ig.max}) {` +
                  `${ig.key}_handleCollision(sprites[i], &player);` +
                  `}`
                );
              })
              .join('\n            ')}
          }
      }

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

async function processBackgroundWithTileMap(
  id: string,
  imgUrl: string,
  tileMap: number[][],
  existingPalettes?: number[][]
) {
  const { pixels, canvas, context } = await getImagePixelData(imgUrl);
  // Increase the tilemap offset
  const flatTileMap = tileMap.flat();

  // Calculate unique colors
  const { palettePerTile, tilePixels, palettes } = calculatePalette(
    canvas,
    existingPalettes
  );

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
${arrayToDc(flatTileMap, 4, 'w')}

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

async function processSprite(sprite: Sprite, existingPalettes?: number[][]) {
  const { canvas, context } = await convertAnimationsIntoSpritesheet(sprite);

  // Calculate unique colors
  const { palettes, coloredImage } = calculatePalette(canvas);

  if (palettes.length > 1) {
    throw new Error(
      `more than 16 colors per sprite is unsupported in ${sprite.id}`
    );
  }

  let spritePalette = palettes[0];
  sprite.paletteIndex = -1;

  // Check if there's an existing palette we could use
  existingPalettes.forEach((existingPalette, i) => {
    if (arrayIsSubset(palettes[0], existingPalette)) {
      console.log(`found a match for ${sprite.id}: ${i}`);
      spritePalette = existingPalette;
      sprite.paletteIndex = i;
    }
  });

  // If there's some space left in existing palette - add it there
  if (sprite.paletteIndex === -1) {
    for (let i = 0; i < existingPalettes.length; i++) {
      const spaceRemaining = 16 - existingPalettes[i].length;
      if (spaceRemaining >= spritePalette.length) {
        spritePalette.forEach((color) => {
          if (!existingPalettes[i].includes(color)) {
            existingPalettes[i].push(color);
          }
        });
        spritePalette = existingPalettes[i];
        sprite.paletteIndex = i;
        break;
      }
    }
  }

  // If there's an unused palette slot - use it
  if (sprite.paletteIndex === -1 && existingPalettes.length < 4) {
    existingPalettes.push(spritePalette);
    sprite.paletteIndex = existingPalettes.length - 1;
  }

  // As last resort - use palette that has most common colors (discards colors that don't fit)
  if (sprite.paletteIndex === -1) {
    let max = 0;
    let maxIndex = -1;
    for (let i = 0; i < existingPalettes.length; i++) {
      const spaceRemaining = 16 - existingPalettes[i].length;
      const commonColors = spritePalette.filter((val) =>
        existingPalettes[i].includes(val)
      ).length;
      const totalAvailable = spaceRemaining + commonColors;
      if (totalAvailable > max) {
        max = totalAvailable;
        maxIndex = i;
      }
    }

    if (maxIndex !== -1) {
      for (const color of spritePalette) {
        if (!existingPalettes[maxIndex].includes(color)) {
          existingPalettes[maxIndex].push(color);
          if (existingPalettes[maxIndex].length === 16) {
            break;
          }
        }
      }

      // Eliminate missing colors so that rescomp doesn't complain
      const missingColors = spritePalette.filter(
        (val) => !existingPalettes[maxIndex].includes(val)
      );
      missingColors.forEach((missingColor) => {
        const colorToReplace = convert333BGRTo888RGB(missingColor, 'object');
        const replaceWith = convert333BGRTo888RGB(
          existingPalettes[maxIndex][1],
          'object'
        );
        replaceColor(coloredImage, colorToReplace, replaceWith);
      });

      sprite.paletteIndex = maxIndex;
      spritePalette = existingPalettes[maxIndex];
    }
  }

  if (sprite.paletteIndex === -1) {
    throw new Error(`no room left for the palette in ${sprite.id}`);
  }

  // Add space for palette
  canvas.height += 8 * 4;
  // Draw palette above the sprite image for SGDK's rescomp
  spritePalette.forEach((color, i) => {
    context.fillStyle =
      i === 0 ? 'rgba(0,0,0,0)' : convert333BGRTo888RGB(color);
    context.fillRect(i * 8, 0, 8, 8);
  });

  context.putImageData(coloredImage, 0, 32);

  const blob = await canvas.convertToBlob();
  const buffer = await blob.arrayBuffer();

  const fileName = sprite.id + '.png';
  fs.writeFile(`res/${fileName}`, new Uint8Array(buffer));

  fs.writeFile(
    'res/gfx.res',
    `SPRITE ${sprite.id}_sprite_def "${fileName}" ${Math.ceil(
      sprite.frameWidth / 8
    )} ${Math.ceil(sprite.frameWidth / 8)} FAST 5\n`,
    { flag: 'a+' }
  );
}

async function animationToImageBitmap(animation: {
  frames?: string[];
  imageURL?: string;
}) {
  if (animation.frames) {
    const frameBitmaps: ImageBitmap[] = [];
    let animationWidth = 0;
    let animationHeight = 0;
    for await (const frame of animation.frames) {
      const response = await fetch(frame);
      const fileBlob = await response.blob();
      const frameBitmap = await createImageBitmap(fileBlob);
      frameBitmaps.push(frameBitmap);
      animationWidth += frameBitmap.width;
      animationHeight = Math.max(animationHeight, frameBitmap.height);
    }
    const canvas = new OffscreenCanvas(animationWidth, animationHeight);
    const context = canvas.getContext('2d')!;
    let xOffset = 0;
    frameBitmaps.forEach((bitmap) => {
      context.drawImage(bitmap, xOffset, 0);
      xOffset += bitmap.width;
    });
    return createImageBitmap(canvas);
  } else {
    const response = await fetch(animation.imageURL);
    const fileBlob = await response.blob();
    return createImageBitmap(fileBlob);
  }
}

export async function convertAnimationsIntoSpritesheet(sprite: Sprite) {
  let sheetWidth = 0;
  let sheetHeight = 0;
  let bitmaps: ImageBitmap[] = [];
  const animFrameCount = [];
  for await (const animation of sprite.animations) {
    const bitmap = await animationToImageBitmap(animation);

    sheetWidth = Math.max(sheetWidth, bitmap.width);
    sheetHeight += bitmap.height;
    bitmaps.push(bitmap);
    animFrameCount.push(bitmap.width / sprite.frameWidth);
  }

  // Check if we're aligned to grid, and if not - then align
  if (sprite.frameWidth % 8) {
    // E.g. 38px will produce closest of 8 which is 40px
    const alignedFrameWidth = Math.ceil(sprite.frameWidth / 8) * 8;
    sheetWidth = animFrameCount[0] * alignedFrameWidth;
    const canvas = new OffscreenCanvas(sheetWidth, alignedFrameWidth);
    const context = canvas.getContext('2d')!;

    for (let i = 0; i < animFrameCount[0]; i++) {
      context.drawImage(
        bitmaps[0],
        i * sprite.frameWidth,
        0,
        sprite.frameWidth,
        sprite.frameWidth,
        i * alignedFrameWidth + 1,
        1,
        sprite.frameWidth,
        sprite.frameWidth
      );
    }

    return {
      canvas,
      context,
      animFrameCount,
      frameWidth: alignedFrameWidth,
      frameHeight: alignedFrameWidth,
    };
  }

  const canvas = new OffscreenCanvas(sheetWidth, sheetHeight);
  const context = canvas.getContext('2d')!;
  let yOffset = 0;
  bitmaps.forEach((bitmap) => {
    context.drawImage(bitmap, 0, yOffset);
    yOffset += bitmap.height;
  });

  return {
    canvas,
    context,
    animFrameCount,
    frameWidth: sprite.frameWidth,
    frameHeight: sprite.frameHeight,
  };
}

function convert333BGRTo888RGB(
  color: number,
  format: 'hex' | 'object' = 'hex'
): any {
  const mdR = color & 0xf;
  const mdG = (color >> 4) & 0xf;
  const mdB = color >> 8;

  const mdColors = [mdR, mdG, mdB];

  if (format !== 'hex' && format !== 'object') {
    throw new Error('wrong format');
  }

  if (format === 'hex') {
    return (
      '#' +
      mdColors
        .map((color) => (color * 18).toString(16).padStart(2, '0'))
        .join('')
    );
  } else if (format === 'object') {
    return {
      r: mdR * 18,
      g: mdG * 18,
      b: mdB * 18,
    };
  }
}
