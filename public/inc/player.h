// Generated from player.ts. DO NOT EDIT.
#ifndef _PLAYER_H_
#define _PLAYER_H_

#include "types.h"
#include "types.h"
#include "sprite_eng.h"
#include "map.h"

typedef struct {
    s16 xOrder;
    s16 yOrder;
    fix32 movX;
    fix32 movY;
    fix32 posX;
    fix32 posY;
    s16 hFlip;
    fix32 maxSpeed;
    fix32 jumpSpeed;
    fix32 gravity;
    Sprite *sprite;
    Map *map;
} Player;

void PLAYER_constructor(Player *this, Sprite *sprite, Map *map);
void PLAYER_handleInput(Player *this, u16 value);
void PLAYER_update(Player *this);
void PLAYER_doJoyAction(Player *this, u16 joy, u16 changed, u16 state);

#endif // _PLAYER_H_