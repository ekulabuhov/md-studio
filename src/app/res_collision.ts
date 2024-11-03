import { arrayToDc } from './asm_utils';
import { fs } from './fs_electron';

/**
 * An object containing tileId and an array of 8 y offsets ranging from 0 (fallthrough) to 8 (max floor).
 * E.g.: { "116": [8,8,8,8,8,8,8,8] }
 */
export type CollisionMap = { [tileId: number]: number[] };

let tileIdToHeightMap: CollisionMap;

export function getHeightValue(tileId, offsetX) {
  let heightMap = tileIdToHeightMap[tileId];
  if (!heightMap) {
    return 0;
  }
  return heightMap[offsetX];
}

export async function loadCollisionMap() {
  let fileContents = '{}';
  try {
    fileContents = await fs.readFile('collision_map.json');
  } catch (error) {}

  tileIdToHeightMap = JSON.parse(fileContents);

  return tileIdToHeightMap;
}

/**
 * This function stores collision_map.json file to browser facing file system (OPFS)
 * @param collisionMap
 */
export async function storeCollisionMap(collisionMap) {
  tileIdToHeightMap = collisionMap;

  fs.writeFile('collision_map.json', JSON.stringify(collisionMap));
}

/**
 * Generates SGDK compatible ASM file (.s) along with header file
 * @returns
 */
export function convertToAsm(collisionMap: CollisionMap) {
  // @ts-expect-error Object.key converts number keys to strings
  const indexCount = Math.max(...Object.keys(collisionMap)) + 1;
  const tileIdToCollisionMap = Array(indexCount).fill(0);
  Object.keys(collisionMap).forEach(
    // 0 is reserved for empty, starting from 1
    (key, i) => (tileIdToCollisionMap[key] = i + 1)
  );
  let asm =
    `.section .rodata_binf

    .align  2
    .global tileIdToHeightMap
tileIdToHeightMap:
` + arrayToDc(tileIdToCollisionMap);

  asm +=
    `
  .align  2
  .global heightMaps
heightMaps:
` + arrayToDc(Object.values(collisionMap).flat());

  const heightMapCount = Object.values(collisionMap).length;

  const header = `#ifndef _RES_COLLISION_H_
#define _RES_COLLISION_H_

extern const u8 tileIdToHeightMap[${indexCount}];
extern const u8 heightMaps[${heightMapCount}][8];

u8 getHeightValue(u16 tileId, u8 offsetX) {
  u8 heightMapIdx = tileIdToHeightMap[tileId];
  if (heightMapIdx == 0) {
      return 0;
  }
  const u8 *heightMap = heightMaps[heightMapIdx - 1];
  return heightMap[offsetX];
}

#endif // _RES_COLLISION_H_`;

  return { asm, header };
}
