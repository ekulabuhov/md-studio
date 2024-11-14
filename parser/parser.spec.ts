import { test } from '@japa/runner';
import { parse } from './parser.mjs';
test.group('Parser', () => {
  test('generates array pointers', ({ assert }) => {
    const code = `export class TrapsSaw {
  points: [u16,u16][];
  constructor(points: [u16,u16][]) {
    this.points = points;
  }
}`;
    const { props, forwardDeclarations } = parse(code, 'traps_saw.ts');
    assert.equal(
      props,
      'typedef struct {\n    u16 (*points)[2];\n} TrapsSaw;\n'
    );
    assert.deepEqual(forwardDeclarations, [
      'void TRAPS_SAW_constructor(TrapsSaw *this, u16 (*points)[2]);',
    ]);
  });

  test('member expressions')
    .with([
      {
        // Local calls are prepended by class name and accept 'this' as param
        input: 'this.setCameraPosition()',
        expected: `TRAPS_SAW_setCameraPosition(this)`,
      },
      {
        // Check class call with parameter
        input: 'this.sprite.setAnim(ANIM_IDLE)',
        expected: `SPR_setAnim(this->sprite, ANIM_IDLE)`,
      },
      {
        // Check class call without parameters
        input: 'this.sprite.getAnimationDone()',
        expected: `SPR_getAnimationDone(this->sprite)`,
      },
      {
        // Local member access
        input: 'this.posX',
        expected: 'this->posX',
      },
      {
        // Function argument, e.g. handleCollision(player: Player) { player.die(); }
        input: 'player.die(this)',
        expected: 'PLAYER_die(player, this)',
      },
      {
        //
        classProperties: 'itemDust: ItemsDust',
        input: 'this.itemDust.place(this.posX, this.posY)',
        expected: 'ITEMS_DUST_place(this->itemDust, this->posX, this->posY)',
      },
    ])
    .run(({ assert }, row) => {
      const code = `export class TrapsSaw {
      ${row.classProperties || ''}
    constructor() {
      ${row.input};
    }
  }`;
      const results = parse(code, 'traps_saw.ts');
      assert.equal(
        results.output,
        '#include "traps_saw.h"\n' +
          '\n' +
          'void TRAPS_SAW_constructor(TrapsSaw *this) {\n' +
          '    \n' +
          `      ${row.expected};\n` +
          '    }\n' +
          '\n'
      );
    });

  test('header includes').run(({ assert }) => {
    // Headers should only include headers for class properties (e.g. Sprite) and forward declarations (e.g. GameEntity)
    // Should not include all headers like "res_collision.h"
    const code = `
import { Sprite } from './sprite_eng';
import { getHeightValue } from './res_collision';
import { GameEntity } from './game_entity';

    export class TrapsSaw {
      sprite: Sprite;
      
      die(from: GameEntity) {
        getHeightValue();
      }
    }`;

    const { headerImports } = parse(code, 'traps_saw.ts');
    assert.deepEqual(headerImports, {
      'sprite_eng.h': true,
      'game_entity.h': true,
    });
  });
});
