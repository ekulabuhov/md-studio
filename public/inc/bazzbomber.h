#ifndef _BAZZBOMBER_H_
#define _BAZZBOMBER_H_

#include "types.h"
#include "types.h"
#include "sprite_eng.h"

typedef struct {
    fix32 posX;
    fix32 posY;
    Sprite *sprite;
} Bazzbomber;

void BAZZBOMBER_constructor(Bazzbomber *this, Sprite *sprite, fix32 posX, fix32 posY);
void BAZZBOMBER_update(Bazzbomber *this);

#endif // _BAZZBOMBER_H_