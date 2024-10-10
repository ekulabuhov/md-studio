// Generated from camera.ts. DO NOT EDIT.
#include "camera.h"
#include "level.h"
#include "types.h"

void CAMERA_centerOn(Camera *this, s16 posX, s16 posY) {
    // get entity position (pixel)
    s16 px = posX;
    s16 py = posY;
    // current sprite position on screen
    s16 px_scr = px - this->camPosX;
    s16 py_scr = py - this->camPosY;

    s16 npx_cam, npy_cam;

    // Adjust new camera position, how far can you character move on x axis until camera starts following
    // screen_width / 2 - sprite_width / 2 = 320 / 2 - 40 / 2 = 140
    if (px_scr > 140) npx_cam = px - 140;
    // Add 10 pixels of leeway so that you can turn around and camera doesn't start moving immediately
    else if (px_scr < 130) npx_cam = px - 130;
    else npx_cam = this->camPosX;
    if (py_scr > 140) npy_cam = py - 140;
    else if (py_scr < 60) npy_cam = py - 60;
    else npy_cam = this->camPosY;

    // clip camera position
    if (npx_cam < 0) npx_cam = 0;
    else if (npx_cam > MAP_WIDTH - 320) npx_cam = MAP_WIDTH - 320;
    if (npy_cam < 0) npy_cam = 0;
    else if (npy_cam > MAP_HEIGHT - 224) npy_cam = MAP_HEIGHT - 224;

    // set new camera position
    CAMERA_setCameraPosition(this, npx_cam, npy_cam);
  }

void CAMERA_setCameraPosition(Camera *this, s16 x, s16 y) {
    if (x != this->camPosX || y != this->camPosY) {
      this->camPosX = x;
      this->camPosY = y;

      // scroll maps
      this->bgaPosX = x;
      this->bgaPosY = y;

      // scrolling is slower on BGB
      this->bgbPosX = x >> 3;
      this->bgbPosY = y >> 5;
    }
  }

