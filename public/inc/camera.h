// Generated from camera.ts. DO NOT EDIT.
#ifndef _CAMERA_H_
#define _CAMERA_H_

#include "types.h"


typedef struct {
    s16 camPosX;
    s16 camPosY;
    s16 bgaPosX;
    s16 bgaPosY;
    s16 bgbPosX;
    s16 bgbPosY;
} Camera;

void CAMERA_centerOn(Camera *this, s16 posX, s16 posY);
void CAMERA_setCameraPosition(Camera *this, s16 x, s16 y);

#endif // _CAMERA_H_