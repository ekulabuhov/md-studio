#include "bazzbomber.h"
#include "maths.h"
#include "sprite_eng.h"
#include "types.h"

void BAZZBOMBER_constructor(Bazzbomber *this, Sprite *sprite, fix32 posX, fix32 posY) {
    
        this->sprite = sprite;
        this->posX = posX;
        this->posY = posY;
    }

void BAZZBOMBER_update(Bazzbomber *this) {
        this->posX -= FIX32(1);
    }

