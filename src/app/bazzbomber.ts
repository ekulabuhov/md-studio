import { FIX32 } from "./maths";
import { Sprite } from "./sprite_eng";
import { fix32 } from "./types";

export class BazzBomber {
    posX: fix32;
    posY: fix32;
    sprite: Sprite;
    hFlip: boolean;

    constructor(sprite: Sprite, posX: fix32, posY: fix32) {
        this.sprite = sprite;
        this.posX = posX;
        this.posY = posY;
    }

    update() {
        this.posX -= FIX32(1);
    }
}