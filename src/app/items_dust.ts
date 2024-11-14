import { fix32 } from './types';
import { HIDDEN, Sprite, VISIBLE } from './sprite_eng';

const ANIM_IDLE = 0;

export class ItemsDust {
  // Current position
  posX: fix32 = 0;
  posY: fix32 = 0;
  sprite: Sprite;

  constructor(sprite: Sprite) {
    this.sprite = sprite;
    this.sprite.setVisibility(HIDDEN);
    this.sprite.setAnimationLoop(false);
  }

  update() {
    if (this.sprite.isAnimationDone()) {
        this.sprite.setVisibility(HIDDEN);
    }
  }

  place(posX: fix32, posY: fix32) {
    this.sprite.setAnimAndFrame(ANIM_IDLE, 0);
    this.sprite.setVisibility(VISIBLE);
    this.posX = posX;
    this.posY = posY;
  }
}
