import { fix32, u16, u8 } from './types';
import {
  BUTTON_A,
  BUTTON_B,
  BUTTON_C,
  BUTTON_DOWN,
  BUTTON_LEFT,
  BUTTON_RIGHT,
  BUTTON_UP,
  BUTTON_X,
  BUTTON_Y,
  BUTTON_Z,
} from './joy';
import { FIX32, fix32ToInt } from './maths';
import { Sprite } from './sprite_eng';
import { getHeightValue } from './res_collision';
import { TileMap } from './vdp_tile';
import { ItemsDust } from './items_dust';
import { GameEntity } from './game_entity';

const ANIM_STAND = 0;
const ANIM_RUN = 1;
const ANIM_JUMP = 2;
const ANIM_FALL = 3;
const ANIM_DOUBLE_JUMP = 4;
const ACCEL = FIX32(0.1);

const STATE_DEAD = 0;

export class Player {
  // Horizontal joystick state: left (-1), right (+1), none (0)
  xOrder = 0;
  // Vertical joystick state: up (-1), down (+1), none (0)
  yOrder = 0;
  /** X velocity in fix32 */ 
  movX: fix32 = 0;
  /** Y velocity in fix32 */ 
  movY: fix32 = 0;
  // Current position
  posX: fix32 = FIX32(48);
  posY: fix32 = 0;
  // Horizontal flip
  hFlip = false;
  // Constants
  maxSpeed: fix32 = FIX32(3);
  jumpSpeed: fix32 = FIX32(5.8);
  gravity: fix32 = FIX32(0.32);
  sprite: Sprite;
  tileMap: TileMap;
  doubleJump: boolean;
  itemDust: ItemsDust;
  checksCollisions = true;
  state: number;

  constructor(sprite: Sprite, tileMap: TileMap, itemDust: ItemsDust) {
    this.sprite = sprite;
    this.tileMap = tileMap;
    this.itemDust = itemDust;
  }

  handleInput(value: u16) {
    if (value & BUTTON_UP) this.yOrder = -1;
    else if (value & BUTTON_DOWN) this.yOrder = +1;
    else this.yOrder = 0;

    if (value & BUTTON_LEFT) this.xOrder = -1;
    else if (value & BUTTON_RIGHT) this.xOrder = +1;
    else this.xOrder = 0;
  }

  update() {
    // sonic physic, update movement first
    if (this.xOrder > 0) {
      this.movX += ACCEL;
      // going opposite side, quick breaking
      if (this.movX < 0) this.movX += ACCEL;

      if (this.movX >= this.maxSpeed) this.movX = this.maxSpeed;
    } else if (this.xOrder < 0) {
      this.movX -= ACCEL;
      // going opposite side, quick breaking
      if (this.movX > 0) this.movX -= ACCEL;

      if (this.movX <= -this.maxSpeed) this.movX = -this.maxSpeed;
    } else {
      // slow down
      if (this.movX < FIX32(0.1) && this.movX > FIX32(-0.1)) this.movX = 0;
      else if (this.movX < FIX32(0.3) && this.movX > FIX32(-0.3))
        this.movX -= this.movX >> 2;
      else if (this.movX < FIX32(1) && this.movX > FIX32(-1))
        this.movX -= this.movX >> 3;
      else this.movX -= this.movX >> 4;
    }

    // update position from movement
    this.posX += this.movX;
    this.posY += this.movY;

    const posYInPx = fix32ToInt(this.posY);
    const posXInPx = fix32ToInt(this.posX);

    // posX and posY are top left corner of the sprite
    const spriteBottomY = posYInPx + this.sprite.definition.h;
    // Put the sensor in the middle of the sprite
    const spriteMiddleX = posXInPx + this.sprite.definition.w / 2;

    const bottomCollision = this.getCollision(spriteMiddleX, spriteBottomY);
    // Check if we're falling down or no gravity applied
    // Stops player from snapping to floor if he's jumping through platform
    if (bottomCollision && this.movY >= 0) {
      const offsetY = spriteBottomY - (spriteBottomY >> 3 << 3);
      this.posY -= FIX32(offsetY);
      this.movY = 0;
    } else {
      // apply gravity if needed
      this.movY += this.gravity;

      // Speed higher than 8 makes our character fall through the floor
      if (this.movY > FIX32(7)) {
        this.movY = FIX32(7);
      }
    }

    // Check that we hit the ceiling
    // Are we moving up?
    if (this.movY < 0) {
      const topCollision = this.getCollision(spriteMiddleX, posYInPx);
      if (topCollision) {
        this.movY = 0;
      }
    }

    // Check that we're hitting a wall on horizontal axis
    if (this.movX) {
      const spriteMiddleY = posYInPx + this.sprite.definition.h / 2;
      const spriteX = (this.movX > 0)
        ? posXInPx + this.sprite.definition.w
        : posXInPx;

      const sideCollision = this.getCollision(spriteX, spriteMiddleY);
      if (sideCollision) {
        this.posX -= this.movX;
        this.movX = 0;
      }
    }

    if (this.movY < 0 && this.doubleJump) {
      this.sprite.setAnim(ANIM_DOUBLE_JUMP);
    } else if (this.movY < 0) {
      this.sprite.setAnim(ANIM_JUMP);
    } else if (this.movY > 0) {
      this.sprite.setAnim(ANIM_FALL);
      this.doubleJump = false;
    } else {
      this.sprite.setAnim(this.movX != 0 ? ANIM_RUN : ANIM_STAND);
    }

    // finally update sprite state from internal state
    // if (this.movY) this.sprite.setAnim(ANIM_ROLL);
    // else {
    //   if (
    //     (this.movX >= BRAKE_SPEED && this.xOrder < 0) ||
    //     (this.movX <= -BRAKE_SPEED && this.xOrder > 0)
    //   ) {
    //     if (this.sprite.animInd != ANIM_BRAKE) {
    //       // XGM2_playPCM(sonic_stop_sfx, sizeof(sonic_stop_sfx), SOUND_PCM_CH3);
    //       this.sprite.setAnim(ANIM_BRAKE);
    //     }
    //   } else if (this.movX >= RUN_SPEED || this.movX <= -RUN_SPEED)
    //     this.sprite.setAnim(ANIM_RUN);
    //   else if (this.movX != 0) this.sprite.setAnim(ANIM_WALK);
    //   else {
    //     if (this.yOrder < 0) this.sprite.setAnim(ANIM_UP);
    //     else if (this.yOrder > 0) this.sprite.setAnim(ANIM_CROUNCH);
    //     else this.sprite.setAnim(ANIM_STAND);
    //   }
    // }

    if (this.movX > 0) this.hFlip = false;
    else if (this.movX < 0) this.hFlip = true;
  }

  getCollision(posX: fix32, posY: fix32): u8 {
    if (!this.checksCollisions) { 
      return 0;
    }

    // Divide by 8 to get the tileX
    const tileX = posX >> 3;
    // Divide by 8 to get the tileY
    const tileY = posY >> 3;
    const tileMapIndex = tileY * this.tileMap.w + tileX;
    const word = this.tileMap.tilemap[tileMapIndex];
    // tileIdx is last 10 bits
    const tileId = word & 0x7ff;
    const offsetX = posX - tileX * 8;
    return getHeightValue(tileId, offsetX);
  }

  doJoyAction(joy: u16, changed: u16, state: u16) {
    const anyButton =
      BUTTON_A | BUTTON_B | BUTTON_C | BUTTON_X | BUTTON_Y | BUTTON_Z;

    if (changed & state & anyButton) {
      if (this.movY == 0) {
        this.movY = -this.jumpSpeed;
        this.itemDust.place(this.posX, this.posY);
        
        // XGM2_playPCMEx(
        //   sonic_jump_sfx,
        //   sizeof(sonic_jump_sfx),
        //   SOUND_PCM_CH2,
        //   15,
        //   TRUE,
        //   FALSE
        // );
      } else if (!this.doubleJump) {
        // If we're in the air already - do a double jump!
        this.doubleJump = true;
        this.movY = -this.jumpSpeed;
      }
    }

    if (changed & ~state & anyButton) {
      this.movY = this.movY >> 1;
    }
  }

  die(from: GameEntity) {
    if (this.state === STATE_DEAD) {
      return;
    } 
    this.state = STATE_DEAD;

    this.movX -= FIX32(10.8);
    if (from.posX < this.posX) {
      this.movX = -this.movX;
    }
    this.movY -= FIX32(5.8);
    this.checksCollisions = false;
  }
}
