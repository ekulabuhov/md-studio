import { fix32, u16 } from './types';
import { HIDDEN, Sprite } from './sprite_eng';
import { FIX32 } from './maths';
import { GameEntity } from './game_entity';

const ANIM_COLLECTED = 1;

export class ItemsApple {
  // Current position
  posX: fix32 = 0;
  posY: fix32 = 0;
  sprite: Sprite;

  constructor(sprite: Sprite, posX: u16, posY: u16) {
    this.sprite = sprite;
    this.posX = FIX32(posX);
    this.posY = FIX32(posY);
  }

  update() {
    if (this.sprite.animInd == ANIM_COLLECTED && this.sprite.isAnimationDone()) {
      this.sprite.setVisibility(HIDDEN);
      // SPR_releaseSprite(this->sprite);
    }
  }

  handleCollision(other: GameEntity) {
    if (this.sprite.animInd != ANIM_COLLECTED) {
      this.sprite.setAnimationLoop(false);
      this.sprite.setAnim(ANIM_COLLECTED);

      this.sprite.setAutoTileUpload(true);
      this.sprite.setVRAMTileIndex(-1);
    }
  }
}
