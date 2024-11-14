import { Player } from './player';
import { random } from './tools';
import { s16, u16 } from './types';

export class Camera {
  camPosX = -1;
  camPosY = -1;
  bgaPosX = -1;
  bgaPosY = -1;
  bgbPosX = -1;
  bgbPosY = -1;
  mapWidth = 0;
  mapHeight = 0;
  follows: Player;
  shakeDuration: number;

  constructor(mapWidth: u16, mapHeight: u16) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
  }

  centerOn(posX: s16, posY: s16) {
    // get entity position (pixel)
    let px = posX;
    let py = posY;
    // current sprite position on screen
    let px_scr = px - this.camPosX;
    let py_scr = py - this.camPosY;

    let npx_cam, npy_cam;

    // Adjust new camera position, how far can you character move on x axis until camera starts following
    // screen_width / 2 - sprite_width / 2 = 320 / 2 - 40 / 2 = 140
    if (px_scr > 140) npx_cam = px - 140;
    // Add 10 pixels of leeway so that you can turn around and camera doesn't start moving immediately
    else if (px_scr < 130) npx_cam = px - 130;
    else npx_cam = this.camPosX;
    if (py_scr > 140) npy_cam = py - 140;
    else if (py_scr < 60) npy_cam = py - 60;
    else npy_cam = this.camPosY;

    // clip camera position
    if (npx_cam < 0) npx_cam = 0;
    else if (npx_cam > this.mapWidth - 320) npx_cam = this.mapWidth - 320;
    if (npy_cam < 0) npy_cam = 0;
    else if (npy_cam > this.mapHeight - 224) npy_cam = this.mapHeight - 224;

    if (this.shakeDuration) {
      npx_cam += random() % 6 - 3;
      this.shakeDuration--;
    }

    // set new camera position
    this.setCameraPosition(npx_cam, npy_cam);
  }

  screenShake(duration: u16) {
    this.shakeDuration = duration;
  }

  setCameraPosition(x: s16, y: s16) {
    if (x != this.camPosX || y != this.camPosY) {
      this.camPosX = x;
      this.camPosY = y;

      // scroll maps
      this.bgaPosX = x;
      this.bgaPosY = y;

      // scrolling is slower on BGB - for Sonic type game
      // this.bgbPosX = x >> 3;
      // this.bgbPosY = y >> 5;

      // same speed scrolling - fits well for platformers like Pixel Adventure
      this.bgbPosX = x;
      this.bgbPosY = y;
    }
  }
}
