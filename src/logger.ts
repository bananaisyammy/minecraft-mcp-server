// シンプルなロガー関数
// - このプロジェクトでは標準エラー出力（stderr）にログを書き出します。
// - ログは MCP の標準出力と混ざらないように stderr を使うのが安全です。
// - 使用例: log('info', 'Bot connected');
export function log(level: string, message: string): void {
  const timestamp = new Date().toISOString();
  // 出力フォーマット: ISO 時刻 [minecraft] [mcp-server] [LEVEL] メッセージ
  process.stderr.write(`${timestamp} [minecraft] [mcp-server] [${level}] ${message}\n`);
}