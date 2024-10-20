import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

const PIXEL_HEIGHT = 20;
const TILE_HEIGHT = PIXEL_HEIGHT * 8;
const BYTES_PER_TILE = 32;
const TILES_PER_ROW = 5;
const TOTAL_VRAM_BYTES = 0x10000;
// It's always 2048, calculations are just for clarity
const TOTAL_TILES = TOTAL_VRAM_BYTES / BYTES_PER_TILE;
// 409.6 - 409 full rows + half a row (0.6)
const TOTAL_ROWS = TOTAL_TILES / TILES_PER_ROW;
const TOTAL_FULL_ROWS = Math.ceil(TOTAL_ROWS);

type TileCoord = { x: number; y: number; hFlip?: boolean; vFlip?: boolean };

@Component({
  selector: 'app-res-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './res-viewer.component.html',
  styleUrl: './res-viewer.component.scss',
})
export class ResViewerComponent {
  palettes: any[][];
  // Layout of 5 tiles per row uses 32 bytes * 5 = 160 bytes per row
  // Coincidentally, the height of a tiles is 20px * 8 rows = 160px
  // Calculate the minimum amount of space needed to show them all
  totalHeight = TOTAL_FULL_ROWS * TILE_HEIGHT;
  topOffset = 0;
  /** [tile_idx][y][x] */
  tiles: number[][][] = [];
  /** [y][x]: tile_idx */
  coordsToTile: number[][] = [];
  /** [tile_idx]: { x, y }[] */
  tileToCoords: { [key: number]: TileCoord[] } = {};

  constructor() {}

  async ngOnInit() {
    const rsData = await fetch('res/gfx.xrs').then((res) => res.text());
    const bgaMap = this.parseSection(rsData, 'bga_map');
    const tileData = this.parseSection(rsData, 'bga_tileset_data');
    const metaTileData = this.parseSection(rsData, 'bga_map_metatiles');
    const mapBlocksData = this.parseSection(rsData, 'bga_map_mapBlocks');
    const mapBlockIndexes = this.parseSection(
      rsData,
      'bga_map_mapBlockIndexes'
    );

    /**
     * metatiles definition, each metatile is encoded as 2x2 tiles block:
     *      - b15: priority
     *      - b14-b13: palette
     *      - b12: vflip
     *      - b11: hflip
     *      - b10-b0: tile index (from tileset)
     */
    const metaTileCanvas = document.getElementById(
      'metaTileCanvas'
    ) as HTMLCanvasElement;
    const ctx = metaTileCanvas.getContext('2d');
    if (!ctx) return;

    const { paletteHex, paletteObj } = this.parsePalettes(rsData);
    this.palettes = paletteHex;

    const drawMetaTile = (xPos: number, yPos: number, metaTileIdx: number, blockIdx: number) =>
      this.drawMetaTile(
        metaTileData,
        tileData,
        paletteObj,
        ctx,
        xPos,
        yPos,
        metaTileIdx,
        blockIdx
      );


    const drawBlock = (blockIdx: number, xPos: number, yPos: number) =>
      this.drawBlock(mapBlocksData, blockIdx, xPos, yPos, drawMetaTile);

    /**
     * blocks definition, each block is encoded as 8x8 metatiles (128x128 px):
     *      if numMetaTile <= 256 --> 8 bit index for metaTile (64 bytes per block)
     *      else --> 16 bit index for metaTile (128 bytes per block)
     */
    // drawBlock(0, 0, 0);
    // drawBlock(1, 1, 0);

    /**
     * block index array (referencing blocks) for the w * hp sized map<br>
     *      if numBlock <= 256 --> 8 bit index for block
     *      else --> 16 bit index for block
     */
    let offset = 0;
    for (let y = 0; y < bgaMap[1]; y++) {
      for (let x = 0; x < bgaMap[0]; x++) {
        const blockIdx = mapBlockIndexes[offset++];
        drawBlock(blockIdx, x, y);
      }
    }

    console.log({ coordsToTile: this.coordsToTile });
    console.log({ tileToCoords: this.tileToCoords });

    // for (let tileIdx = 0; tileIdx < tileData.length / 32; tileIdx++) {
    //   this.tiles[tileIdx] = [];
    //   for (let y = 0; y < 8; y++) {
    //     const offset = 32 * tileIdx + y * 4;
    //     this.tiles[tileIdx][y] = tileData.slice(offset, offset + 4);
    //   }
    // }
  }

  private drawBlock(
    mapBlocksData: any[],
    blockIdx: number,
    xPos: number,
    yPos: number,
    drawMetaTile: (xPos: number, yPos: number, metaTileIdx: number, blockIdx: number) => void
  ) {
    let offset = blockIdx * 128;

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const metaTileIdx =
          (mapBlocksData[offset] << 8) + mapBlocksData[offset + 1];
        offset += 2;

        drawMetaTile(xPos * 128 + x * 16, yPos * 128 + y * 16, metaTileIdx, blockIdx);
      }
    }
  }

  private drawMetaTile(
    metaTileData: any[],
    tileData: any[],
    paletteObj: any[][],
    ctx: CanvasRenderingContext2D,
    xPos: number,
    yPos: number,
    metaTileIdx: number,
    blockIdx: number
  ) {
    let offset = metaTileIdx * 2 * 2 * 2;
    const imageData = ctx.createImageData(16, 16);

    // Each metatile is 2x2 regular tiles
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const block = (metaTileData[offset] << 8) + metaTileData[offset + 1];
        // tileIdx is last 10 bits
        const tileIdx = block & 0x7ff;
        const horizontalFlip = !!(block & (1 << 11));
        const verticalFlip = !!(block & (1 << 12));
        const paletteIdx = (block >> 13) & 0b11;
        offset += 2;

        const tmy = yPos / 8 + y;
        const tmx = xPos / 8 + x;
        this.coordsToTile[tmy] = this.coordsToTile[tmy] || [];
        this.coordsToTile[tmy][tmx] = block;

        if (tileIdx) {
          this.tileToCoords[tileIdx] = this.tileToCoords[tileIdx] || [];
          const coords = { x: tmx, y: tmy } as TileCoord;
          if (horizontalFlip) {
            coords.hFlip = true;
          }
          if (verticalFlip) {
            coords.vFlip = true;
          }
          this.tileToCoords[tileIdx].push(coords);
        }

        let imageDataOffset = 32 * x + 512 * y;
        for (let tileY = 0; tileY < 8; tileY++) {
          for (let tileX = 0; tileX < 8; tileX++) {
            // Each pixel is 4 bits
            // Each pixel is 4 rgba bytes
            // Each line is 4 rgba bytes * 8 pixels * 2 tiles = 64
            let colorData =
              tileData[
                tileIdx * 32 +
                  (verticalFlip ? 7 - tileY : tileY) * 4 +
                  Math.floor((horizontalFlip ? 7 - tileX : tileX) / 2)
              ];
            if (tileX % 2 && !horizontalFlip) {
              colorData &= 0xf;
            } else {
              colorData >>= 4;
            }

            imageData.data[imageDataOffset] =
              paletteObj[paletteIdx][colorData].red;
            imageData.data[imageDataOffset + 1] =
              paletteObj[paletteIdx][colorData].green;
            imageData.data[imageDataOffset + 2] =
              paletteObj[paletteIdx][colorData].blue;
            imageData.data[imageDataOffset + 3] = 255;

            imageDataOffset += 4;
          }
          imageDataOffset += 32;
        }
      }
    }
    ctx.fillText(`${blockIdx}`, xPos, yPos);
    ctx.putImageData(imageData, xPos, yPos);
  }

  parsePalettes(rsData: string) {
    const paletteBytes = this.parseSection(rsData, 'palette_all_data');

    const paletteHex = [[], [], [], []];
    const paletteObj = [[], [], [], []];
    for (let ci = 0; ci < paletteHex.length; ci++) {
      const bytes = paletteBytes.slice(ci * 32, (ci + 1) * 32);
      for (let i = 0; i < 32; i += 2) {
        const byte = bytes[i];
        // Max brightness value for CSS color is 0xFF and for Genesis it's 0xE, multiply by 0x12 to convert between two
        const blue = 0x12 * byte;
        const green = (bytes[i + 1] >> 4) * 0x12;
        const red = (bytes[i + 1] & 0xf) * 0x12;
        paletteHex[ci][i / 2] = (red << 16) + (green << 8) + blue;
        paletteObj[ci][i / 2] = {
          red,
          green,
          blue,
        };
      }
    }

    return { paletteHex, paletteObj };
  }

  parseSection(rsData: string, label: string) {
    label += ':\n';
    const sectionStart = rsData.indexOf(label) + label.length;
    const sectionEnd = rsData.indexOf('\n\n', sectionStart);
    const sectionText = rsData.slice(sectionStart, sectionEnd);
    const byteArray = [];
    sectionText.split('\n').forEach((line) => {
      line = line.replace('dc.b', '');
      line = line.replace('dc.w', '');
      // Skip pointers
      if (line.indexOf('dc.l') !== -1) {
        return;
      }

      line.split(',').forEach((byte) => {
        byteArray.push(parseInt(byte));
      });
    });

    return byteArray;
  }

  evenPixel(byte: number, selectedPalette: number) {
    return this.palettes[selectedPalette][byte & 0xf]
      .toString(16)
      .padStart(6, '0');
  }

  oddPixel(byte: number, selectedPalette: number) {
    return this.palettes[selectedPalette][byte >> 4]
      .toString(16)
      .padStart(6, '0');
  }
}
