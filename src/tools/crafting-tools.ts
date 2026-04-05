// クラフト（作業台やレシピ）に関するツール群
// - 利用可能なレシピの列挙、必要素材のチェック、実際のクラフト実行などを扱います。
// - このファイルは少し複雑なので、主要な処理にコメントを追加しています。
import { z } from "zod";
import mineflayer from 'mineflayer';
import minecraftData from 'minecraft-data';
import { ToolFactory } from '../tool-factory.js';
import { log } from '../logger.js';

interface RecipeIngredient {
  name: string;
  count: number;
}

interface InventoryItem {
  name: string;
  count: number;
}

type McDataItemsById = Record<string, { name?: unknown }>;

function normalizeItemName(value: string): string {
  return value.trim().toLowerCase();
}

function classifyNameMatch(candidateName: string, query: string): { exact: boolean; partial: boolean } {
  const a = normalizeItemName(candidateName);
  const b = normalizeItemName(query);
  if (a === b) return { exact: true, partial: true };
  if (a.includes(b) || b.includes(a)) return { exact: false, partial: true };
  return { exact: false, partial: false };
}

function resolveItemNames(value: unknown, itemsById: McDataItemsById): string[] {
  const result: string[] = [];
  if (!value) return result;

  if (typeof value === 'string') return [value];
  if (typeof value === 'number') {
    const name = resolveItemName(value, itemsById);
    if (name) result.push(name);
    return result;
  }

  if (Array.isArray(value)) {
    for (const v of value) {
      const n = resolveItemName(v, itemsById);
      if (n && !result.includes(n)) result.push(n);
    }
    return result;
  }

  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.name === 'string') return [v.name];
    if (typeof v.id === 'number') {
      const n = resolveItemName(v.id, itemsById);
      if (n) result.push(n);
    }
  }

  return result;
}

function formatOptionsLabel(options: string[]): string {
  if (!options || options.length === 0) return '';
  if (options.length === 1) return options[0];
  return options.join(' or ');
}

function parseRecipeIngredientOptions(recipe: unknown, itemsById: McDataItemsById): Array<{ options: string[]; count: number }> {
  const out: Array<{ options: string[]; count: number }> = [];
  if (!recipe) return out;
  const r = recipe as Record<string, unknown>;

  const map: Record<string, { options: string[]; count: number }> = {};

  if (Array.isArray(r.inShape)) {
    for (const row of r.inShape as unknown[]) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const options = resolveItemNames(cell, itemsById);
        if (options.length === 0) continue;
        const key = options.slice().sort().join('|');
        map[key] = map[key] || { options, count: 0 };
        map[key].count += 1;
      }
    }
  } else if (Array.isArray(r.ingredients)) {
    for (const ing of r.ingredients as unknown[]) {
      const options = resolveItemNames(ing, itemsById);
      if (options.length === 0) continue;
      const key = options.slice().sort().join('|');
      map[key] = map[key] || { options, count: 0 };
      map[key].count += 1;
    }
  }

  for (const entry of Object.values(map)) out.push({ options: entry.options, count: entry.count });
  return out;
}

function evaluateRecipeMissing(recipe: unknown, inventory: InventoryItem[], itemsById: McDataItemsById): { canCraft: boolean; missingTotal: number; missing: { name: string; count: number }[] } {
  const missing: { name: string; count: number }[] = [];
  let missingTotal = 0;

  if (!recipe) return { canCraft: true, missingTotal: 0, missing };

  const r = recipe as Record<string, unknown>;

  const requiredCounts: Record<string, number> = {};

  if (Array.isArray(r.inShape)) {
    for (const row of r.inShape as unknown[]) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const name = resolveItemName(cell, itemsById);
        if (!name) continue;
        requiredCounts[name] = (requiredCounts[name] || 0) + 1;
      }
    }
  } else if (Array.isArray(r.ingredients)) {
    for (const ing of r.ingredients as unknown[]) {
      const name = resolveItemName(ing, itemsById);
      if (!name) continue;
      requiredCounts[name] = (requiredCounts[name] || 0) + 1;
    }
  }

  for (const [name, count] of Object.entries(requiredCounts)) {
    const have = inventory.reduce((acc, it) => acc + ((it.name === name) ? it.count : 0), 0);
    if (have < count) {
      const deficit = count - have;
      missingTotal += deficit;
      missing.push({ name, count: deficit });
    }
  }

  return { canCraft: missingTotal === 0, missingTotal, missing };
}

type CandidateRecipe = {
  recipe: unknown;
  resultName: string;
  resultCount: number;
  exactMatch: boolean;
  craftingTable?: unknown;
};

function collectCandidateRecipes(
  recipes: unknown[],
  query: string,
  itemsById: McDataItemsById,
  craftingTable?: unknown
): CandidateRecipe[] {
  const exact: CandidateRecipe[] = [];
  const partial: CandidateRecipe[] = [];

  for (const recipe of recipes) {
    const result = getRecipeResult(recipe, itemsById);
    if (!result) continue;

    const match = classifyNameMatch(result.name, query);
    if (!match.partial) continue;

    const candidate: CandidateRecipe = {
      recipe,
      resultName: result.name,
      resultCount: result.count,
      exactMatch: match.exact,
      craftingTable
    };

    if (match.exact) exact.push(candidate);
    else partial.push(candidate);
  }

  return exact.length > 0 ? exact : partial;
}

function getCandidateRecipeKey(candidate: CandidateRecipe, itemsById: McDataItemsById): string {
  const ingredientKey = parseRecipeIngredientOptions(candidate.recipe, itemsById)
    .map(({ options, count }) => `${[...options].sort().join('|')} x${count}`)
    .sort()
    .join('; ');

  return `${normalizeItemName(candidate.resultName)}#${candidate.resultCount}#${ingredientKey}`;
}

function mergeCandidateRecipes(candidates: CandidateRecipe[], itemsById: McDataItemsById): CandidateRecipe[] {
  const seen = new Set<string>();
  const merged: CandidateRecipe[] = [];

  for (const candidate of candidates) {
    const key = getCandidateRecipeKey(candidate, itemsById);
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(candidate);
  }

  return merged;
}

function collectAllCandidateRecipes(
  bot: mineflayer.Bot,
  mcData: unknown,
  query: string,
  itemsById: McDataItemsById,
  recipes: unknown[]
): CandidateRecipe[] {
  const table = findNearbyCraftingTable(bot, mcData);
  const candidatesFromBotNoTable = collectCandidateRecipesFromBot(bot, mcData, query, itemsById, null);
  const candidatesFromBotWithTable = table ? collectCandidateRecipesFromBot(bot, mcData, query, itemsById, table) : [];
  const candidatesFromData = collectCandidateRecipes(recipes, query, itemsById, table ?? undefined);

  return mergeCandidateRecipes(
    [...candidatesFromBotNoTable, ...candidatesFromBotWithTable, ...candidatesFromData],
    itemsById
  );
}

function resolveItemName(value: unknown, itemsById: McDataItemsById): string | null {
  if (!value) return null;

  if (typeof value === 'string') return value;

  if (typeof value === 'number') {
    if (value === 0) return null;
    const item = itemsById[String(value)];
    return typeof item?.name === 'string' ? item.name : null;
  }

  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;

    if (typeof v.name === 'string') return v.name;
    if (typeof v.id === 'number') {
      if (v.id === 0) return null;
      const item = itemsById[String(v.id)];
      return typeof item?.name === 'string' ? item.name : null;
    }
  }

  return null;
}

function getExplicitIngredientNames(recipe: unknown, itemsById: McDataItemsById): string[] {
  const names: string[] = [];
  if (!recipe) return names;

  const r = recipe as Record<string, unknown>;
  const pushName = (value: unknown) => {
    if (!value || Array.isArray(value)) return;
    const name = resolveItemName(value, itemsById);
    if (name) names.push(name);
  };

  if (Array.isArray(r.inShape)) {
    for (const row of r.inShape as unknown[]) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) pushName(cell);
    }
  } else if (Array.isArray(r.ingredients)) {
    for (const ing of r.ingredients as unknown[]) {
      pushName(ing);
    }
  }

  return names;
}

function recipeUsesPreferredItems(recipe: unknown, preferredItems: Set<string>, itemsById: McDataItemsById): boolean {
  if (!recipe || preferredItems.size === 0) return false;
  const names = getExplicitIngredientNames(recipe, itemsById);
  for (const name of names) {
    if (preferredItems.has(normalizeItemName(name))) return true;
  }
  return false;
}

function prioritizeCandidatesByPreferredItems(
  candidates: CandidateRecipe[],
  preferredItems: Set<string>,
  itemsById: McDataItemsById
): CandidateRecipe[] {
  if (preferredItems.size === 0) return candidates;

  const preferred: CandidateRecipe[] = [];
  const others: CandidateRecipe[] = [];

  for (const candidate of candidates) {
    if (recipeUsesPreferredItems(candidate.recipe, preferredItems, itemsById)) {
      preferred.push(candidate);
    } else {
      others.push(candidate);
    }
  }

  return [...preferred, ...others];
}

function parseRecipeIngredients(recipe: unknown, itemsById: McDataItemsById): RecipeIngredient[] {
  const ingredients: RecipeIngredient[] = [];

  if (!recipe) return ingredients;

  const r = recipe as Record<string, unknown>;

  if (Array.isArray(r.inShape)) {
    const countMap: Record<string, number> = {};
    for (const row of r.inShape as unknown[]) {
      if (Array.isArray(row)) {
        for (const item of row) {
          const options = resolveItemNames(item, itemsById);
          if (options.length === 0) continue;
          const label = formatOptionsLabel(options);
          countMap[label] = (countMap[label] || 0) + 1;
        }
      }
    }
    for (const [name, count] of Object.entries(countMap)) {
      ingredients.push({ name, count });
    }

    if (ingredients.length > 0) return ingredients;
  }

  if (Array.isArray(r.ingredients)) {
    const countMap: Record<string, number> = {};
    for (const ingredient of r.ingredients as unknown[]) {
      const options = resolveItemNames(ingredient, itemsById);
      if (options.length === 0) continue;
      const label = formatOptionsLabel(options);
      countMap[label] = (countMap[label] || 0) + 1;
    }
    for (const [name, count] of Object.entries(countMap)) {
      ingredients.push({ name, count });
    }
  }

  return ingredients;
}

function getRecipeResult(recipe: unknown, itemsById: McDataItemsById): { name: string; count: number } | null {
  if (!recipe) return null;

  const r = recipe as Record<string, unknown>;
  const result = r.result;

  if (!result) return null;

  if (typeof result === 'string') {
    return { name: result, count: 1 };
  }

  if (typeof result === 'number') {
    const name = resolveItemName(result, itemsById);
    return name ? { name, count: 1 } : null;
  }

  if (result && typeof result === 'object') {
    const resultObj = result as Record<string, unknown>;
    const name = resolveItemName(resultObj, itemsById);
    const count = typeof resultObj.count === 'number' && Number.isFinite(resultObj.count) ? resultObj.count : 1;
    return name ? { name, count } : null;
  }

  return null;
}

function canCraftRecipe(recipe: unknown, inventory: InventoryItem[], itemsById: McDataItemsById): boolean {
  return evaluateRecipeMissing(recipe, inventory, itemsById).canCraft;
}

function isValidCraftingRecipe(recipe: unknown): boolean {
  if (!recipe || typeof recipe !== 'object') {
    log('debug', `Recipe validation failed: recipe is ${typeof recipe}`);
    return false;
  }

  const r = recipe as Record<string, unknown>;

  // mineflayer は either inShape または ingredients を要求
  if (!Array.isArray(r.inShape) && !Array.isArray(r.ingredients)) {
    log('debug', `Recipe validation failed: no inShape or ingredients. Keys: ${Object.keys(r).join(', ')}`);
    return false;
  }

  // result フィールドが存在し、適切な構造を持つことを確認
  const result = r.result;
  if (!result) {
    log('debug', `Recipe validation failed: no result field`);
    return false;
  }

  // result が object の場合、id または name フィールドを持つことを確認
  if (typeof result === 'object') {
    const resultObj = result as Record<string, unknown>;
    if (typeof resultObj.id !== 'number' && typeof resultObj.name !== 'string') {
      log('debug', `Recipe validation failed: result has no valid id or name. Result keys: ${Object.keys(resultObj).join(', ')}`);
      return false;
    }
  }

  return true;
}

function collectCandidateRecipesFromBot(
  bot: mineflayer.Bot,
  mcData: unknown,
  query: string,
  itemsById: McDataItemsById,
  craftingTable: unknown | null
): CandidateRecipe[] {
  const data = mcData as Record<string, unknown>;
  const itemsByName = data.itemsByName as Record<string, { id?: unknown }> | undefined;
  if (!itemsByName) return [];

  const q = normalizeItemName(query);
  const exact: CandidateRecipe[] = [];
  const partial: CandidateRecipe[] = [];

  const pushRecipesFor = (name: string, id: number, exactMatch: boolean) => {
    const recipesFor = (bot as unknown as { recipesFor?: (...args: unknown[]) => unknown[] }).recipesFor;
    if (typeof recipesFor !== 'function') return;
    const recipes = recipesFor(id, null, 1, craftingTable) as unknown[];
    for (const recipe of recipes) {
      // bot.recipesFor から取得したレシピはバリデーション
      if (!isValidCraftingRecipe(recipe)) {
        log('warn', `Skipped invalid recipe for item ${name}`);
        continue;
      }

      const result = getRecipeResult(recipe, itemsById);
      const resultName = result?.name ?? name;
      const resultCount = result?.count ?? 1;
      const candidate: CandidateRecipe = { recipe, resultName, resultCount, exactMatch, craftingTable: craftingTable ?? undefined };
      if (exactMatch) exact.push(candidate);
      else partial.push(candidate);
    }
  };

  const exactEntry = itemsByName[q];
  if (exactEntry && typeof exactEntry.id === 'number') {
    pushRecipesFor(q, exactEntry.id, true);
    return exact;
  }

  for (const [name, meta] of Object.entries(itemsByName)) {
    const match = classifyNameMatch(name, q);
    if (!match.partial) continue;
    if (typeof meta?.id === 'number') pushRecipesFor(name, meta.id, false);
  }

  return partial;
}

function findNearbyCraftingTable(bot: mineflayer.Bot, mcData: unknown): unknown | null {
  const data = mcData as Record<string, unknown>;
  const blocksByName = data.blocksByName as Record<string, { id?: unknown }> | undefined;
  const craftingTableId = blocksByName?.crafting_table?.id;
  if (typeof craftingTableId !== 'number') return null;

  const findBlock = (bot as unknown as { findBlock?: (opts: unknown) => unknown }).findBlock;
  if (typeof findBlock !== 'function') return null;

  try {
    return findBlock({ matching: craftingTableId, maxDistance: 16, count: 1 });
  } catch {
    return null;
  }
}

function getAllRecipes(mcData: unknown): unknown[] {
  const data = mcData as Record<string, unknown>;
  const recipes = data.recipes;

  if (Array.isArray(recipes)) {
    return recipes;
  }

  if (typeof recipes === 'object' && recipes !== null) {
    const recipeObj = recipes as Record<string, unknown>;
    const allRecipes: unknown[] = [];
    for (const recipeList of Object.values(recipeObj)) {
      if (Array.isArray(recipeList)) {
        allRecipes.push(...recipeList);
      }
    }
    return allRecipes;
  }

  return [];
}

// getAllRecipes はバージョン差やデータ構造の違いを吸収して、
// レシピ配列を一貫した形式で返すヘルパーです。
// - 一部の Minecraft 版では recipes がオブジェクトマップになっているため、
//   そこから全レシピをフラット化して取り出します。

export function registerCraftingTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool(
    "list-recipes",
    "List all available crafting recipes the bot can make with current inventory",
    {
      outputItem: z.string().trim().min(1).optional().describe("Optional: filter recipes by output item name")
    },
    async ({ outputItem }) => {
      const bot = getBot();
      const mcData = minecraftData(bot.version);
      const itemsById = (mcData as unknown as { items: McDataItemsById }).items;
      const recipes = getAllRecipes(mcData);
      const inventory = bot.inventory.items().map(item => ({ name: item.name, count: item.count }));

      if (!recipes || recipes.length === 0) {
        return factory.createResponse("No recipes available for this Minecraft version");
      }

      const availableRecipes: Array<{ name: string; count: number; ingredients: RecipeIngredient[]; exactMatch?: boolean }> = [];

      for (const recipe of recipes) {
        const result = getRecipeResult(recipe, itemsById);
        if (!result) continue;

        const match = outputItem ? classifyNameMatch(result.name, outputItem) : { exact: false, partial: true };
        if (outputItem && !match.partial) continue;

        if (canCraftRecipe(recipe, inventory, itemsById)) {
          const ingredients = parseRecipeIngredients(recipe, itemsById);
          availableRecipes.push({
            name: result.name,
            count: result.count,
            ingredients,
            exactMatch: outputItem ? match.exact : undefined
          });
        }
      }

      if (outputItem) {
        const hasExact = availableRecipes.some(r => r.exactMatch);
        if (hasExact) {
          for (let i = availableRecipes.length - 1; i >= 0; i--) {
            if (!availableRecipes[i].exactMatch) availableRecipes.splice(i, 1);
          }
        }
      }

      if (availableRecipes.length === 0) {
        return factory.createResponse(`No craftable recipes found${outputItem ? ` for ${outputItem}` : ''} with current inventory`);
      }

      let output = `Found ${availableRecipes.length} craftable recipe(s):\n\n`;
      availableRecipes.forEach((recipe, index) => {
        output += `${index + 1}. ${recipe.name} (x${recipe.count})\n`;
        output += `   Ingredients: ${recipe.ingredients.map(i => `${i.name} x${i.count}`).join(", ")}\n\n`;
      });

      return factory.createResponse(output);
    }
  );

  factory.registerTool(
    "craft-item",
    "Craft an item using a crafting recipe",
    {
      outputItem: z.string().trim().min(1).describe("Name of the item to craft"),
      amount: z.number().int().min(1).optional().describe("Number of times to craft (default: 1)"),
      preferredItems: z.array(z.string().trim().min(1)).optional().describe("Optional: prefer recipes that include these items")
    },
    async ({ outputItem, amount = 1, preferredItems = [] }) => {
      // ユーザー入力の正規化: 大文字/空白を潰して検索用クエリを作る
      const outputQuery = normalizeItemName(outputItem);
      const preferredSet = new Set<string>(
        (preferredItems as string[]).map((item: string) => normalizeItemName(item)).filter((i: string) => i.length > 0)
      );

      // ボット参照を取得: 現在接続中の bot オブジェクトを使う
      const bot = getBot();
      // Minecraft データ（バージョン依存情報）を取得
      const mcData = minecraftData(bot.version);
      // ID から名前を引くためのマップを用意
      const itemsById = (mcData as unknown as { items: McDataItemsById }).items;
      // 利用可能な全レシピを一括で取得（データ構造差異を吸収するラッパー）
      const recipes = getAllRecipes(mcData);
      // レシピがない（バージョン差など）場合は即時エラーを返す
      if (!recipes || recipes.length === 0) {
        return factory.createErrorResponse("No recipes available");
      }

      // 成功数と最初のエラーメッセージを追跡する
      let craftedCount = 0;
      let firstErrorMessage = "";

      const candidates = collectAllCandidateRecipes(bot, mcData, outputQuery, itemsById, recipes);
      const orderedCandidates = prioritizeCandidatesByPreferredItems(candidates, preferredSet, itemsById);

      // 指定回数だけクラフトを試みるループ
      for (let attempt = 0; attempt < amount; attempt++) {
        let craftedThisAttempt = false;
        for (const candidate of orderedCandidates) {
          try {
            // 作業台が必要なレシピかどうかで呼び出しシグネチャを変える
            if (candidate.craftingTable) {
              // 作業台を指定してクラフト
              await bot.craft(candidate.recipe as Parameters<typeof bot.craft>[0], 1, candidate.craftingTable as Parameters<typeof bot.craft>[2]);
            } else {
              // シンプルなハンドクラフト
              await bot.craft(candidate.recipe as Parameters<typeof bot.craft>[0], 1);
            }
            // クラフト成功: カウンタ更新とログ、ループ脱出
            craftedCount++;
            craftedThisAttempt = true;
            log('info', `Crafted ${candidate.resultName}`);
            break;
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            if (!firstErrorMessage) firstErrorMessage = error.message;
            console.error(
              `[craft-item] bot.craft failed for ${outputItem} using ${candidate.resultName}`,
              error.stack ?? error.message
            );
            log('warn', `Failed to craft ${outputItem}: ${error.message}`);
          }
        }

        // 最初の試行で一つも作れなかった場合は、より詳細な理由（最小の不足リスト等）を返す
        if (!craftedThisAttempt && attempt === 0) {
          return factory.createErrorResponse(
            `Failed to craft ${outputItem}: ${firstErrorMessage || 'Recipe not found or missing ingredients'}`
          );
        }

        // この試行で作れなかったが retry 回数が残っている場合はループ継続、なければ抜ける
        if (!craftedThisAttempt) {
          break;
        }
      }

      // 全ての試行が終わっても一つも作れなかった場合は失敗を返す
      if (craftedCount === 0) {
        return factory.createErrorResponse(
          `Failed to craft ${outputItem}: ${firstErrorMessage || "Missing ingredients or recipe not found"}`
        );
      }

      // 成功数を報告して終わり
      return factory.createResponse(`Successfully crafted ${outputItem} ${craftedCount} time(s)`);
    }
  );

  factory.registerTool(
    "get-recipe",
    "Get detailed information about a specific recipe",
    {
      itemName: z.string().trim().min(1).describe("Name of the item to get recipe for")
    },
    async ({ itemName }) => {
      const bot = getBot();
      const mcData = minecraftData(bot.version);
      const itemsById = (mcData as unknown as { items: McDataItemsById }).items;
      const recipes = getAllRecipes(mcData);
      const inventory = bot.inventory.items().map(item => ({ name: item.name, count: item.count }));

      if (!recipes || recipes.length === 0) {
        return factory.createErrorResponse("No recipes available");
      }

      const candidates = collectAllCandidateRecipes(bot, mcData, itemName, itemsById, recipes);
      const matchingRecipes = candidates
        .map((c) => {
          const ingredients = parseRecipeIngredients(c.recipe, itemsById);
          const evaluation = evaluateRecipeMissing(c.recipe, inventory, itemsById);
          return {
            result: c.resultName,
            resultCount: c.resultCount,
            ingredients,
            canCraft: evaluation.canCraft,
            missingTotal: evaluation.missingTotal
          };
        })
        .sort((a, b) => {
          if (a.canCraft !== b.canCraft) return a.canCraft ? -1 : 1;
          return a.missingTotal - b.missingTotal;
        });

      if (matchingRecipes.length === 0) {
        return factory.createResponse(`No recipes found for ${itemName}`);
      }

      let output = `Recipe(s) for ${itemName}:\n\n`;

      matchingRecipes.forEach((recipe, index) => {
        output += `${index + 1}. Output: ${recipe.result} (x${recipe.resultCount})`;
        output += recipe.canCraft ? ' [craftable]\n' : ` [missing: ${recipe.missingTotal}]\n`;
        output += `   Ingredients:\n`;

        for (const ingredient of recipe.ingredients) {
          output += `   - ${ingredient.name} x${ingredient.count}\n`;
        }
        output += '\n';
      });

      return factory.createResponse(output);
    }
  );

  factory.registerTool(
    "can-craft",
    "Check if the bot can craft a specific item with current inventory",
    {
      itemName: z.string().trim().min(1).describe("Name of the item to check")
    },
    async ({ itemName }) => {
      const bot = getBot();
      const mcData = minecraftData(bot.version);
      const itemsById = (mcData as unknown as { items: McDataItemsById }).items;
      const recipes = getAllRecipes(mcData);
      const inventory = bot.inventory.items().map(item => ({ name: item.name, count: item.count }));

      if (!recipes || recipes.length === 0) {
        return factory.createErrorResponse("No recipes available");
      }

      const candidates = collectAllCandidateRecipes(bot, mcData, itemName, itemsById, recipes);
      if (candidates.length === 0) return factory.createResponse(`No recipe found for ${itemName}`);

      let bestCannotCraft: { missingTotal: number; message: string } | null = null;

      for (const candidate of candidates) {
        const evaluation = evaluateRecipeMissing(candidate.recipe, inventory, itemsById);

        if (evaluation.canCraft) {
          return factory.createResponse(`Yes, can craft ${candidate.resultName}. Have all required ingredients.`);
        }

        let output = `Cannot craft ${candidate.resultName}. Missing:\n`;
        for (const { name, count } of evaluation.missing) {
          output += `- ${name} x${count}\n`;
        }

        if (!bestCannotCraft || evaluation.missingTotal < bestCannotCraft.missingTotal) {
          bestCannotCraft = { missingTotal: evaluation.missingTotal, message: output };
        }
      }

      return factory.createResponse(bestCannotCraft?.message ?? `No recipe found for ${itemName}`);
    }
  );
}
