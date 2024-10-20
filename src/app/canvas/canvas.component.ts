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
import { loadCollisionMap, storeCollisionMap } from '../res_collision';
import { Map } from '../map';
import { FormsModule } from '@angular/forms';
import { fs } from '../fs_electron';
import { fix32, u16 } from '../types';
import { Modal } from 'bootstrap';
import { AssetDrawerComponent } from '../asset-drawer/asset-drawer.component';
import { Nostalgist } from 'nostalgist';
import { getImagePixelData, getUnique } from '../utils';
import { compileRom } from '../compile_rom';

type DrawableImages = {
  id?: string;
  img: CanvasImageSource;
  offset?: { x: number; y: number };
  source?: { x: number; y: number; w: number; h: number };
  hFlip?: boolean;
  skip?: boolean;
  tiles?: {
    tileSize: number;
    /** If set to 'tile' will cover the whole screen with repeating pattern */
    coverMode?: 'tile';
    map?: number[][];
  };
  darkenRect?: { x: number; y: number; w: number; h: number };
  type?: 'GameEntity';
}[];

export type GameEntity = {
  posX: fix32;
  posY: fix32;
  sprite: Sprite;
  hFlip: boolean;
  update();
  handleInput?(joyState: number);
  doJoyAction?(joy: u16, changed: u16, state: u16);
};

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [FormsModule, AssetDrawerComponent],
  templateUrl: './canvas.component.html',
  styleUrl: './canvas.component.scss',
})
export class CanvasComponent {
  nostalgist: Nostalgist;
  selectedTileNet?: { x: number; y: number; w: number; h: number };
  selectedTiles: { tileX: number; tileY: number; tileW: number; tileH: number };
  Math = Math;
  async onPlayClick() {
    this.nostalgist = await Nostalgist.launch({
      rom: 'rom.bin',
      core: 'genesis_plus_gx',
      resolveRom(file) {
        return `app://project/out/${file}`;
      },
    });
  }

  modal: Modal;
  async onFileSelected(fileUrl: string) {
    this.modal.hide();
    this.bgImgUrl = fileUrl;
    const imgBg = await this.loadImage(this.bgImgUrl);

    this.images[0] = {
      img: imgBg,
      offset: { x: 0, y: 0 },
      tiles: {
        tileSize: 64,
        coverMode: 'tile',
      },
    };
  }

  onBgImgUrlSelect() {
    this.modal = new Modal('#exampleModal');
    this.modal.show();
  }

  bgImgUrl = 'res/gfx/S1_GHZ1_BG.png';
  shouldAnimate = false;
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
  entities: GameEntity[] = [];
  collisionMap: { [key: number]: number[] } = {};
  clipViewport = false;
  drawGrid = false;
  camera: Camera;
  mouseMode: 'collision' | 'panning' | 'drawing' | 'none' | 'selecting' =
    'none';

  constructor(private el: ElementRef<HTMLDivElement>) {
    let scrollHistory: { x: number; y: number; timestamp: number }[] = [];
    const withinTileSetRegion = () => {
      return (
        this.xCoord > 0 &&
        this.xCoord < 352 &&
        this.yCoord - 272 > 0 &&
        this.yCoord - 272 < 448
      );
    };

    el.nativeElement.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    el.nativeElement.addEventListener('mousedown', (event) => {
      // cmd key on MacOS
      if (event.metaKey || event.shiftKey) {
        this.mouseMode = 'collision';

        // this.collisionMap[pos] = event.button === 2 ? 0 : 1;
        this.modifyCollisionMap(event);
      } else if (event.altKey) {
        // option key on MacOS
        this.mouseMode = 'drawing';
      } else if (this.mouseMode === 'selecting') {
        this.selectedTileNet = {
          x: this.xCoord,
          y: this.yCoord,
          w: 0,
          h: 0,
        };

        if (withinTileSetRegion()) {
          const tileSetImage = this.images.find(
            (image) => image.id === 'tileSet'
          );
          tileSetImage.darkenRect = this.selectedTileNet;
        } else {
          const tileMapImage = this.images.find(
            (image) => image.id === 'tileMap'
          );
          tileMapImage.darkenRect = this.selectedTileNet;
        }
      } else {
        this.mouseMode = 'panning';
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

      if (this.mouseMode === 'collision') {
        this.modifyCollisionMap(event);
      } else if (this.mouseMode === 'drawing') {
        if (withinTileSetRegion()) {
          return;
        }

        const image = this.images.find((i) => i.id === 'tileMap');
        let tileX = Math.floor(
          (this.xCoord - image.offset.x) / image.tiles.tileSize
        );
        let tileY = Math.floor(
          (this.yCoord - image.offset.y) / image.tiles.tileSize
        );
        const existing = image.tiles.map[tileY][tileX];
        const tilesPerLine =
          (image.img as HTMLImageElement).width / image.tiles.tileSize;

        if (!existing) {
          for (
            let y = this.selectedTiles.tileY / image.tiles.tileSize;
            y <
            (this.selectedTiles.tileY + this.selectedTiles.tileH) /
              image.tiles.tileSize;
            y++
          ) {
            for (
              let x = this.selectedTiles.tileX / image.tiles.tileSize;
              x <
              (this.selectedTiles.tileX + this.selectedTiles.tileW) /
                image.tiles.tileSize;
              x++
            ) {
              const tileId = y * tilesPerLine + x;
              image.tiles.map[tileY][tileX++] = tileId;
            }
            tileY++;
            tileX -= this.selectedTiles.tileW / image.tiles.tileSize;
          }
        }
      } else if (event.buttons === 1 && this.mouseMode === 'selecting') {
        this.selectedTileNet.w = this.xCoord - this.selectedTileNet.x;
        this.selectedTileNet.h = this.yCoord - this.selectedTileNet.y;
      }

      if (this.mouseMode !== 'panning') {
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
      this.mouseMode = 'none';

      if (this.selectedTileNet) {
        const image = this.images.find(
          (image) =>
            image.id === (withinTileSetRegion() ? 'tileSet' : 'tileMap')
        );
        const { x, y, w, h } = this.selectedTileNet;
        this.selectedTiles = this.getSelectedTiles(x, y, w, h, image.offset);

        this.selectedTileNet = undefined;
      }

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

      this.entities.forEach((entity) => {
        entity.doJoyAction?.(0, previousValue ^ this.joyState, this.joyState);
      });
    });

    document.addEventListener('keyup', (event) => {
      if (this.shouldAnimate) {
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
          case 'Escape':
            this.nostalgist?.exit();
            break;
        }
      } else {
        switch (event.key) {
          case 's':
            this.mouseMode = 'selecting';
            break;
          case 'Backspace':
            this.deleteSelectedTiles();
            break;
          case 'Escape':
            this.nostalgist?.exit();
            break;
        }
      }
    });
  }

  deleteSelectedTiles() {
    const image = this.images.find((i) => i.id === 'tileMap');
    for (
      let y = this.selectedTiles.tileY / image.tiles.tileSize;
      y <
      (this.selectedTiles.tileY + this.selectedTiles.tileH) /
        image.tiles.tileSize;
      y++
    ) {
      for (
        let x = this.selectedTiles.tileX / image.tiles.tileSize;
        x <
        (this.selectedTiles.tileX + this.selectedTiles.tileW) /
          image.tiles.tileSize;
        x++
      ) {
        image.tiles.map[y][x] = undefined;
      }
    }
    image.darkenRect = undefined;
  }

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

  private animate() {
    const fps = 90;
    setTimeout(() => {
      requestAnimationFrame((ts) => {
        this.animate();
      });
    }, 1000 / fps);

    if (this.shouldAnimate) {
      for (const entity of this.entities) {
        entity.handleInput?.(this.joyState);
        entity.update();
        // advances animations
        entity.sprite.update();
      }

      this.populateImagesWithEntities();
    }

    this.drawImages(this.images);
  }

  private populateImagesWithEntities() {
    this.images = this.images.filter((img) => img.type !== 'GameEntity');

    for (const entity of this.entities) {
      if (this.camera.follows === entity) {
        // then set camera from player position
        this.camera.centerOn(fix32ToInt(entity.posX), fix32ToInt(entity.posY));

        // Backgrounds need to update after the camera
        // const bga = this.images[1];
        // bga.offset = {
        //   x: -this.camera.bgaPosX,
        //   y: -this.camera.bgaPosY,
        // };
        // const bgb = this.images[0];
        // bgb.offset = {
        //   x: -this.camera.bgbPosX,
        //   y: -this.camera.bgbPosY,
        // };
      }

      this.images.push({
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
        hFlip: entity.hFlip,
        type: 'GameEntity',
      });
    }
  }

  async ngAfterViewInit() {
    this.collisionMap = await loadCollisionMap();

    const canvas = this.canvas?.nativeElement as HTMLCanvasElement;
    canvas.width = this.el.nativeElement.clientWidth;
    canvas.height = window.innerHeight - 24;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    this.ctx = ctx;

    ctx.imageSmoothingEnabled = false;

    const fileList = await fs.getFileList('PixelFrog/Terrain');
    const tileSetFile = fileList.find(
      (file) => file.name === 'Terrain (16x16).png'
    );
    const imgTileSet = await this.loadImage(tileSetFile.url);

    // Load foreground image with transparency
    const imgFg = await this.addTransparency('res/gfx/S1_GHZ1_FG.png', {
      r: 0,
      g: 0x92,
      b: 0xff,
    });
    // this.splitIntoTiles(imgFg);
    // Load background image
    const imgBg = await this.loadImage(this.bgImgUrl);

    const imageAspectRatio = imgFg!.width / imgFg!.height;
    const drawingHeight = canvas.width / imageAspectRatio;
    const canvasMiddleY = canvas.height / 2 - drawingHeight / 2;

    // Takes full width, scales height according to ratio
    const scale = canvas.width / imgFg!.width;
    // Translate must be done before scaling
    ctx.translate(0, canvasMiddleY);
    ctx.scale(scale, scale);

    const tileMapText = await fs.readFile('tile_map.json');
    const tileMap = JSON.parse(tileMapText);

    this.images = [
      { img: imgBg, offset: { x: 0, y: -24 } },
      // { img: imgFg, offset: { x: 0, y: -784 } },
      {
        id: 'tileSet',
        img: imgTileSet,
        offset: { x: 0, y: 272 },
      },
      {
        id: 'tileMap',
        img: imgTileSet,
        offset: { x: 352, y: 272 },
        tiles: {
          tileSize: 8,
          map: tileMap || Array.from({ length: 64 }, () => []),
        },
      },
    ];

    setInterval(() => {
      storeCollisionMap(this.collisionMap);
      fs.writeFile('tile_map.json', JSON.stringify(tileMap));
    }, 10000);

    const sprite = await this.loadImage('res/sprite/sonic.png');
    // animFrameCount and frameTimer specified through gfx.res
    const player = new Player(
      new Sprite({
        animFrameCount: [1, 2, 6, 4, 2, 1, 1, 5],
        frameTimer: 5,
        frameWidth: 48,
        frameHeight: 48,
        image: sprite,
      }),
      new Map()
    );
    this.camera = new Camera(player);

    const bazzbomberImg = await this.addTransparency('res/sprite/enemy01.png', {
      r: 0xff,
      g: 0x00,
      b: 0xf7,
    });
    const bazzbomberSprite = new Sprite({
      animFrameCount: [2],
      frameTimer: 5,
      frameWidth: 48,
      frameHeight: 32,
      image: bazzbomberImg,
    });

    this.entities = [
      player,
      new BazzBomber(bazzbomberSprite, FIX32(408), FIX32(800)),
    ];

    // Initial zoom
    this.zoomTo(0, 0, 8);

    this.populateImagesWithEntities();
    this.drawImages(this.images);
    this.animate();
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
    const bytesPerLine = canvas.width * 4;
    const tileCountPerLine = canvas.width / 8;

    const hashes: { [key: number]: number[] } = {};
    for (let tileIdx = 0; tileIdx < tileCount; tileIdx++) {
      let tileHash = 0;
      const tileLine = Math.floor(tileIdx / tileCountPerLine);
      const tileOffset =
        tileLine * bytesPerLine * 8 + (tileIdx % tileCountPerLine) * 32;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          for (let i = 0; i < 4; i++) {
            tileHash += pixels.data[tileOffset + y * bytesPerLine + x * 4 + i];
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
    for (let hashIdx = 0; hashIdx < hashKeys.length; hashIdx++) {
      const tileIdx = hashes[parseInt(hashKeys[hashIdx])][0];
      const syTile = Math.floor(tileIdx / tileCountPerLine);
      const sxTile = tileIdx - syTile * tileCountPerLine;
      const dx = (hashIdx % 32) * 8;
      const dy = Math.floor(hashIdx / 32) * 8;
      tileContext.drawImage(canvas, sxTile * 8, syTile * 8, 8, 8, dx, dy, 8, 8);
      console.log({ dx, dy, sxTile, syTile });
    }

    // Download the tileset
    tileCanvas.convertToBlob().then((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url);
    });
  }

  async addTransparency(
    imageUrl: string,
    transparentColor: { r: number; g: number; b: number }
  ) {
    const { pixels, context, canvas } = await getImagePixelData(imageUrl);

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

  scrollOffsetY = 0;

  drawImages(imgs: DrawableImages) {
    const canvas = this.canvas?.nativeElement as HTMLCanvasElement;
    const ctx = this.ctx;
    let splitIntoTiles = false;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Takes full height, scales width according to ratio
    // ctx.drawImage(img, 0, 0, canvas.height * imageAspectRatio, canvas.height);

    for (const {
      img,
      offset,
      source,
      hFlip,
      skip,
      tiles,
      darkenRect,
    } of imgs) {
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
      } else if (tiles) {
        if (tiles.coverMode === 'tile') {
          // this.scrollOffsetY += 0.1;
          // this.scrollOffsetY %= 64;
          for (let y = 0; y < 512; y += tiles.tileSize) {
            for (let x = 0; x < 512; x += tiles.tileSize) {
              ctx.drawImage(
                img,
                0,
                0,
                tiles.tileSize,
                tiles.tileSize,
                x,
                y - this.scrollOffsetY,
                tiles.tileSize,
                tiles.tileSize
              );
            }
          }
        } else {
          const tileMapWidthPx = 512;
          const tileMapHeightPx = 256;
          const tilesPerLine = (img as HTMLImageElement).width / tiles.tileSize;
          // Drawing on a separate canvas to prevent white grid lines due to scaling
          const oCanvas = new OffscreenCanvas(tileMapWidthPx, tileMapHeightPx);
          const oCtx = oCanvas.getContext('2d');
          oCtx.fillStyle = 'pink';
          oCtx.fillRect(0, 0, tileMapWidthPx, tileMapHeightPx);
          for (let tileY = 0; tileY < tileMapHeightPx / 8; tileY++) {
            for (let tileX = 0; tileX < tileMapWidthPx / 8; tileX++) {
              const tileId = tiles.map[tileY][tileX];
              if (tileId === undefined || tileId === null) {
                continue;
              }

              const sourceTileX = tileId % tilesPerLine;
              const sourceTileY = Math.floor(tileId / tilesPerLine);
              oCtx.drawImage(
                img,
                sourceTileX * tiles.tileSize,
                sourceTileY * tiles.tileSize,
                tiles.tileSize,
                tiles.tileSize,
                tileX * tiles.tileSize,
                tileY * tiles.tileSize,
                tiles.tileSize,
                tiles.tileSize
              );
            }
          }
          if (splitIntoTiles) {
            this.splitIntoTiles(oCanvas);
          }
          oCtx.strokeRect(0, 0, 512, 512);
          ctx.drawImage(oCanvas, 0, 0);
        }
      } else {
        if (this.clipViewport) {
          // Simulate MD viewport
          ctx.save();
          ctx.beginPath();
          ctx.rect(-offset.x, -offset.y, 320, 240);
          ctx.clip();
        }

        ctx.drawImage(img, 0, 0);

        if (img instanceof OffscreenCanvas && img.height === 1280) {
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
      if (darkenRect) {
        const { x, y, w, h } = darkenRect;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';

        var { tileX, tileY, tileW, tileH } = this.getSelectedTiles(
          x,
          y,
          w,
          h,
          offset
        );
        ctx.fillRect(tileX, tileY, tileW, tileH);
      }
      if (hFlip) {
        ctx.scale(-1, 1);
      }
      if (offset) {
        ctx.translate(-offset.x, -offset.y);
      }
    }

    if (this.drawGrid) {
      const width = 1024;
      const height = 1024;
      // Draw grid
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      for (let x = 0; x < width; x += 8) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, width);
      }

      for (let y = 0; y < height; y += 8) {
        ctx.moveTo(0, y);
        ctx.lineTo(height, y);
      }

      ctx.stroke();
    }

    if (this.selectedTileNet) {
      const { x, y, w, h } = this.selectedTileNet;
      ctx.strokeRect(x, y, w, h);
    }
  }

  private getSelectedTiles(
    x: number,
    y: number,
    w: number,
    h: number,
    offset: { x: number; y: number }
  ) {
    let tileX = Math.floor((x - offset.x) / 8) * 8;
    let tileX2 = Math.ceil((x - offset.x + w) / 8) * 8;
    if (w < 0) {
      tileX = Math.ceil((x - offset.x) / 8) * 8;
      tileX2 = Math.floor((x - offset.x + w) / 8) * 8;
    }

    let tileW = tileX2 - tileX;

    let tileY = Math.floor((y - offset.y) / 8) * 8;
    let tileY2 = Math.ceil((y - offset.y + h) / 8) * 8;
    if (h < 0) {
      tileY = Math.ceil((y - offset.y) / 8) * 8;
      tileY2 = Math.floor((y - offset.y + h) / 8) * 8;
    }

    let tileH = tileY2 - tileY;

    // Force width and height to be positive
    if (tileW < 0) {
      tileX += tileW;
      tileW *= -1;
    }

    if (tileH < 0) {
      tileY += tileH;
      tileH *= -1;
    }

    return { tileX, tileY, tileW, tileH };
  }

  private async compactTileMap() {
    const { img, tiles } = this.images.find((image) => image.id === 'tileMap')!;
    const compactIdMap = tiles.map
      .flat()
      .filter(getUnique)
      // .sort()
      .reduce((acc, val) => {
        acc[val] = Object.keys(acc).length;
        return acc;
      }, {});

    // @ts-ignore
    compactIdMap[null] = 0;

    // Deep copy so we can modify it
    const tileMap: number[][] = JSON.parse(JSON.stringify(tiles.map));

    // Make it 64 bytes wide and compact it
    tileMap.forEach((arr) => {
      arr.length = 64;
      for (let i = 0; i < arr.length; i++) {
        arr[i] = compactIdMap[arr[i]];
      }
    });

    const tilesPerLine = (img as HTMLImageElement).width / tiles.tileSize;
    const uniqueTileCount = Object.keys(compactIdMap).length;
    const oCanvas = new OffscreenCanvas(uniqueTileCount * 8, 8);
    const oCtx = oCanvas.getContext('2d');
    Object.keys(compactIdMap).forEach((key, i) => {
      const tileId = parseInt(key);
      const sourceTileX = tileId % tilesPerLine;
      const sourceTileY = Math.floor(tileId / tilesPerLine);
      const destinationTileX = compactIdMap[key];
      const destinationTileY = 0;

      oCtx.drawImage(
        img,
        sourceTileX * tiles.tileSize,
        sourceTileY * tiles.tileSize,
        tiles.tileSize,
        tiles.tileSize,
        destinationTileX * tiles.tileSize,
        destinationTileY * tiles.tileSize,
        tiles.tileSize,
        tiles.tileSize
      );
    });

    // oCanvas.convertToBlob().then((blob) => {
    //   const url = URL.createObjectURL(blob);
    //   window.open(url);
    // });

    compileRom(URL.createObjectURL(await oCanvas.convertToBlob()), tileMap);
  }
}
