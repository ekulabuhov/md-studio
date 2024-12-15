import { s8, u8 } from "./types";

/**
 * Follows SGDK TileMap definition to make translation to C simpler
 */
export class TileMap {
    w: number;
    h: number;
    tilemap: Array<number>;

    constructor(init: TileMap) {
        Object.assign(this, init);
    }
}

export type BoxCollision =
{
    x: s8;
    y: s8;
    w: u8;
    h: u8;
};