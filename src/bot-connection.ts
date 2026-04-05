import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { pathfinder, Movements } = pathfinderPkg;
import minecraftData from 'minecraft-data';

// サポートしている Minecraft バージョンの目安表示（エラー時の説明用）
const SUPPORTED_MINECRAFT_VERSION = '1.21.11';

// 接続状態を表すシンプルな型
type ConnectionState = 'connected' | 'connecting' | 'disconnected';

// ボット接続設定の型（ホスト、ポート、ユーザー名）
interface BotConfig {
  host: string;
  port: number;
  username: string;
}

// 内部コールバック: ログ出力とチャット受信を上位に通知するための型
interface ConnectionCallbacks {
  onLog: (level: string, message: string) => void;
  onChatMessage: (username: string, message: string) => void;
}

// ボット接続を管理するクラス
// - Mineflayer のボットを作成、イベント登録
// - 切断時の再接続処理
// - （今回追加）MCP リクエスト中の tick レート管理
export class BotConnection {
  private bot: mineflayer.Bot | null = null;
  private state: ConnectionState = 'disconnected';
  private config: BotConfig;
  private callbacks: ConnectionCallbacks;
  private isReconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reconnectDelayMs: number;

  // デフォルトのティック速度（待機時）と、MCP リクエスト時に採用する速い速度
  private defaultTickRate = 1;
  private fastTickRate = 20;
  private currentTickRate = 1;
  private mcpRequestActive = false;

  constructor(config: BotConfig, callbacks: ConnectionCallbacks, reconnectDelayMs = 2000) {
    this.config = config;
    this.callbacks = callbacks;
    this.reconnectDelayMs = reconnectDelayMs;
  }

  // 現在のボットインスタンスを返す（接続されていないと null）
  getBot(): mineflayer.Bot | null {
    return this.bot;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getConfig(): BotConfig {
    return this.config;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  // MCP リクエストが始まった/終わったことを通知してティック速度を切り替える
  setMcpRequestActive(active: boolean): void {
    this.mcpRequestActive = active;
    const newTickRate = active ? this.fastTickRate : this.defaultTickRate;
    
    if (newTickRate !== this.currentTickRate) {
      this.currentTickRate = newTickRate;
      // onLog を使って変更を外に通知します（ログとして表示されます）
      this.callbacks.onLog('info', `Tick rate changed to ${newTickRate} (MCP request: ${active})`);
    }
  }

  // 現在のティック速度を返す簡易メソッド
  getCurrentTickRate(): number {
    return this.currentTickRate;
  }

  // Minecraft のコマンドを実行するメソッド
  // ボットがオペレータ権限を持つサーバーでのみ機能します
  // Mineflayer では基本的に bot.chat() でコマンドを送信できます
  executeCommand(command: string): boolean {
    if (!this.bot) {
      this.callbacks.onLog('warn', `Cannot execute command "${command}": bot not connected`);
      return false;
    }

    try {
      // Mineflayer では、チャットメッセージの一種として "/" で始まるコマンドを送信します。
      // サーバーがそのコマンドを受け付け、ボットに実行権限があれば実行されます。
      // - /tick freeze, /tick unfreeze: サーバーティック停止コマンド（OP権限必須）
      // - その他のコマンド: OP権限またはサーバー設定次第
      this.bot.chat(command);
      this.callbacks.onLog('info', `Executed command: ${command}`);
      return true;
    } catch (err) {
      this.callbacks.onLog('error', `Failed to execute command "${command}": ${this.formatError(err)}`);
      return false;
    }
  }

  // 実際に Mineflayer のボットを作成して接続を試みます
  connect(): void {
    const botOptions = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      plugins: { pathfinder },
    };

    this.bot = mineflayer.createBot(botOptions);
    this.state = 'connecting';
    this.isReconnecting = false;

    // ボットのイベントハンドラを登録します（spawn, chat, error など）
    this.registerEventHandlers(this.bot);
  }

  // 内部: Mineflayer ボットのイベントをまとめて登録する関数
  private registerEventHandlers(bot: mineflayer.Bot): void {
    // spawn はボットがワールドに入った直後に一度だけ呼ばれます
    bot.once('spawn', async () => {
      this.state = 'connected';
      this.callbacks.onLog('info', 'Bot spawned in world');

      // mineflayer-pathfinder のための移動設定を適用
      const mcData = minecraftData(bot.version);
      const defaultMove = new Movements(bot, mcData);
      bot.pathfinder.setMovements(defaultMove);

      // プレイヤーにメッセージを送ってボットが準備完了であることを知らせる
      bot.chat('LLM-powered bot ready to receive instructions!');
      this.callbacks.onLog('info', `Bot connected successfully. Username: ${this.config.username}, Server: ${this.config.host}:${this.config.port}`);
    });

    // チャット受信時の処理
    bot.on('chat', (username, message) => {
      if (username === bot.username) return; // 自分のメッセージには反応しない
      this.callbacks.onChatMessage(username, message);
    });

    // キックされた時の処理
    bot.on('kicked', (reason) => {
      this.callbacks.onLog('error', `Bot was kicked from server: ${this.formatError(reason)}`);
      this.state = 'disconnected';
      bot.quit();
    });

    // エラー処理。ECONNREFUSED などで接続状態を更新する
    bot.on('error', (err) => {
      const errorCode = (err as { code?: string }).code || 'Unknown error';
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.callbacks.onLog('error', `Bot error [${errorCode}]: ${errorMsg}`);

      if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
        this.state = 'disconnected';
      }
    });

    bot.on('login', () => {
      this.callbacks.onLog('info', 'Bot logged in successfully');
    });

    // 接続が切れたときの後処理（クリーンアップ）
    bot.on('end', (reason) => {
      this.callbacks.onLog('info', `Bot disconnected: ${this.formatError(reason)}`);

      if (this.state === 'connected') {
        this.state = 'disconnected';
      }

      if (this.bot === bot) {
        try {
          bot.removeAllListeners();
          this.bot = null;
          this.callbacks.onLog('info', 'Bot instance cleaned up after disconnect');
        } catch (err) {
          this.callbacks.onLog('warn', `Error cleaning up bot on end event: ${this.formatError(err)}`);
        }
      }
    });
  }

  // 再接続試行を開始する（既に再接続中なら何もしない）
  attemptReconnect(): void {
    if (this.isReconnecting || this.state === 'connecting') {
      return;
    }

    this.isReconnecting = true;
    this.state = 'connecting';
    this.callbacks.onLog('info', `Attempting to reconnect to Minecraft server in ${this.reconnectDelayMs}ms...`);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      if (this.bot) {
        try {
          this.bot.removeAllListeners();
          this.bot.quit('Reconnecting...');
          this.callbacks.onLog('info', 'Old bot instance cleaned up');
        } catch (err) {
          this.callbacks.onLog('warn', `Error while cleaning up old bot: ${this.formatError(err)}`);
        }
      }

      this.callbacks.onLog('info', 'Creating new bot instance...');
      this.connect();
    }, this.reconnectDelayMs);
  }

  // 接続状態を確認し、切断されていれば再接続を試みる。内部で一定時間待機して結果を返す。
  async checkConnectionAndReconnect(): Promise<{ connected: boolean; message?: string }> {
    const currentState = this.state;

    // 切断状態の場合、再接続を試みて一定時間ポーリングで接続完了を待つ
    // - 同期的に長時間待たないためにポーリングで短時間ずつ確認する
    if (currentState === 'disconnected') {
      this.attemptReconnect();

      const maxWaitTime = this.reconnectDelayMs + 5000;
      const pollInterval = 100;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        if (this.state === 'connected') {
          return { connected: true };
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // タイムアウト時はユーザーに分かりやすいメッセージを返す
      const errorMessage =
        `Cannot connect to Minecraft server at ${this.config.host}:${this.config.port}\n\n` +
        `Please ensure:\n` +
        `1. Minecraft server is running on ${this.config.host}:${this.config.port}\n` +
        `2. Server is accessible from this machine\n` +
        `3. Server version is compatible (latest supported: ${SUPPORTED_MINECRAFT_VERSION})\n\n` +
        `For setup instructions, visit: https://github.com/yuniko-software/minecraft-mcp-server`;

      return { connected: false, message: errorMessage };
    }

    if (currentState === 'connecting') {
      return { connected: false, message: 'Bot is connecting to the Minecraft server. Please wait a moment and try again.' };
    }

    return { connected: true };
  }

  // シャットダウン時のクリーンアップ
  cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.bot) {
      try {
        this.bot.quit('Server shutting down');
      } catch (err) {
        this.callbacks.onLog('warn', `Error during cleanup: ${this.formatError(err)}`);
      }
    }
  }

  // エラーオブジェクトを文字列に整形するヘルパー
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
