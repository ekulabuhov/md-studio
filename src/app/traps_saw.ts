import { fix32, s16, u16 } from './types';
import { FIX32, fix32ToInt } from './maths';
import { Sprite } from './sprite_eng';
import { Camera } from './camera';
import { Player } from './player';

export class TrapsSaw {
  // Current position
  posX: fix32 = 0;
  posY: fix32 = 0;
  sprite: Sprite;
  targetIndex = 1;
  pointsLength = 0;
  camera: Camera;
  points: [s16,s16][];

  constructor(sprite: Sprite, points: [s16,s16][], pointsLength: u16, camera: Camera) {
    this.sprite = sprite;
    this.points = points;
    this.posX = FIX32(this.points[0][0]);
    this.posY = FIX32(this.points[0][1]);
    this.pointsLength = pointsLength;
    this.camera = camera;
  }

  update() {
    const posX = fix32ToInt(this.posX);
    const posY = fix32ToInt(this.posY);
    const targetX = this.points[this.targetIndex][0];
    const targetY = this.points[this.targetIndex][1];

    if (posX !== targetX) {
      this.posX += FIX32((targetX > posX) ? 1 : -1);
    }

    if (posY !== targetY) {
      this.posY += FIX32((targetY > posY) ? 1 : -1);
    }

    if (posX === targetX && posY === targetY) {
      this.targetIndex = (this.targetIndex + 1) % this.pointsLength;
    }
  }

  handleCollision(player: Player) {
    this.camera.screenShake(10);
    player.die(this);
  }
}
