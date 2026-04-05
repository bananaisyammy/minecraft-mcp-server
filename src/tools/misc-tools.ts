import { z } from "zod";
import mineflayer from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';

// 小さなユーティリティ系ツールをまとめるモジュール
export function registerMiscTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  // wait: 秒指定（1秒 = 20 tick）または ticks 指定で待機するツール
  factory.registerTool(
    "wait",
    "Wait for N seconds (1s = 20 ticks). You can also specify ticks directly.",
    {
      seconds: z.coerce.number().int().min(0).optional().describe("Seconds to wait (default: 1)"),
      ticks: z.coerce.number().int().min(0).optional().describe("Ticks to wait (overrides seconds). 1 tick = 50ms")
    },
    async ({ seconds = 1, ticks }: { seconds?: number; ticks?: number }) => {
      const tickCount = (typeof ticks === 'number') ? Math.max(0, Math.floor(ticks)) : Math.max(0, Math.floor((seconds ?? 1) * 20));
      const ms = tickCount * 50; // 1 tick = 50ms
      await new Promise((resolve) => setTimeout(resolve, ms));
      return factory.createResponse(`Waited ${tickCount} ticks (${(ms / 1000).toFixed(2)}s)`);
    }
  );

  // wait-ticks: ticks 指定のみの簡易ツール
  factory.registerTool(
    "wait-ticks",
    "Wait for N ticks (1 tick = 50ms)",
    {
      ticks: z.coerce.number().int().min(0).describe("Number of ticks to wait (1 tick = 50ms)")
    },
    async ({ ticks }: { ticks: number }) => {
      const ms = Math.max(0, Math.floor(ticks)) * 50;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return factory.createResponse(`Waited ${ticks} ticks (${(ms / 1000).toFixed(2)}s)`);
    }
  );
}
