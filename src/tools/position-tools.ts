// 位置・移動に関するツールを登録するモジュール
// このファイルはボットの現在位置を取得したり、指定座標へ移動したり、
// 視点を向けたりする小さな関数（ツール）を MCP 経由で外部から呼べるようにします。
import { z } from "zod";
import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import { Vec3 } from 'vec3';
import { ToolFactory } from '../tool-factory.js';
import { coerceCoordinates } from './coordinate-utils.js';

// 前進や後退など、単純な方向の列挙型
type Direction = 'forward' | 'back' | 'left' | 'right';
// mineflayer の Block 型が型定義に存在しない環境向けの互換型
type BlockLike = { type: number } | null | undefined;

/* ===================
   resolveNearestWalkableY...渡された座標が空気ブロックならそのまま、そうでない場合は上,下に向かって空気ブロックを探す関数。見つかった空気ブロックの座標を返す。見つからなければnullを返す。
   =================== */

  /* ===================
     resolveNearestWalkableY...渡された座標が空気ブロックならそのまま、そうでない場合は上,下に向かって空気ブロックを探す関数。
     見つかった空気ブロックの座標（歩行可能な Y 座標）を返す。見つからなければ null を返す。
     使い方: resolveNearestWalkableY(bot, x, y, z)
     =================== */
  function resolveNearestWalkableY(bot: mineflayer.Bot, x: number,y: number, z: number): number | null {
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    const sz = Math.floor(z);



    
    // まずはsyから下(最大-64まで)へ検索して最初に見つかった
    // "ブロック (y) とその上 (y+1) が共に空気ブロックである"位置を探し、その y を foundYBelow に保存する。
    // 見つからなければ null のまま。
    let foundYBelow: number | null = null;
    const minY = Math.max(0, sy - 64);
    const isAir = (blk: BlockLike) => !blk || blk.type === 0;
    for (let yy = sy; yy >= minY; yy--) {
      const b = bot.blockAt(new Vec3(sx, yy, sz));
      const bAbove = bot.blockAt(new Vec3(sx, yy + 1, sz));
      if (isAir(b) && isAir(bAbove)) {
        foundYBelow = yy;
        break;
      }
    }

    // 次に sy から上 (最大 320 まで) へ検索して、同様に "y と y+1 が空気" となる最初の位置を foundYAbove に保存する。
    let foundYAbove: number | null = null;
    const maxY = 320;
    for (let yy = sy; yy <= maxY; yy++) {
      const b = bot.blockAt(new Vec3(sx, yy, sz));
      const bAbove = bot.blockAt(new Vec3(sx, yy + 1, sz));
      if (isAir(b) && isAir(bAbove)) {
        foundYAbove = yy;
        break;
      }
    }

    // foundYBelow と foundYAbove の両方が見つかったら sy から近い方を返す。
    if (foundYBelow !== null && foundYAbove !== null) {
      const dBelow = Math.abs(sy - foundYBelow);
      const dAbove = Math.abs(foundYAbove - sy);
      return dBelow <= dAbove ? foundYBelow : foundYAbove;
    }
    if (foundYBelow !== null) return foundYBelow;
    if (foundYAbove !== null) return foundYAbove;
    return null;
  }

export function registerPositionTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  // 現在位置を返すツール
  factory.registerTool(
    "get-position",
    "Get the current position of the bot",
    {},
    async () => {
      const bot = getBot();
      const position = bot.entity.position;
      const pos = {
        x: Math.floor(position.x),
        y: Math.floor(position.y),
        z: Math.floor(position.z)
      }
      return factory.createResponse(`Current position: (${pos.x}, ${pos.y}, ${pos.z})`);
    }
  );

  // 指定した座標の地面Y（最上位ブロック + 1）を返すツール
  factory.registerTool(
    "get-ground-y",
    "Get ground level Y (highest solid block + 1) for the given x/z coordinates",
    {
      x: z.coerce.number().describe("X coordinate"),
      z: z.coerce.number().describe("Z coordinate"),
    },
    async ({ x, z }: { x: number; z: number }) => {
      const bot = getBot();
      const coerced = coerceCoordinates(x, 0, z);
      const groundY = resolveNearestWalkableY(bot, coerced.x, coerced.y, coerced.z);
      if (groundY === null) {
        return factory.createErrorResponse(`Could not find a walkable top block at (${coerced.x}, ${coerced.z})`);
      }
      return factory.createResponse(
        `Ground position: (${coerced.x}, ${groundY}, ${coerced.z})`
      );
    }
  );



  // 移動ツール（スプリント機能付き）
  factory.registerTool(
    "move-to-position",
    "Move the bot to a specific position with optional sprint. Unless dodig is set to true, the x and z coordinates will be corrected to the y coordinate of the nearest air block above them(Useful when you don't know the ground level). ",
    {
      x: z.coerce.number().describe("X coordinate"),
      y: z.coerce.number().describe("Y coordinate").describe("Y coordinate (Unless dodig is set to true to find nearest walkable Y)"),
      z: z.coerce.number().describe("Z coordinate"),
      range: z.coerce.number().finite().optional().describe("How close to get to the target (default: 1)"),
      sprint: z.boolean().optional().default(false).describe("Whether to sprint (default: false)"),
      timeoutMs: z.number().int().min(50).optional().describe("Timeout in milliseconds before cancelling (min: 50, default: no timeout)"),
      doDig: z.boolean().optional().default(false).describe("Whether to allow digging through blocks if path is obstructed (default: false)")
    },
    async ({ x, y, z, range = 1, sprint = false, timeoutMs , long_timeout = false, doDig = false }: { x: number; y: number ; z: number; range?: number; sprint?: boolean; timeoutMs?: number; long_timeout?: boolean; doDig?: boolean }) => {
      const bot = getBot();
      let targetX = x;
      let targetY = y;
      let targetZ = z;

      if (!doDig) {
        const coerced = coerceCoordinates(x, y, z);
        targetX = coerced.x;
        targetY = coerced.y;
        targetZ = coerced.z;

        const autoY = resolveNearestWalkableY(bot, targetX, targetY, targetZ);
        if (autoY === null) {
          throw new Error(`Could not find a walkable top block at (${targetX}, ${targetZ})`);
        }
        targetY = autoY;
      } else {
        const coerced = coerceCoordinates(x, y, z);
        targetX = coerced.x;
        targetY = coerced.y;
        targetZ = coerced.z;
      }

      const goal = new goals.GoalNear(targetX, targetY, targetZ, range);
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let timeoutPromise: Promise<never> | null = null;
      let timedOut = false;
      let stuck = false;
      let stuckIntervalId: ReturnType<typeof setInterval> | null = null;
      let stuckPromise: Promise<never> | null = null;
      //もしlong_timeoutがtrueの場合、stuckTimeoutMsを60000にして、タイムアウトを1分に延長する。そうでない場合は15000にする。
      const stuckTimeoutMs = long_timeout ? 60000 : 15000;
      const movements = bot.pathfinder.movements;
      const originalCanDig = movements ? movements.canDig : undefined;
      let gotoPromise: Promise<unknown> | null = null;

      try {
        if (sprint) {
          try { bot.setControlState('sprint', true); } catch (_err) { void _err; }
        }

        // 掘削を禁止して穴を掘らないようにする
        if (movements && typeof originalCanDig === 'boolean') {
          movements.canDig = false;
        }

        const initialPos = bot.entity?.position;
        if (initialPos) {
          let lastPos = new Vec3(initialPos.x, initialPos.y, initialPos.z);
          let lastMoveAt = Date.now();
          stuckPromise = new Promise((_, reject) => {
            stuckIntervalId = setInterval(() => {
              const currentPos = bot.entity?.position;
              if (!currentPos) return;
              const moved = Math.floor(currentPos.x) !== Math.floor(lastPos.x)
                || Math.floor(currentPos.z) !== Math.floor(lastPos.z);

              if (moved) {
                lastPos = new Vec3(currentPos.x, currentPos.y, currentPos.z);
                lastMoveAt = Date.now();
                return;
              }

              if (Date.now() - lastMoveAt >= stuckTimeoutMs) {
                stuck = true;
                reject(new Error('タイムアウト、ブロックと接している可能性があります。周りのブロックを確認することをお勧めします。long_timeoutをtrueにするとそのリクエストで一分間にタイムアウトを延長します。'));
              }
            }, 250);
          });
        }

        if (timeoutMs !== undefined) {
          timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              timedOut = true;
              reject(new Error(`Move timed out after ${timeoutMs}ms`));
            }, timeoutMs);
          });
        }

        const pendingGoto = bot.pathfinder.goto(goal);
        if (!pendingGoto) {
          throw new Error('Pathfinder failed to start movement');
        }
        gotoPromise = pendingGoto;

        try {
          if (!gotoPromise) {
            throw new Error('Pathfinder movement promise is not available');
          }
          const racePromises: Array<Promise<unknown>> = [gotoPromise];
          if (timeoutPromise) racePromises.push(timeoutPromise);
          if (stuckPromise) racePromises.push(stuckPromise);
          await Promise.race(racePromises);
          const action = sprint ? 'ran' : 'walked';
          return factory.createResponse(`Successfully ${action} to position near (${targetX}, ${targetY}, ${targetZ})`);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      } catch (error) {
        if (timedOut) {
          throw new Error(`Move timed out after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        if (sprint) {
          try { bot.setControlState('sprint', false); } catch (_err) { void _err; }
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (stuckIntervalId) {
          clearInterval(stuckIntervalId);
        }
        if (movements && typeof originalCanDig === 'boolean') {
          movements.canDig = originalCanDig;
        }
        if (timedOut || stuck) {
          try { bot.pathfinder.stop(); } catch (_err) { void _err; }
        }
        if (gotoPromise) {
          gotoPromise.catch(() => {});
        }
      }
    }
  );

  // 視点を指定座標に向けるツール
  factory.registerTool(
    "look-at",
    "Make the bot look at a specific position",
    {
      x: z.coerce.number().describe("X coordinate"),
      y: z.coerce.number().describe("Y coordinate"),
      z: z.coerce.number().describe("Z coordinate"),
    },
    async ({ x, y, z }) => {
      ({ x, y, z } = coerceCoordinates(x, y, z));

      const bot = getBot();
      await bot.lookAt(new Vec3(x, y, z), true);
      return factory.createResponse(`Looked at position (${x}, ${y}, ${z})`);
    }
  );

  // ジャンプする単純なツール
  factory.registerTool(
    "jump",
    "Make the bot jump",
    {},
    async () => {
      const bot = getBot();
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 250);
      return factory.createResponse("Successfully jumped");
    }
  );

  // 指定した方向に一定時間移動するツール（コントロールステートを使う）
  factory.registerTool(
    "move-in-direction",
    "Move the bot in a specific direction for a duration (auto-jump supported)",
    {
      direction: z.enum(['forward', 'back', 'left', 'right']).describe("Direction to move"),
      duration: z.number().optional().describe("Duration in milliseconds (default: 1000)"),
      autoJump: z.boolean().optional().default(true).describe("Whether to auto-jump while moving (default: true)")
    },
    async ({ direction, duration = 1000, autoJump = true }: { direction: Direction; duration?: number; autoJump?: boolean }) => {
      const bot = getBot();
      return new Promise((resolve) => {
        bot.setControlState(direction, true);
        if (autoJump) {
          bot.setControlState('jump', true);
        }
        setTimeout(() => {
          bot.setControlState(direction, false);
          if (autoJump) {
            bot.setControlState('jump', false);
          }
          const suffix = autoJump ? ' with auto-jump' : '';
          resolve(factory.createResponse(`Moved ${direction} for ${duration}ms${suffix}`));
        }, duration);
      });
    }
  );

  // 浸水時のみ動作し、水中経路が完全に水ブロックで構成されている場合にのみ泳ぐ
  factory.registerTool(
    "swim-to-position",
    "Swim to a specified position via water-only path (fails if starting or path not fully water)",
    {
      x: z.coerce.number().describe("X coordinate"),
      y: z.coerce.number().describe("Y coordinate"),
      z: z.coerce.number().describe("Z coordinate"),
      range: z.coerce.number().finite().optional().describe("How close to get to the target (default: 1)"),
      timeoutMs: z.number().int().min(50).optional().describe("Timeout in milliseconds before cancelling (min: 50, default: no timeout)"),
      sampleSteps: z.number().int().positive().optional().default(16).describe("Number of samples along path to validate water"),
    },
    async ({ x, y, z, range = 1, timeoutMs, sampleSteps = 16 }: { x: number; y: number; z: number; range?: number; timeoutMs?: number; sampleSteps?: number }) => {
      ({ x, y, z } = coerceCoordinates(x, y, z));

      const bot = getBot();
      const currentPos = bot.entity?.position;
      if (!currentPos) {
        return factory.createResponse('Bot position not available');
      }

      const destination = new Vec3(x, y, z);

      const isWaterBlock = (pos: Vec3): boolean => {
        const block = bot.blockAt(pos);
        if (!block) return false;
        const name = String(block.name).toLowerCase();
        return name.includes('water') || name.includes('bubble_column');
      };

      // 現在位置とゴール位置が水ブロック上（または水中）であることを確認
      if (!isWaterBlock(currentPos)) {
        return factory.createErrorResponse('Fail: Bot is not currently in water');
      }
      if (!isWaterBlock(destination)) {
        return factory.createErrorResponse('Fail: Destination is not water');
      }

      // 直線上の経路サンプルをチェックして、すべて水ブロックであることを確認
      for (let i = 0; i <= sampleSteps; i++) {
        const t = i / sampleSteps;
        const samplePos = new Vec3(
          currentPos.x + (destination.x - currentPos.x) * t,
          currentPos.y + (destination.y - currentPos.y) * t,
          currentPos.z + (destination.z - currentPos.z) * t
        );
        const point = new Vec3(Math.floor(samplePos.x), Math.floor(samplePos.y), Math.floor(samplePos.z));
        if (!isWaterBlock(point)) {
          return factory.createErrorResponse(`Fail: Path point at (${point.x}, ${point.y}, ${point.z}) is not water`);
        }
      }

      const goal = new goals.GoalNear(x, y, z, range);
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;

      try {
        // 水中でもパスファインディングが重要
        if (timeoutMs !== undefined) {
          timeoutId = setTimeout(() => {
            timedOut = true;
          }, timeoutMs);
        }

        await bot.pathfinder.goto(goal);
        if (timedOut) {
          return factory.createErrorResponse(`Fail: Swim timed out after ${timeoutMs}ms`);
        }

        return factory.createResponse(`Successfully swam to near (${x}, ${y}, ${z})`);
      } catch (error) {
        return factory.createErrorResponse(`Fail: Swim pathfinding error: ${(error as Error).message}`);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (timedOut) {
          try { bot.pathfinder.stop(); } catch (_err) { void _err; }
        }
      }
    }
  );

  // 指定武器でエンティティに近接攻撃を行うツール
  factory.registerTool(
    "attack-nearest-entity-with-item",
    "Attack nearest entity within range using a specific weapon (fail if weapon not in inventory)",
    {
      weapon: z.string().describe("Weapon name (e.g., 'iron_sword', 'diamond_sword')"),
      maxDistance: z.coerce.number().finite().optional().default(12).describe("Maximum distance to search for target"),
      attackRange: z.coerce.number().finite().optional().default(2).describe("Distance close enough to attack"),
      targetType: z.enum(['player', 'mob', 'any']).optional().default('any').describe("Type of target to attack"),
      timeoutMs: z.number().int().min(50).optional().default(15000).describe("Timeout for pathfinding")
    },
    async ({ weapon, maxDistance = 12, attackRange = 2, targetType = 'any', timeoutMs = 15000 }) => {
      const bot = getBot();

      // ボット位置確認
      if (!bot.entity?.position) {
        return factory.createErrorResponse('Fail: Bot position not available');
      }

      const botPos = bot.entity.position;

      // インベントリから武器を検索（小文字で正規化）
      const inventory = bot.inventory.items();
      const weaponNormalized = weapon.toLowerCase().replace(/\s+/g, '_');
      const weaponItem = inventory.find((item) => {
        const itemName = String(item.name).toLowerCase().replace(/\s+/g, '_');
        return itemName === weaponNormalized || itemName.includes(weaponNormalized);
      });

      if (!weaponItem) {
        return factory.createErrorResponse(`Fail: Weapon '${weapon}' not found in inventory`);
      }

      // 武器をメインハンドへ装備
      try {
        await bot.equip(weaponItem, 'hand');
      } catch (err) {
        return factory.createErrorResponse(`Fail: Cannot equip weapon: ${(err as Error).message}`);
      }

      // ターゲット検索（指定範囲内＆タイプフィルタ）
      let targetEntity = null;
      let closestDist = maxDistance;

      for (const entity of Object.values(bot.entities)) {
        if (!entity || !entity.position) continue;
        if (entity === bot.entity) continue; // 自分自身は除外

        // タイプフィルタ
        if (targetType !== 'any') {
          if (targetType === 'player' && entity.type !== 'player') continue;
          if (targetType === 'mob' && entity.type !== 'mob') continue;
        }

        const dist = botPos.distanceTo(entity.position);
        if (dist <= closestDist) {
          closestDist = dist;
          targetEntity = entity;
        }
      }

      if (!targetEntity) {
        return factory.createErrorResponse(`Fail: No target of type '${targetType}' within ${maxDistance} blocks`);
      }

      const targetName = targetEntity.name || (targetEntity as { username?: string }).username || 'unknown';

      // ターゲットまで移動
      const goal = new goals.GoalNear(
        targetEntity.position.x,
        targetEntity.position.y,
        targetEntity.position.z,
        attackRange
      );

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;

      try {
        if (timeoutMs) {
          timeoutId = setTimeout(() => {
            timedOut = true;
          }, timeoutMs);
        }

        await bot.pathfinder.goto(goal);

        if (timedOut) {
          return factory.createErrorResponse(`Fail: Attack timed out after ${timeoutMs}ms`);
        }

        // 攻撃実行（目標が存在し、移動後に極端に離れていないことを確認）
        const currentBotPos = bot.entity?.position ?? botPos;
        if (!targetEntity || currentBotPos.distanceTo(targetEntity.position) > Math.max(attackRange * 2, maxDistance)) {
          return factory.createErrorResponse('Fail: Target moved out of range or disappeared');
        }

        try {
          bot.attack(targetEntity);
          // 追加攻撃を短い間隔で（複数ヒット）
          await new Promise(resolve => setTimeout(resolve, 100));
          if (targetEntity && Object.values(bot.entities).includes(targetEntity)) {
            bot.attack(targetEntity);
          }
        } catch (err) {
          return factory.createErrorResponse(`Fail: Attack error: ${(err as Error).message}`);
        }

        const finalDist = currentBotPos.distanceTo(targetEntity.position);
        return factory.createResponse(
          `Attacked ${targetName} with ${weapon} at distance ${finalDist.toFixed(2)}m`
        );
      } catch (error) {
        return factory.createErrorResponse(
          `Fail: Cannot reach target (${(error as Error).message})`
        );
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (timedOut) {
          try { bot.pathfinder.stop(); } catch (_err) { void _err; }
        }
      }
    }
  );

  // 素手で最近傍エンティティを攻撃するツール
  factory.registerTool(
    "attack-nearest-entity",
    "Attack nearest entity within range with bare hands (no weapon required)",
    {
      maxDistance: z.coerce.number().finite().optional().default(12).describe("Maximum distance to search for target"),
      attackRange: z.coerce.number().finite().optional().default(2).describe("Distance close enough to attack"),
      targetType: z.enum(['player', 'mob', 'any']).optional().default('any').describe("Type of target to attack"),
      timeoutMs: z.number().int().min(50).optional().default(15000).describe("Timeout for pathfinding")
    },
    async ({ maxDistance = 12, attackRange = 2, targetType = 'any', timeoutMs = 15000 }) => {
      const bot = getBot();

      // ボット位置確認
      if (!bot.entity?.position) {
        return factory.createErrorResponse('Fail: Bot position not available');
      }

      const botPos = bot.entity.position;

      // ターゲット検索（指定範囲内＆タイプフィルタ）
      let targetEntity = null;
      let closestDist = maxDistance;

      for (const entity of Object.values(bot.entities)) {
        if (!entity || !entity.position) continue;
        if (entity === bot.entity) continue; // 自分自身は除外

        // タイプフィルタ
        if (targetType !== 'any') {
          if (targetType === 'player' && entity.type !== 'player') continue;
          if (targetType === 'mob' && entity.type !== 'mob') continue;
        }

        const dist = botPos.distanceTo(entity.position);
        if (dist <= closestDist) {
          closestDist = dist;
          targetEntity = entity;
        }
      }

      if (!targetEntity) {
        return factory.createErrorResponse(`Fail: No target of type '${targetType}' within ${maxDistance} blocks`);
      }

      const targetName = targetEntity.name || (targetEntity as { username?: string }).username || 'unknown';

      // ターゲットまで移動
      const goal = new goals.GoalNear(
        targetEntity.position.x,
        targetEntity.position.y,
        targetEntity.position.z,
        attackRange
      );

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;

      try {
        if (timeoutMs) {
          timeoutId = setTimeout(() => {
            timedOut = true;
          }, timeoutMs);
        }

        await bot.pathfinder.goto(goal);

        if (timedOut) {
          return factory.createErrorResponse(`Fail: Punch timed out after ${timeoutMs}ms`);
        }

        // 攻撃実行（目標が存在し、距離内なら複数回攻撃）
        const currentBotPos = bot.entity?.position ?? botPos;
        if (!targetEntity || currentBotPos.distanceTo(targetEntity.position) > Math.max(attackRange * 2, maxDistance)) {
          return factory.createErrorResponse('Fail: Target moved out of range or disappeared');
        }

        try {
          bot.attack(targetEntity);
          // 追加攻撃を短い間隔で（複数ヒット）
          await new Promise(resolve => setTimeout(resolve, 100));
          if (targetEntity && Object.values(bot.entities).includes(targetEntity)) {
            bot.attack(targetEntity);
          }
        } catch (err) {
          return factory.createErrorResponse(`Fail: Attack error: ${(err as Error).message}`);
        }

        const finalDist = currentBotPos.distanceTo(targetEntity.position);
        return factory.createResponse(
          `Punched ${targetName} with bare hands at distance ${finalDist.toFixed(2)}m`
        );
      } catch (error) {
        return factory.createErrorResponse(
          `Fail: Cannot reach target (${(error as Error).message})`
        );
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (timedOut) {
          try { bot.pathfinder.stop(); } catch (_err) { void _err; }
        }
      }
    }
  );
}
