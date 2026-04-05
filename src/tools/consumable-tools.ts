import { z } from 'zod';
import mineflayer from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';

interface InventoryItem {
  name: string;
  count: number;
  slot: number;
}

function isEdible(bot: mineflayer.Bot | undefined | null, itemName: string | undefined | null): boolean {
  if (!bot || !itemName) return false;

  try {
    // 支持される環境: bot.registry.itemsByName もしくは bot.mcData.itemsByName
    const registry = (bot as unknown as { registry?: any; mcData?: any }).registry ?? (bot as unknown as { registry?: any; mcData?: any }).mcData ?? null;
    const itemsByName = registry && (registry.itemsByName ?? registry.items) ? (registry.itemsByName ?? registry.items) : null;
    if (itemsByName && typeof itemsByName === 'object') {
      const itemData = (itemsByName as Record<string, any>)[String(itemName)];
      if (itemData && itemData.food !== undefined) return true;
    }
  } catch {
    // registy の取得に失敗しても落とさない
  }

  // フォールバック: 簡易判定リスト（registry が無い環境向け）
  const edible = [
    'apple', 'bread', 'beef', 'cooked_beef', 'porkchop', 'cooked_porkchop', 'chicken', 'cooked_chicken',
    'mutton', 'cooked_mutton', 'rabbit', 'cooked_rabbit', 'cod', 'cooked_cod', 'salmon', 'cooked_salmon',
    'golden_apple', 'golden_carrot', 'pumpkin_pie', 'carrot', 'potato', 'baked_potato'
  ];
  const n = String(itemName).toLowerCase();
  return edible.some(e => n.includes(e));
}

export function registerConsumableTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool(
    'eat-item',
    "Eat an edible item from the bot's inventory",
    {
      itemName: z.string().trim().optional(),
      slot: z.number().optional(),
      count: z.number().optional()
    },
    async ({ itemName, slot, count: _count }: { itemName?: string; slot?: number; count?: number }) => {
      const bot = getBot();

      if (!bot) {
        return factory.createErrorResponse('Bot not connected');
      }

      const items = (bot.inventory && typeof bot.inventory.items === 'function') ? bot.inventory.items() : [];

      let item: InventoryItem | undefined;

      if (typeof slot === 'number') {
        item = items.find((i: any) => i.slot === slot) as InventoryItem | undefined;
      } else if (typeof itemName === 'string' && itemName.trim() !== '') {
        item = items.find((i: any) => (i.name || '').includes(itemName.toLowerCase())) as InventoryItem | undefined;
      } else {
        item = items.find((i: any) => isEdible(bot, i.name)) as InventoryItem | undefined;
      }

      if (!item) {
        return factory.createErrorResponse(`Couldn't find edible item${itemName ? ` matching '${itemName}'` : ''}`);
      }

      if (!isEdible(bot, item.name)) {
        return factory.createErrorResponse(`${item.name} is not edible`);
      }

      try {
        if (typeof bot.equip === 'function') {
          await bot.equip(item as unknown as any, 'hand');
        }

        if (typeof bot.activateItem === 'function') {
          await bot.activateItem();
        } else {
          return factory.createErrorResponse('bot.activateItem is not available');
        }

        return factory.createResponse(`Consumed ${item.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return factory.createErrorResponse(msg);
      }
    }
  );
}
