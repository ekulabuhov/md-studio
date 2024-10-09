/**  
 * An object containing tileId and an array of 8 y offsets ranging from 0 (fallthrough) to 8 (max floor).
 * E.g.: { "116": [8,8,8,8,8,8,8,8] }
 */ 
let tileIdToHeightMap: { [key: number]: number[] };

export function getHeightValue(tileId, offsetX) {
  let heightMap = tileIdToHeightMap[tileId];
  if (!heightMap) {
    return 0;
  }
  return heightMap[offsetX];
}

export async function loadCollisionMap() {
  const opfsRoot = await navigator.storage.getDirectory();
  const fileHandle = await opfsRoot.getFileHandle('collision_map.json', {
    create: true,
  });
  const file = await fileHandle.getFile();
  const collisionMap = JSON.parse(await file.text());

  tileIdToHeightMap = collisionMap;
  return collisionMap;
}

/**
 * This function stores collision_map.json file to browser facing file system (OPFS)
 * @param collisionMap 
 */
export async function storeCollisionMap(collisionMap) {
  tileIdToHeightMap = collisionMap;

  const opfsRoot = await navigator.storage.getDirectory();
  const fileHandle = await opfsRoot.getFileHandle('collision_map.json', {
    create: true,
  });
  const stream = await fileHandle.createWritable();
  await stream.write(JSON.stringify(collisionMap));
  await stream.close();
}

/**
 * Generates SGDK compatible ASM file (.s) along with header file
 * @returns 
 */
export function convertToAsm() {
  // @ts-expect-error Object.key converts number keys to strings
  const indexCount = Math.max(...Object.keys(tileIdToHeightMap)) + 1;
  const tileIdToCollisionMap = Array(indexCount).fill(0);
  Object.keys(tileIdToHeightMap).forEach(
    // 0 is reserved for empty, starting from 1
    (key, i) => (tileIdToCollisionMap[key] = i + 1)
  );
  let asm =
    `.section .rodata_binf

    .align  2
    .global tileIdToHeightMap
tileIdToHeightMap:
` + arrayToDcb(tileIdToCollisionMap);

  asm +=
    `
  .align  2
  .global heightMaps
heightMaps:
` + arrayToDcb(Object.values(tileIdToHeightMap).flat());

  const heightMapCount = Object.values(tileIdToHeightMap).length;

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

function arrayToDcb(array: number[]) {
  let str = '';
  for (let y = 0; y < Math.ceil(array.length / 16); y++) {
    str += '    dc.b    ';

    str += array
      .slice(y * 16, Math.min(array.length, y * 16 + 16))
      .map((el) => '0x' + el.toString(16).padStart(2, '0'))
      .join(', ');
    str += '\n';
  }
  return str;
}

function fixNulls() {
  Object.keys(tileIdToHeightMap).forEach((key) =>
    tileIdToHeightMap[key].forEach((el, i) => {
      if (el === null) tileIdToHeightMap[key][i] = 0;
    })
  );
}
