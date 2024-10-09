import { MAP_WIDTH, MAP_HEIGHT } from './level';
import { s16 } from './types';

export class Camera {
  camPosX = -1;
  camPosY = -1;
  bgaPosX = -1;
  bgaPosY = -1;
  bgbPosX = -1;
  bgbPosY = -1;

  centerOn(posX: s16, posY: s16) {
    // get entity position (pixel)
    let px = posX;
    let py = posY;
    // current sprite position on screen
    let px_scr = px - this.camPosX;
    let py_scr = py - this.camPosY;

    let npx_cam, npy_cam;

    // adjust new camera position
    if (px_scr > 240) npx_cam = px - 240;
    else if (px_scr < 40) npx_cam = px - 40;
    else npx_cam = this.camPosX;
    if (py_scr > 140) npy_cam = py - 140;
    else if (py_scr < 60) npy_cam = py - 60;
    else npy_cam = this.camPosY;

    // clip camera position
    if (npx_cam < 0) npx_cam = 0;
    else if (npx_cam > MAP_WIDTH - 320) npx_cam = MAP_WIDTH - 320;
    if (npy_cam < 0) npy_cam = 0;
    else if (npy_cam > MAP_HEIGHT - 224) npy_cam = MAP_HEIGHT - 224;

    // set new camera position
    this.setCameraPosition(npx_cam, npy_cam);
  }

  setCameraPosition(x: s16, y: s16) {
    if (x != this.camPosX || y != this.camPosY) {
      this.camPosX = x;
      this.camPosY = y;

      // scroll maps
      this.bgaPosX = x;
      this.bgaPosY = y;

      // scrolling is slower on BGB
      this.bgbPosX = x >> 3;
      this.bgbPosY = y >> 5;
    }
  }
}
