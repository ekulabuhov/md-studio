#ifndef _RES_COLLISION_H_
#define _RES_COLLISION_H_

extern const u8 tileIdToHeightMap[446];
extern const u8 heightMaps[60][8];

u8 getHeightValue(u16 tileId, u8 offsetX) {
    u8 heightMapIdx = tileIdToHeightMap[tileId];
    if (heightMapIdx == 0) {
        return 0;
    }
    const u8 *heightMap = heightMaps[heightMapIdx - 1];
    return heightMap[offsetX];
}

#endif // _RES_COLLISION_H_