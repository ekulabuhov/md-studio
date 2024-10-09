import { coordsToTile } from './canvas/coords_to_tile';

export class Map {
    getTile(tileX: number, tileY: number) {
        return coordsToTile[tileY]?.[tileX];
    }
}