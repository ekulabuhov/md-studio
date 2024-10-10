// Generated from player.ts. DO NOT EDIT.
#include "player.h"
#include "types.h"
#include "level.h"
#include "sprite_eng.h"
#include "joy.h"
#include "maths.h"
#include "res_collision.h"
#include "map.h"
#define ANIM_STAND 0
#define ANIM_WAIT 1
#define ANIM_WALK 2
#define ANIM_RUN 3
#define ANIM_BRAKE 4
#define ANIM_UP 5
#define ANIM_CROUNCH 6
#define ANIM_ROLL 7
//  1280 - 356 = 924
#define MAX_POSY FIX32(MAP_HEIGHT - 356)
//  48 is the width of the sprite
#define MIN_POSX FIX32(-8)
#define MAX_POSX FIX32(MAP_WIDTH - 100)
#define RUN_SPEED FIX32(6)
#define BRAKE_SPEED FIX32(2)
#define ACCEL FIX32(0.1)

void PLAYER_constructor(Player *this, Sprite *sprite, Map *map) {
    this->xOrder = 0;
    this->yOrder = 0;
    this->movX = 0;
    this->movY = 0;
    this->posX = FIX32(48);
    this->posY = MAX_POSY;
    this->hFlip = false;
    this->maxSpeed = FIX32(8);
    this->jumpSpeed = FIX32(7.8);
    this->gravity = FIX32(0.32);
    this->sprite = sprite;
    this->map = map;
  }

void PLAYER_handleInput(Player *this, u16 value) {
    if (value & BUTTON_UP) this->yOrder = -1;
    else if (value & BUTTON_DOWN) this->yOrder = +1;
    else this->yOrder = 0;

    if (value & BUTTON_LEFT) this->xOrder = -1;
    else if (value & BUTTON_RIGHT) this->xOrder = +1;
    else this->xOrder = 0;
  }

void PLAYER_update(Player *this) {
    // sonic physic, update movement first
    if (this->xOrder > 0) {
      this->movX += ACCEL;
      // going opposite side, quick breaking
      if (this->movX < 0) this->movX += ACCEL;

      if (this->movX >= this->maxSpeed) this->movX = this->maxSpeed;
    } else if (this->xOrder < 0) {
      this->movX -= ACCEL;
      // going opposite side, quick breaking
      if (this->movX > 0) this->movX -= ACCEL;

      if (this->movX <= -this->maxSpeed) this->movX = -this->maxSpeed;
    } else {
      // slow down
      if (this->movX < FIX32(0.1) && this->movX > FIX32(-0.1)) this->movX = 0;
      else if (this->movX < FIX32(0.3) && this->movX > FIX32(-0.3))
        this->movX -= this->movX >> 2;
      else if (this->movX < FIX32(1) && this->movX > FIX32(-1))
        this->movX -= this->movX >> 3;
      else this->movX -= this->movX >> 4;
    }

    // update position from movement
    this->posX += this->movX;
    this->posY += this->movY;

    // Reset Sonic if he falls to his death
    if (this->posY > FIX32(MAP_HEIGHT)) {
      this->posY = MAX_POSY - FIX32(100);
      this->posX -= FIX32(100);
      this->movY = 0;
      this->movX = 0;
    }

    // posX and posY are top left corner of the sprite
    // 40px is the height of the character, although rs file states it's 48
    s16 spriteBottomY = fix32ToInt(this->posY) + 40;
    s16 tileY = spriteBottomY >> 3;
    // Add 24px to put the sensor in the middle of the sprite
    s16 spriteMiddleX = fix32ToInt(this->posX) + 24;
    s16 tileX = spriteMiddleX >> 3;
    // tileIdx is last 10 bits
    s16 word = MAP_getTile(this->map, tileX, tileY);
    s16 tileId = word & 0x7ff;
    s16 hFlip = !!(word & (1 << 11));
    s16 offsetX = spriteMiddleX - tileX * 8;
    s16 heightValue = getHeightValue(tileId, offsetX);
    // Check if we're falling down or no gravity applied
    // Stops player from snapping to floor if he's jumping through platform
    if (tileId && heightValue && this->movY >= 0) {
      if (heightValue == 8) {
        word = MAP_getTile(this->map, tileX, tileY - 1);
        s16 tileIdAbove = word & 0x7ff;
        if (tileIdAbove) {
          heightValue = getHeightValue(tileIdAbove, offsetX);
          hFlip = !!(word & (1 << 11));
          tileY--;
        }
      }

      if (hFlip) {
        offsetX = 7 - offsetX;
      }

      s16 offsetY = (tileY + 1) * 8 - heightValue - spriteBottomY;
      // console.log({
      //   pos: `${tileX}x${tileY}`,
      //   tileId: tileId.toString(16),
      //   offsetX,
      //   offsetY,
      //   hFlip
      // });
      this->posY += FIX32(offsetY);
      this->movY = 0;
    } else {
      // apply gravity if needed
      this->movY += this->gravity;
    }

    // clip x pos
    if (this->posX >= MAX_POSX) {
      this->posX = MAX_POSX;
      this->movX = 0;
    } else if (this->posX <= MIN_POSX) {
      this->posX = MIN_POSX;
      this->movX = 0;
    }

    // finally update sprite state from internal state
    if (this->movY) SPR_setAnim(this->sprite, ANIM_ROLL);
    else {
      if (
        (this->movX >= BRAKE_SPEED && this->xOrder < 0) ||
        (this->movX <= -BRAKE_SPEED && this->xOrder > 0)
      ) {
        if (this->sprite->animInd != ANIM_BRAKE) {
          // XGM2_playPCM(sonic_stop_sfx, sizeof(sonic_stop_sfx), SOUND_PCM_CH3);
          SPR_setAnim(this->sprite, ANIM_BRAKE);
        }
      } else if (this->movX >= RUN_SPEED || this->movX <= -RUN_SPEED)
        SPR_setAnim(this->sprite, ANIM_RUN);
      else if (this->movX != 0) SPR_setAnim(this->sprite, ANIM_WALK);
      else {
        if (this->yOrder < 0) SPR_setAnim(this->sprite, ANIM_UP);
        else if (this->yOrder > 0) SPR_setAnim(this->sprite, ANIM_CROUNCH);
        else SPR_setAnim(this->sprite, ANIM_STAND);
      }
    }

    if (this->movX > 0) this->hFlip = false;
    else if (this->movX < 0) this->hFlip = true;
  }

void PLAYER_doJoyAction(Player *this, u16 joy, u16 changed, u16 state) {
    if (
      changed &
      state &
      (BUTTON_A | BUTTON_B | BUTTON_C | BUTTON_X | BUTTON_Y | BUTTON_Z)
    ) {
      if (this->movY == 0) {
        this->movY = -this->jumpSpeed;
        // XGM2_playPCMEx(
        //   sonic_jump_sfx,
        //   sizeof(sonic_jump_sfx),
        //   SOUND_PCM_CH2,
        //   15,
        //   TRUE,
        //   FALSE
        // );
      }
    }
  }

