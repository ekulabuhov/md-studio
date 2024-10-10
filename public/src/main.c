#include <genesis.h>

#include "gfx.h"
#include "dma.h"

#include "player.h"
#include "camera.h"
#include "bazzbomber.h"

Player player;
Camera camera;
static void joyEvent(u16 joy, u16 changed, u16 state);

int main(bool hard)
{
    u16 ind;

    // disable interrupt when accessing VDP
    SYS_disableInts();
    // initialization
    VDP_setScreenWidth320();

    // set all palette to black
    PAL_setColors(0, (u16 *)palette_black, 64, DMA);

    // load background tilesets in VRAM
    ind = TILE_USER_INDEX;

    // VDP process done, we can re enable interrupts
    SYS_enableInts();

    // start music
    // XGM2_play(sonic_music);

    // init sprite engine with default parameters
    SPR_init();

    // init sonic sprite
    Sprite *sprite = SPR_addSprite(&sonic_sprite, 0, 0, TILE_ATTR(PAL0, TRUE, FALSE, FALSE));

    Sprite *bazzbomber_sprite = SPR_addSprite(&enemy01_sprite, 0, 0, TILE_ATTR(PAL0, TRUE, FALSE, FALSE));
    Bazzbomber bazzbomber;
    BAZZBOMBER_constructor(&bazzbomber, bazzbomber_sprite, FIX32(408), FIX32(800));

    JOY_setEventHandler(joyEvent);

    // init sonic sprite
    // sprite = SPR_addSprite(&sonic_sprite, 0, 0, TILE_ATTR(PAL0, TRUE, FALSE, FALSE));
    // PAL_setPalette(PAL0, sonic_sprite.palette->data, CPU);

    PAL_setPaletteColors(0, &palette_all, CPU);

    // BG start tile index
    u16 bgBaseTileIndex[2];
    // load background tilesets in VRAM
    // ind = vramIndex;
    bgBaseTileIndex[0] = ind;
    VDP_loadTileSet(&bga_tileset, ind, DMA);
    ind += bga_tileset.numTile;
    bgBaseTileIndex[1] = ind;
    VDP_loadTileSet(&bgb_tileset, ind, DMA);
    ind += bgb_tileset.numTile;

    // init backgrounds
    Map *bga = MAP_create(&bga_map, BG_A, TILE_ATTR_FULL(PAL0, FALSE, FALSE, FALSE, bgBaseTileIndex[0]));
    Map *bgb = MAP_create(&bgb_map, BG_B, TILE_ATTR_FULL(PAL0, FALSE, FALSE, FALSE, bgBaseTileIndex[1]));
    PLAYER_constructor(&player, sprite, bga);

    char str[64];

    while (TRUE)
    {
        u16 joyState = JOY_readJoypad(JOY_1);

        // First
        PLAYER_handleInput(&player, joyState);
        PLAYER_update(&player);

        BAZZBOMBER_update(&bazzbomber);

        // then set camera from player position
        CAMERA_centerOn(&camera, fix32ToInt(player.posX), fix32ToInt(player.posY));

        // scroll maps
        MAP_scrollTo(bga, camera.bgaPosX, camera.bgaPosY);
        // scrolling is slower on BGB
        MAP_scrollTo(bgb, camera.bgbPosX, camera.bgbPosY);

        // better to do it separately, when camera position is up to date
        s16 x = fix32ToInt(player.posX) - camera.camPosX;
        s16 y = fix32ToInt(player.posY) - camera.camPosY;
        SPR_setPosition(player.sprite, x, y);
        SPR_setHFlip(player.sprite, player.hFlip);

        x = fix32ToInt(bazzbomber.posX) - camera.camPosX;
        y = fix32ToInt(bazzbomber.posY) - camera.camPosY;
        SPR_setPosition(bazzbomber.sprite, x, y);

        // debugLog("bazzbomber sprite X: %05d, Y: %05d", bazzbomber.posX, bazzbomber.posY);

        // update sprites
        SPR_update();

        SYS_doVBlankProcess();
    }

    return 0;
}

static void joyEvent(u16 joy, u16 changed, u16 state)
{
    PLAYER_doJoyAction(&player, joy, changed, state);
}

int debugLog(const char *fmt, ...)
{
    char buffer[256];
    va_list args;
    int i;

    va_start(args, fmt);
    i = vsprintf(buffer, fmt, args);
    va_end(args);

    vu32* pb = (vu32 *)0xa14400;
    *pb = buffer;

    return i;
}