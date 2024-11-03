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