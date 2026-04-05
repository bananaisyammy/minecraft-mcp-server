// ゲーム状態に関する簡易ツール群
// - 現在のゲームモード（サバイバル/クリエイティブ等）を検出するユーティリティを提供します。
import mineflayer from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';

export function registerGameStateTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool(
    "detect-gamemode",
    "Detect the gamemode on game",
    {},
    async () => {
      const bot = getBot();
      return factory.createResponse(`Bot gamemode: "${bot.game.gameMode}"`);
    }
  );
}
