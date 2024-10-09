import { Component, ElementRef, ViewChild } from '@angular/core';
import { Player } from '../player';
import { Camera } from '../camera';
import { BazzBomber } from '../bazzbomber';
import { Sprite } from '../sprite_eng';
import {
  BUTTON_UP,
  BUTTON_DOWN,
  BUTTON_LEFT,
  BUTTON_RIGHT,
  BUTTON_A,
  BUTTON_B,
  BUTTON_C,
  BUTTON_START,
  BUTTON_X,
  BUTTON_Y,
  BUTTON_Z,
  BUTTON_MODE,
} from '../joy';
import { fix32ToInt, FIX32 } from '../maths';
import hashes from './tiles.json';
import { coordsToTile } from './coords_to_tile';
import { tileToCoords } from './tile_to_coords';
import {
  loadCollisionMap,
  storeCollisionMap,
} from '../res_collision';
import { Map } from '../map';
import { FormsModule } from '@angular/forms';

type DrawableImages = {
  img: CanvasImageSource;
  offset?: { x: number; y: number };
  source?: { x: number; y: number; w: number; h: number };
  hFlip?: boolean;
  skip?: boolean;
}[];

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './canvas.component.html',
  styleUrl: './canvas.component.scss',
})
export class CanvasComponent {
  camPosYOffset: number;
  shouldAnimate = true;
  onClipViewportChange() {
    if (this.clipViewport) {
      // Scale to fullscreen and move into the middle
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      const scale = window.innerHeight / 240;
      this.ctx.scale(scale, scale);
      this.ctx.translate(window.innerWidth / 2 / scale, 0);
      this.ctx.translate(-160, 0);
    } else {
      this.ctx.restore();
    }
  }

  @ViewChild('canvas', { static: true }) canvas?: ElementRef<HTMLCanvasElement>;
  ctx!: CanvasRenderingContext2D;
  // Coords are displayed on mouse hover at the bottom of the screen
  xCoord = 0;
  yCoord = 0;
  images: DrawableImages = [];
  joyState = 0;
  entities: BazzBomber[] = [];
  collisionMap: { [key: number]: number[] } = {};
  clipViewport = false;
  drawGrid = false;

  constructor(private el: ElementRef<HTMLDivElement>) {
    let panning = false;
    let drawing = false;
    let scrollHistory: { x: number; y: number; timestamp: number }[] = [];

    el.nativeElement.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    el.nativeElement.addEventListener('mousedown', (event) => {
      // cmd key on MacOS
      if (event.metaKey || event.shiftKey) {
        drawing = true;

        // this.collisionMap[pos] = event.button === 2 ? 0 : 1;
        this.modifyCollisionMap(event);
      } else {
        panning = true;
      }
    });

    el.nativeElement.addEventListener('mousemove', (event) => {
      const inverseTransform = this.ctx.getTransform().inverse();
      const originPoint = inverseTransform.transformPoint({
        x: event.offsetX,
        y: event.offsetY,
      });
      this.xCoord = Math.floor(originPoint.x);
      this.yCoord = Math.floor(originPoint.y);
      if (drawing) {
        this.modifyCollisionMap(event);
      }

      if (!panning) {
        return;
      }

      // Record the mouse position and timestamp to calculate inertia on mouseup
      scrollHistory.push({
        x: event.offsetX,
        y: event.offsetY,
        timestamp: event.timeStamp,
      });

      const transform = this.ctx.getTransform();
      const scale = transform.a;

      // Move the canvas by the amount of pixels the mouse moved
      this.ctx.translate(event.movementX / scale, event.movementY / scale);

      this.drawImages(this.images);
    });

    el.nativeElement.addEventListener('mouseup', (event) => {
      panning = false;
      drawing = false;

      // Find the mouse position 100ms ago to calculate inertia
      const pos = scrollHistory.find(
        (v) => v.timestamp > event.timeStamp - 100
      );
      if (!pos) {
        return;
      }
      scrollHistory = [];
      let xVelocity = pos!.x - event.offsetX;
      let yVelocity = pos!.y - event.offsetY;
      const transform = this.ctx.getTransform();
      const scale = transform.a;

      const inertiaIntervalId = setInterval(() => {
        // Integer values here were chosen by trial and error
        this.ctx.translate(-xVelocity / 15 / scale, -yVelocity / 15 / scale);
        this.drawImages(this.images);
        xVelocity *= 0.97; // Drag factor
        yVelocity *= 0.97;
        if (Math.abs(xVelocity) < 5 && Math.abs(yVelocity) < 5) {
          clearInterval(inertiaIntervalId);
        }
      }, 10);
    });

    el.nativeElement.addEventListener(
      'wheel',
      (event) => {
        const inverseTransform = this.ctx.getTransform().inverse();
        const originPoint = inverseTransform.transformPoint({
          x: event.offsetX,
          y: event.offsetY,
        });

        // Makes zooming in and out happen around the mouse cursor
        this.ctx.translate(originPoint.x, originPoint.y);
        let scaleFactor = 1.1;
        const factor = Math.pow(scaleFactor, event.deltaY * 0.01);
        this.ctx.scale(factor, factor);
        this.ctx.translate(-originPoint.x, -originPoint.y);

        this.drawImages(this.images);
        // Disable MacOS built-in pinch to zoom
        event.preventDefault();
      },
      {
        passive: false,
      }
    );

    document.addEventListener('keydown', (event) => {
      const previousValue = this.joyState;
      switch (event.key) {
        case 'ArrowUp':
          this.joyState |= BUTTON_UP;
          break;
        case 'ArrowDown':
          this.joyState |= BUTTON_DOWN;
          break;
        case 'ArrowLeft':
          this.joyState |= BUTTON_LEFT;
          break;
        case 'ArrowRight':
          this.joyState |= BUTTON_RIGHT;
          break;
        case 'a':
          this.joyState |= BUTTON_A;
          break;
        case 's':
          this.joyState |= BUTTON_B;
          break;
        case 'd':
          this.joyState |= BUTTON_C;
          break;
        case 'Enter':
          this.joyState |= BUTTON_START;
          break;
        case 'x':
          this.joyState |= BUTTON_X;
          break;
        case 'y':
          this.joyState |= BUTTON_Y;
          break;
        case 'z':
          this.joyState |= BUTTON_Z;
          break;
        case 'm':
          this.joyState |= BUTTON_MODE;
          break;
      }

      this.player.doJoyAction(0, previousValue ^ this.joyState, this.joyState);
    });

    document.addEventListener('keyup', (event) => {
      switch (event.key) {
        case 'ArrowUp':
          this.joyState &= ~BUTTON_UP;
          break;
        case 'ArrowDown':
          this.joyState &= ~BUTTON_DOWN;
          break;
        case 'ArrowLeft':
          this.joyState &= ~BUTTON_LEFT;
          break;
        case 'ArrowRight':
          this.joyState &= ~BUTTON_RIGHT;
          break;
        case 'a':
          this.joyState &= ~BUTTON_A;
          break;
        case 's':
          this.joyState &= ~BUTTON_B;
          break;
        case 'd':
          this.joyState &= ~BUTTON_C;
          break;
        case 'Enter':
          this.joyState &= ~BUTTON_START;
          break;
        case 'x':
          this.joyState &= ~BUTTON_X;
          break;
        case 'y':
          this.joyState &= ~BUTTON_Y;
          break;
        case 'z':
          this.joyState &= ~BUTTON_Z;
          break;
        case 'm':
          this.joyState &= ~BUTTON_MODE;
          break;
      }
    });
  }

  // animFrameCount and frameTimer specified through gfx.res
  player = new Player(
    new Sprite({
      animFrameCount: [1, 2, 6, 4, 2, 1, 1, 5],
      frameTimer: 5,
      frameWidth: 48,
      frameHeight: 48,
    }),
    new Map()
  );
  camera = new Camera();

  private modifyCollisionMap(event: MouseEvent) {
    const bga = this.images[1];
    const tileX = Math.floor((this.xCoord - bga.offset.x) / 8);
    const tileY = Math.floor((this.yCoord - bga.offset.y) / 8);

    // tileIdx is last 10 bits
    const tileId = coordsToTile[tileY][tileX] & 0x7ff;

    if (event.metaKey) {
      if (this.collisionMap[tileId]) {
        delete this.collisionMap[tileId];
      } else {
        this.collisionMap[tileId] = [8, 8, 8, 8, 8, 8, 8, 8];
      }
    }

    // Height map mode
    if (event.shiftKey) {
      const xOffset = this.xCoord - bga.offset.x - tileX * 8;
      const yOffset = this.yCoord - bga.offset.y - tileY * 8;

      this.collisionMap[tileId] = this.collisionMap[tileId] || [];
      this.collisionMap[tileId][xOffset] = 8 - yOffset;
    }
  }

  zoomTo(x: number, y: number, scale: number) {
    const ctx = this.ctx;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.translate(-x, -y);
  }

  render() {
    requestAnimationFrame(() => {
      this.animate(this.player);
    });
  }

  private animate(player: Player) {
    const fps = 90;
    setTimeout(() => {
      requestAnimationFrame((ts) => {
          this.animate(player);
      });
    }, 1000 / fps);

    if (!this.shouldAnimate) {
      return;
    }

    // First
    player.handleInput(this.joyState);

    // update player first
    player.update();
    // advances animations
    player.sprite.update();

    // then set camera from player position
    this.camera.centerOn(fix32ToInt(player.posX), fix32ToInt(player.posY));

    // Transfer states
    const sonicSprite = this.images[2];
    sonicSprite.offset = {
      x: fix32ToInt(player.posX) - this.camera.camPosX,
      y: fix32ToInt(player.posY) - this.camera.camPosY,
    };
    sonicSprite.source = {
      x: player.sprite.frameWidth * player.sprite.animFrame,
      y: player.sprite.frameHeight * player.sprite.animInd,
      w: player.sprite.frameWidth,
      h: player.sprite.frameHeight,
    };
    sonicSprite.hFlip = player.hFlip;

    const bga = this.images[1];
    bga.offset = {
      x: -this.camera.bgaPosX,
      y: -this.camera.bgaPosY,
    };

    const bgb = this.images[0];
    bgb.offset = {
      x: -this.camera.bgbPosX,
      y: -this.camera.bgbPosY,
    };

    const images = [...this.images];

    for (const entity of this.entities) {
      entity.update();
      entity.sprite.update();
      images.push({
        img: entity.sprite.image,
        offset: {
          x: fix32ToInt(entity.posX) - this.camera.camPosX,
          y: fix32ToInt(entity.posY) - this.camera.camPosY,
        },
        source: {
          x: entity.sprite.frameWidth * entity.sprite.animFrame,
          y: entity.sprite.frameHeight * entity.sprite.animInd,
          w: entity.sprite.frameWidth,
          h: entity.sprite.frameHeight,
        },
      });
    }

    this.drawImages(images);
  }

  async ngAfterViewInit() {
    this.collisionMap = await loadCollisionMap();
    setInterval(() => {
      storeCollisionMap(this.collisionMap);
    }, 10000);

    const canvas = this.canvas?.nativeElement as HTMLCanvasElement;
    canvas.width = this.el.nativeElement.clientWidth;
    canvas.height = window.innerHeight - 24;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    this.ctx = ctx;

    ctx.imageSmoothingEnabled = false;

    // Load foreground image with transparency
    const imgFg = await this.addTransparency('res/gfx/S1_GHZ1_FG.png', {
      r: 0,
      g: 0x92,
      b: 0xff,
    });
    // this.splitIntoTiles(imgFg);
    // Load background image
    const imgBg = await this.loadImage('res/gfx/S1_GHZ1_BG.png');
    const sprite = await this.loadImage('res/sprite/sonic.png');
    const bazzbomberImg = await this.addTransparency('res/sprite/enemy01.png', {
      r: 0xff,
      g: 0x00,
      b: 0xf7,
    });

    const imageAspectRatio = imgFg!.width / imgFg!.height;
    const drawingHeight = canvas.width / imageAspectRatio;
    const canvasMiddleY = canvas.height / 2 - drawingHeight / 2;

    // Takes full width, scales height according to ratio
    const scale = canvas.width / imgFg!.width;
    // Translate must be done before scaling
    ctx.translate(0, canvasMiddleY);
    ctx.scale(scale, scale);

    this.images = [
      { img: imgBg, offset: { x: 0, y: -24 } },
      { img: imgFg, offset: { x: 0, y: -784 } },
      {
        img: sprite,
        offset: { x: 48, y: 140 },
        source: { x: 0, y: 0, w: 48, h: 48 },
      },
    ];

    const bazzbomberSprite = new Sprite({
      animFrameCount: [2],
      frameTimer: 5,
      frameWidth: 48,
      frameHeight: 32,
      image: bazzbomberImg,
    });

    this.entities = [new BazzBomber(bazzbomberSprite, FIX32(408), FIX32(800))];

    // Initial zoom
    this.zoomTo(0, 0, 8);

    this.drawImages(this.images);
    this.render();
  }

  async loadImage(imageUrl: string) {
    return new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.addEventListener('load', () => {
        resolve(img);
      });
      img.src = imageUrl;
    });
  }

  splitIntoTiles(canvas: OffscreenCanvas) {
    const context = canvas.getContext('2d')!;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    // Each tile is 8px * 8px * 4 bytes = 256 bytes
    // 10240 pixels in one line or 40960 bytes
    // 1280 8x8 tiles in one line
    const tileCount = pixels.data.length / 256;

    const hashes: { [key: number]: number[] } = {};
    for (let tileIdx = 0; tileIdx < tileCount; tileIdx++) {
      let tileHash = 0;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          for (let i = 0; i < 4; i++) {
            tileHash += pixels.data[tileIdx * 32 + y * 40960 + x * 4 + i];
          }
        }
      }
      hashes[tileHash] = hashes[tileHash] || [];
      hashes[tileHash].push(tileIdx);
    }

    // draw them on canvas
    const hashKeys = Object.keys(hashes);
    const heightInPx = Math.ceil(hashKeys.length / 32) * 8;
    const widthInPx = 32 * 8;
    const tileCanvas = new OffscreenCanvas(widthInPx, heightInPx);
    const tileContext = tileCanvas.getContext('2d')!;

    tileContext.imageSmoothingEnabled = false;
    // for (let hashIdx = 0; hashIdx < hashKeys.length; hashIdx++) {
    //   const tileIdx = hashes[parseInt(hashKeys[hashIdx])][0];
    //   const syTile = Math.floor(tileIdx / 1280);
    //   const sxTile = tileIdx - syTile * 1280;
    //   const dx = hashIdx % 32 * 8;
    //   const dy = Math.floor(hashIdx / 32) * 8;
    //   tileContext.drawImage(canvas, sxTile * 8, syTile * 8, 8, 8, dx, dy, 8, 8);
    //   console.log({dx, dy, sxTile, syTile});
    // }

    this.drawTile(canvas, [785, 817, 849, 2065], tileContext, pixels);

    // Download the tileset
    tileCanvas.convertToBlob().then((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url);
    });
  }

  drawTile(
    canvas: OffscreenCanvas,
    tileIndexes: number[],
    tileContext: OffscreenCanvasRenderingContext2D,
    pixels: ImageData
  ) {
    tileContext.scale(12, 12);
    tileIndexes.forEach((tileIdx, hashIdx) => {
      const syTile = Math.floor(tileIdx / 1280);
      const sxTile = tileIdx - syTile * 1280;
      const tilesPerLine = 2;
      const dx = (hashIdx % tilesPerLine) * 8;
      const dy = Math.floor(hashIdx / tilesPerLine) * 8;
      tileContext.drawImage(canvas, sxTile * 8, syTile * 8, 8, 8, dx, dy, 8, 8);
      console.log({ dx, dy, sxTile, syTile });
    });

    tileIndexes.forEach((tileIdx, hashIdx) => {
      let tileHash = 0;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          for (let i = 0; i < 4; i++) {
            tileHash += pixels.data[tileIdx * 32 + y * 40960 + x * 4 + i];
          }
        }
      }
      console.log({ tileIdx, tileHash });
    });
  }

  async addTransparency(
    imageUrl: string,
    transparentColor: { r: number; g: number; b: number }
  ) {
    const response = await fetch(imageUrl);
    const fileBlob = await response.blob();
    const bitmap = await createImageBitmap(fileBlob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);

    // iterate through pixel data (1 pixels consists of 4 ints in the array)
    for (var i = 0, len = pixels.data.length; i < len; i += 4) {
      var r = pixels.data[i];
      var g = pixels.data[i + 1];
      var b = pixels.data[i + 2];

      // if the pixel matches our transparent color, set alpha to 0
      if (
        r == transparentColor.r &&
        g == transparentColor.g &&
        b == transparentColor.b
      ) {
        pixels.data[i + 3] = 0;
      }
    }

    context.putImageData(pixels, 0, 0);

    return canvas;
  }

  drawImages(imgs: DrawableImages) {
    const canvas = this.canvas?.nativeElement as HTMLCanvasElement;
    const ctx = this.ctx;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Takes full height, scales width according to ratio
    // ctx.drawImage(img, 0, 0, canvas.height * imageAspectRatio, canvas.height);

    for (const { img, offset, source, hFlip, skip } of imgs) {
      if (skip) {
        continue;
      }

      if (offset) {
        ctx.translate(offset.x, offset.y);
      }
      if (hFlip) {
        ctx.scale(-1, 1);
      }
      if (source) {
        ctx.drawImage(
          img,
          source.x,
          source.y,
          source.w,
          source.h,
          0 + (hFlip ? -source.w : 0),
          0,
          source.w,
          source.h
        );
        // Draw bounding box around entities
        ctx.strokeRect(0 + (hFlip ? -source.w : 0), 0, source.w, source.h);
        // Draw a ground sensor
        ctx.beginPath();
        ctx.strokeStyle = 'limegreen';
        ctx.moveTo(hFlip ? -24 : 24, 24);
        ctx.lineTo(hFlip ? -24 : 24, 40);
        ctx.stroke();
      } else {
        if (this.clipViewport) {
          // Simulate MD viewport
          const w = 320;
          const h = 240;

          ctx.save();
          ctx.beginPath();
          ctx.rect(-offset.x, -offset.y, 320, 240);
          ctx.clip();
        } 

        ctx.drawImage(img, 0, 0);

        if (img instanceof OffscreenCanvas && img.height === 1280) {
          if (this.drawGrid) {
            // Draw grid
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            for (let x = 0; x < img.width; x += 16) {
              ctx.moveTo(x, 0);
              ctx.lineTo(x, img.height);
            }

            for (let y = 0; y < img.height; y += 16) {
              ctx.moveTo(0, y);
              ctx.lineTo(img.width, y);
            }

            ctx.stroke();
          }

          // Draw collision map
          ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
          Object.keys(this.collisionMap).forEach((tileId) => {
            const tileIdInt = parseInt(tileId);
            const heightMap = this.collisionMap[tileIdInt];

            tileToCoords[tileId]?.forEach((coord) => {
              heightMap.forEach((height, x) => {
                ctx.fillRect(
                  coord.x * 8 + (coord.hFlip ? 7 - x : x),
                  (coord.y + 1) * 8,
                  1,
                  -height
                );

                // Draws tile ids - slow
                // ctx.font = "3px serif";
                // ctx.fillText(tileIdInt.toString(16), coord.x * 8, coord.y * 8);
              });
            });
          });

          // Draw camera box
          ctx.strokeRect(this.camera.camPosX, this.camera.camPosY, 320, 240);
        }

        if (this.clipViewport) {
          ctx.restore();
        }
      }
      if (hFlip) {
        ctx.scale(-1, 1);
      }
      if (offset) {
        ctx.translate(-offset.x, -offset.y);
      }
    }
  }
}
