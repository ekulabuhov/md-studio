import { Subject } from 'rxjs';
import { ItemsApple } from './items_apple';
import { ItemsDust } from './items_dust';
import { Player } from './player';
import { TrapsSaw } from './traps_saw';
import { BoxCollision } from './vdp_tile';

type Only<T, U> = {
  [P in keyof T]: T[P];
} & {
  [P in keyof U]?: never;
};

type Either<T, U> = Only<T, U> | Only<U, T>;

export type BG = {
  imageURL: string;
  tiles: {
    tileSize: number;
  } & Either<{ coverMode: 'tile' }, { mapUrl: string }>;
};

export type SpriteDefinition = {
  id: string;
  // Frame count in each animation. Will be calculated if not provided.
  animFrameCount?: number[];
  frameTimer: number;
  frameWidth: number;
  frameHeight: number;
  animations: {
    name: string;
    imageURL?: string;
    frames?: string[];
  }[];
  script;
  params: any[];
  hitbox?: BoxCollision;
};

export type ProjectStructure = {
  sceneWidth: number;
  sceneHeight: number;
  bgA: BG;
  bgB: BG;
  sprites: SpriteDefinition[];
  collisionMapUrl: string;
};

export const deleteEntity = new Subject<number>();

export const INJECT_BGA_TILEMAP = '&bga_tilemap';
export const INJECT_CAMERA = '&camera';

function newTrapSawSprite(params: any[]): SpriteDefinition {
  return {
    id: 'traps_saw',
    frameTimer: 5,
    frameWidth: 38,
    frameHeight: 38,
    animations: [
      {
        name: 'spin',
        imageURL: 'app://project/PixelFrog/Traps/Saw/On (38x38).png',
      },
    ],
    script: TrapsSaw,
    params: [...params, INJECT_CAMERA],
  };
}

function newApple(params): SpriteDefinition {
  return {
    id: 'items_apple',
    frameTimer: 5,
    frameWidth: 32,
    frameHeight: 32,
    animations: [
      {
        name: 'idle',
        imageURL: 'app://project/PixelFrog/Items/Fruits/Apple.png',
      },
      {
        name: 'collected',
        imageURL: 'app://project/PixelFrog/Items/Fruits/Collected.png',
      },
    ],
    script: ItemsApple,
    params,
    hitbox: {
      x: 8,
      y: 6,
      w: 16,
      h: 16,
    },
  };
}

function newOrange(params): SpriteDefinition {
  return {
    id: 'items_orange',
    frameTimer: 5,
    frameWidth: 32,
    frameHeight: 32,
    animations: [
      {
        name: 'idle',
        imageURL: 'app://project/PixelFrog/Items/Fruits/Orange.png',
      },
      {
        name: 'collected',
        imageURL: 'app://project/PixelFrog/Items/Fruits/Collected.png',
      },
    ],
    script: ItemsApple,
    params,
    hitbox: {
      x: 8,
      y: 8,
      w: 20,
      h: 16,
    },
  };
}

export const projectStructure: ProjectStructure = {
  collisionMapUrl: 'tile_map.json',
  sceneWidth: 512,
  sceneHeight: 256,
  bgA: {
    imageURL: 'app://project/PixelFrog/Terrain/Terrain (16x16).png',
    tiles: {
      tileSize: 8,
      mapUrl: 'tile_map.json',
    },
  },
  bgB: {
    imageURL: 'app://project/PixelFrog/Background/Blue.png',
    tiles: {
      tileSize: 64,
      coverMode: 'tile',
    },
  },
  sprites: [
    {
      id: 'smoke',
      frameTimer: 5,
      frameWidth: 32,
      frameHeight: 32,
      animations: [
        {
          name: 'idle',
          frames: [
            'app://project/FXPack_nyknck/Smoke/FX002/FX002_05.png',
            'app://project/FXPack_nyknck/Smoke/FX002/FX002_06.png',
            'app://project/FXPack_nyknck/Smoke/FX002/FX002_07.png',
            'app://project/FXPack_nyknck/Smoke/FX002/FX002_08.png',
          ],
        },
      ],
      script: ItemsDust,
      params: [],
    },
    {
      id: 'player',
      frameTimer: 5,
      frameWidth: 32,
      frameHeight: 32,
      animations: [
        {
          name: 'idle',
          imageURL:
            'app://project/PixelFrog/Main Characters/Mask Dude/Idle (32x32).png',
        },
        {
          name: 'run',
          imageURL:
            'app://project/PixelFrog/Main Characters/Mask Dude/Run (32x32).png',
        },
        {
          name: 'jump',
          imageURL:
            'app://project/PixelFrog/Main Characters/Mask Dude/Jump (32x32).png',
        },
        {
          name: 'fall',
          imageURL:
            'app://project/PixelFrog/Main Characters/Mask Dude/Fall (32x32).png',
        },
        {
          name: 'double_jump',
          imageURL:
            'app://project/PixelFrog/Main Characters/Mask Dude/Double Jump (32x32).png',
        },
      ],
      script: Player,
      params: [INJECT_BGA_TILEMAP, '&smoke'],
      hitbox: {
        x: 8,
        y: 0,
        w: 16,
        h: 32,
      },
    },
    newTrapSawSprite([
      [
        [84, 68],
        [196, 68],
        [196, 132],
        [84, 132],
      ],
      4,
    ]),
    newTrapSawSprite([
      [
        [196, 132],
        [84, 132],
        [84, 68],
        [196, 68],
      ],
      4,
    ]),
    newTrapSawSprite([
      [
        [308, -12],
        [308, 68],
      ],
      2,
    ]),
    newTrapSawSprite([
      [
        [340, 84],
        [452, 84],
      ],
      2,
    ]),
    newApple([440, 200]),
    newApple([440, 168]),
    newApple([440, 136]),
    newApple([408, 200]),
    newApple([408, 168]),
    newApple([408, 136]),
    newApple([376, 168]),
    newApple([360, 136]),
    newOrange([96, 40]),
    newOrange([128, 40]),
    newOrange([160, 40]),
    newOrange([192, 40]),
    newOrange([176, 8]),
    newOrange([144, 8]),
    newOrange([112, 8]),
  ],
};
