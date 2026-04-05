// エンティティ検索に関するツール群
// - 近くのプレイヤーや MOB を見つけるユーティリティを提供します。
import { z } from "zod";
import type { Bot } from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';

type Entity = ReturnType<Bot['nearestEntity']>;

export function registerEntityTools(factory: ToolFactory, getBot: () => Bot): void {
  // エンティティ関連ツールの登録
  // - 近傍エンティティ検索やフィルタリング等、周囲のエンティティ情報を取得するためのユーティリティ
  // - 結果は人が読みやすい文字列として返却され、外部の LLM が扱いやすい形式にしています。
  factory.registerTool(
    "find-entity",
    "Find the nearest entity of a specific type",
    {
      type: z.string().optional().describe("Type of entity to find (empty for any entity)"),
      maxDistance: z.coerce.number().finite().optional().describe("Maximum search distance (default: 16)")
    },
    async ({ type = '', maxDistance = 16 }) => {
      const bot = getBot();
      const entityFilter = (entity: NonNullable<Entity>) => {
        if (!type) return true;
        if (type === 'player') return entity.type === 'player';
        if (type === 'mob') return entity.type === 'mob';
        return Boolean(entity.name && entity.name.includes(type.toLowerCase()));
      };

      const entity = bot.nearestEntity(entityFilter);

      if (!entity || bot.entity.position.distanceTo(entity.position) > maxDistance) {
        return factory.createResponse(`No ${type || 'entity'} found within ${maxDistance} blocks`);
      }

      const entityName = entity.name || (entity as { username?: string }).username || entity.type;
      return factory.createResponse(`Found ${entityName} at position (${Math.floor(entity.position.x)}, ${Math.floor(entity.position.y)}, ${Math.floor(entity.position.z)})`);
    }
  );

  // 周囲 n*n*n の範囲内にいるエンティティを列挙するツール
  factory.registerTool(
    "scan-nearby-entities",
    "Scan all entities within an n x n x n cube around a center point",
    {
      range: z.coerce.number().int().positive().default(8).describe("Range (blocks) from center in each direction"),
      center: z
        .object({ x: z.number(), y: z.number(), z: z.number() })
        .optional()
        .describe("Optional center coordinates (default: bot position)"),
      includeSelf: z.boolean().optional().default(false).describe("Whether to include bot itself"),
      entityType: z.string().optional().describe("Entity type filter, e.g., 'player', 'mob'")
    },
    async ({ range = 8, center, includeSelf = false, entityType = '' }) => {
      const bot = getBot();
      const origin = center
        ? bot.entity.position.offset(center.x - bot.entity.position.x, center.y - bot.entity.position.y, center.z - bot.entity.position.z)
        : bot.entity.position;

      const entities = Object.values(bot.entities).filter((entity) => {
        if (!entity || !entity.position) return false;

        if (!includeSelf && entity === bot.entity) return false;

        if (entityType) {
          if (entityType === 'player' && entity.type !== 'player') return false;
          if (entityType === 'mob' && entity.type !== 'mob') return false;
          if (entityType !== 'player' && entityType !== 'mob') {
            const name = entity.name?.toLowerCase() ?? '';
            if (!name.includes(entityType.toLowerCase())) return false;
          }
        }

        const dx = Math.abs(entity.position.x - origin.x);
        const dy = Math.abs(entity.position.y - origin.y);
        const dz = Math.abs(entity.position.z - origin.z);
        return dx <= range && dy <= range && dz <= range;
      });

      if (entities.length === 0) {
        return factory.createResponse(`No entities found within ${range * 2 + 1}^3 around ${origin.x.toFixed(2)},${origin.y.toFixed(2)},${origin.z.toFixed(2)}`);
      }

      const rows = entities.map((entity) => {
        const type = entity.type || 'unknown';
        const name = entity.name || (entity as { username?: string }).username || '(unnamed)';
        const pos = entity.position ? `(${entity.position.x.toFixed(2)}, ${entity.position.y.toFixed(2)}, ${entity.position.z.toFixed(2)})` : '(no position)';
        const dist = entity.position ? origin.distanceTo(entity.position).toFixed(2) : 'n/a';
        const health = (entity as any).health ?? 'n/a';
        return `- id=${entity.id} type=${type} name=${name} pos=${pos} dist=${dist} health=${health}`;
      });

      const output = `Entities within ${range * 2 + 1}^3 around ${origin.x.toFixed(2)},${origin.y.toFixed(2)},${origin.z.toFixed(2)} (count=${entities.length})\n` + rows.join('\n');
      return factory.createResponse(output);
    }
  );
}

