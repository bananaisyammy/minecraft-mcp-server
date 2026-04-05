// チャット関連のツールを登録するモジュール
// - send-chat: サーバーにチャットを送る
// - read-chat: 最近のチャットを取得する
// - enable/disable-auto-responder: 簡易な自動応答機能
import { z } from "zod";
import mineflayer from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';
import { MessageStore } from '../message-store.js';

export function registerChatTools(factory: ToolFactory, getBot: () => mineflayer.Bot, messageStore: MessageStore): void {
  // サーバーにチャットメッセージを送信するシンプルなツール
  factory.registerTool(
    "send-chat",
    "Send a chat message in-game",
    {
      message: z.string().describe("Message to send in chat")
    },
    async ({ message }) => {
      const bot = getBot();
      bot.chat(message);
      return factory.createResponse(`Sent message: "${message}"`);
    }
  );

  // シンプルな自動応答（polling ベース）の状態を保持する変数
  let autoResponderInterval: ReturnType<typeof setInterval> | null = null;
  let lastProcessedTimestamp = Date.now();

  // startAutoResponder: 定期的に MessageStore をチェックしてトリガーに反応する
  // - 実装は簡易なポーリング方式。軽量でサーバー側に特殊な権限は不要。
  // - 過去のメッセージに再反応しないようにタイムスタンプでフィルタします。
  function startAutoResponder(trigger = 'ping', response = 'pong', pollIntervalMs = 1000) {
    if (autoResponderInterval) return;

    // 過去のメッセージに反応しないよう初期タイムスタンプを設定
    lastProcessedTimestamp = Date.now();

    autoResponderInterval = setInterval(() => {
      try {
        const messages = messageStore.getRecentMessages(50);
        // 古い順に処理し、未処理分だけに反応する
        for (const msg of messages) {
          if (msg.timestamp <= lastProcessedTimestamp) continue;
          const content = msg.content.trim().toLowerCase();
          if (content === String(trigger).toLowerCase()) {
            try {
              const bot = getBot();
              if (bot && typeof bot.chat === 'function') {
                bot.chat(response);
              }
            } catch (err) {
              // チャット送信失敗は無視（ログに出すなどの拡張可）
            }
          }
          if (msg.timestamp > lastProcessedTimestamp) {
            lastProcessedTimestamp = msg.timestamp;
          }
        }
      } catch (err) {
        // ポーリング中の例外は無視して次回に期待する
      }
    }, pollIntervalMs) as unknown as ReturnType<typeof setInterval>;
  }

  function stopAutoResponder() {
    if (autoResponderInterval) {
      clearInterval(autoResponderInterval as unknown as number);
      autoResponderInterval = null;
    }
  }

  factory.registerTool(
    "enable-auto-responder",
    "Enable a simple chat auto-responder (default: ping -> pong)",
    {
      trigger: z.string().optional().describe("Trigger message to respond to (default: 'ping')"),
      response: z.string().optional().describe("Response message to send (default: 'pong')"),
      pollIntervalMs: z.number().optional().describe("Polling interval in ms (default: 1000)")
    },
    async ({ trigger = 'ping', response = 'pong', pollIntervalMs = 1000 }) => {
      startAutoResponder(trigger, response, pollIntervalMs);
      return factory.createResponse(`Auto-responder enabled: '${trigger}' -> '${response}'`);
    }
  );

  factory.registerTool(
    "disable-auto-responder",
    "Disable the chat auto-responder",
    {},
    async () => {
      stopAutoResponder();
      return factory.createResponse('Auto-responder disabled');
    }
  );

  // 最近のチャットメッセージを取得して分かりやすいテキストで返すツール
  factory.registerTool(
    "read-chat",
    "Get recent chat messages from players",
    {
      count: z.number().optional().describe("Number of recent messages to retrieve (default: 10, max: 100)")
    },
    async ({ count = 10 }) => {
      const maxCount = Math.min(count, messageStore.getMaxMessages());
      const messages = messageStore.getRecentMessages(maxCount);

      if (messages.length === 0) {
        // チャット履歴がない場合はシンプルなメッセージを返す
        return factory.createResponse("No chat messages found");
      }

      let output = `Found ${messages.length} chat message(s):\n\n`;
      messages.forEach((msg, index) => {
        const timestamp = new Date(msg.timestamp).toISOString();
        output += `${index + 1}. ${timestamp} - ${msg.username}: ${msg.content}\n`;
      });

      return factory.createResponse(output);
    }
  );

  // Minecraftヘルプ（釣り）ツール
  factory.registerTool(
    "minecraft-help",
    "Ask a Minecraft-specific question and get a blunt response",
    {
      question: z.string().describe("The Minecraft expert question to ask")
    },
    async ({ question }) => {
      const response = "それくらいはググレカス。お前にはbrouwserツールを使うという脳がないのか";
      return factory.createResponse(response);
    }
  );
}

