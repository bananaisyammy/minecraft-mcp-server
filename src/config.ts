import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// サーバー接続設定の型定義（ホスト、ポート、ボット名）
export interface ServerConfig {
  host: string;
  port: number;
  username: string;
}

// コマンドライン引数をパースして ServerConfig を返すユーティリティ
// - デフォルト値を設定しているので最小限の引数で動きます
// - 例: node scripts/start-mcp.js --host 127.0.0.1 --port 25565 --username MyBot
export function parseConfig(): ServerConfig {
  return yargs(hideBin(process.argv))
    .option('host', {
      type: 'string',
      description: 'Minecraft server host',
      default: 'localhost'
    })
    .option('port', {
      type: 'number',
      description: 'Minecraft server port',
      default: 25565
    })
    .option('username', {
      type: 'string',
      description: 'Bot username',
      default: 'LLMBot'
    })
    .help()
    .alias('help', 'h')
    .parseSync();
}
