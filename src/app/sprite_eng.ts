export class Sprite {
  /** How many frames in each animation */
  animFrameCount: number[] = [];
  /** Width of a single frame in px */
  frameWidth = 0;
  /** Height of a single frame in px */
  frameHeight = 0;
  /** How many ticks of 1/60 to wait before changing to the next frame */
  frameTimer = 0;

  // Animation state
  animInd = 0;
  animFrame = 0;
  // Counts down every tick, when it reaches 0, animFrame changes
  animFrameTimer = 0;
  image: CanvasImageSource;

  constructor(init: Partial<Sprite>) {
    Object.assign(this, init);
  }

  update() {
    if (this.animFrameTimer === 0) {
      // advance to next frame
      this.animFrame = (this.animFrame + 1) % this.animFrameCount[this.animInd];
      this.animFrameTimer = this.frameTimer;
    }
    this.animFrameTimer--;
  }

  setAnim(animInd: number) {
    if (this.animInd === animInd) return;
    this.animInd = animInd;
    this.animFrame = 0;
    this.animFrameTimer = this.frameTimer;
  }
}
