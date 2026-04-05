#!/usr/bin/env node

// メインエントリポイント: MCP（Model Context Protocol）サーバーを起動して
// Mineflayer ボットに接続し、ツール群を登録するスクリプトです。
// 初心者向けコメントを多めに追加しています。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setupStdioFiltering } from './stdio-filter.js';
import { log } from './logger.js';
import { parseConfig } from './config.js';
import { BotConnection } from './bot-connection.js';
import { ToolFactory } from './tool-factory.js';
import { MessageStore } from './message-store.js';
import { registerPositionTools } from './tools/position-tools.js';
import { registerInventoryTools } from './tools/inventory-tools.js';
import { registerConsumableTools } from './tools/consumable-tools.js';
import { registerBlockTools } from './tools/block-tools.js';
import { registerEntityTools } from './tools/entity-tools.js';
import { registerChatTools } from './tools/chat-tools.js';
import { registerFlightTools } from './tools/flight-tools.js';
import { registerMiscTools } from './tools/misc-tools.js';
import { registerGameStateTools } from './tools/gamestate-tools.js';
import { registerCraftingTools } from './tools/crafting-tools.js';
import { registerFurnaceTools } from './tools/furnace-tools.js';

// 標準出力のフィルタを設定します。MCP は標準入出力で JSON をやり取りするため、
// 不要なログが混ざるとプロトコルが壊れてしまいます。
setupStdioFiltering();

// Node.js 全体の未処理例外をキャッチしてログに出すようにします。
// 小さなサービスではこれがあると原因特定が楽になります。
process.on('unhandledRejection', (reason) => {
  log('error', `Unhandled rejection: ${reason}`);
});

process.on('uncaughtException', (error) => {
  log('error', `Uncaught exception: ${error}`);
});

// アプリケーション本体。非同期で動くので async/await を使います。
async function main() {
  // コマンドライン引数やデフォルト値をパースして接続設定を作る
  const config = parseConfig();

  // チャットメッセージなどを一時的に保持するための簡易ストア
  const messageStore = new MessageStore();

  // BotConnection は実際に Minecraft サーバーへ接続するためのラッパーです。
  // onLog と onChatMessage はイベントを受け取るコールバックです。
  const connection = new BotConnection(
    config,
    {
      onLog: log,
      onChatMessage: (username, message) => messageStore.addMessage(username, message)
    }
  );

  // 実際に Mineflayer ボットを作成して接続を開始します。
  connection.connect();

  // MCP サーバー（外部の LLM 等とやり取りするためのプロトコル）を作成
  const server = new McpServer({
    name: "minecraft-mcp-server",
    version: "2.0.4"
  });

  // ToolFactory は各種ツール（移動、採掘、チャット等）を MCP サーバーに登録するためのヘルパーです。
  const factory = new ToolFactory(server, connection);
  const getBot = () => connection.getBot()!; // 非 null アサーション: ボットは接続後に存在します。

  // 全ツール呼び出し前に Minecraft の /tick unfreeze を実行するハンドラ
  factory.onToolInvoke(async (name, args) => {
    log('info', `[onToolInvoke] Tool '${name}' invoked with args: ${JSON.stringify(args)}`);
    const bot = connection.getBot();
    if (!bot) {
      log('warn', `[onToolInvoke] Bot not connected; cannot execute /tick unfreeze for tool '${name}'`);
    } else {
      const success = connection.executeCommand('/tick unfreeze');
      log('info', `[onToolInvoke] /tick unfreeze execution: ${success ? 'sent' : 'failed'}`);
    }
  });

  // 全ツール完了後に Minecraft の /tick freeze を実行するハンドラ
  factory.onToolReturn(async (name, args, result, error) => {
    const resultSummary = error
      ? `error: ${error.message}`
      : result?.isError
        ? `MCP error: ${result.content[0]?.text ?? 'unknown'}`
        : 'success';
    log('info', `[おんつーるりたーん] Tool '${name}' returned with ${resultSummary}`);
    const bot = connection.getBot();
    if (!bot) {
      log('warn', `[おんつーるりたーん] Bot not connected; cannot execute /tick freeze for tool '${name}'`);
    } else {
      const success = connection.executeCommand('/tick freeze');
      log('info', `[おんつーるりたーん] /tick freeze execution: ${success ? 'sent' : 'failed'}`);
    }
  });

  // ここで各種ツール群を登録します。ツールは外部から呼び出せる小さな関数の集合です。
  registerPositionTools(factory, getBot);
  registerInventoryTools(factory, getBot);
  registerConsumableTools(factory, getBot);
  registerBlockTools(factory, getBot);
  registerEntityTools(factory, getBot);
  registerChatTools(factory, getBot, messageStore);
  registerFlightTools(factory, getBot);
  registerMiscTools(factory, getBot);
  registerGameStateTools(factory, getBot);
  registerCraftingTools(factory, getBot);
  registerFurnaceTools(factory, getBot);

  // MCP クライアントが切断したときの後処理。ボット接続をクリーンアップして終了します。
  process.stdin.on('end', () => {
    connection.cleanup();
    log('info', 'MCP Client has disconnected. Shutting down...');
    process.exit(0);
  });

  // MCP トランスポート（stdio）をサーバーに接続して開始します。
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// メインを実行し、エラーがあればログ出力して終了コードを返す
main().catch((error) => {
  log('error', `Fatal error in main(): ${error}`);
  process.exit(1);
});
