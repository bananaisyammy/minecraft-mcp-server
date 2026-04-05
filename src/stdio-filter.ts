// 標準出力をフィルタするユーティリティ
// - MCP プロトコルでやり取りする JSON のみを標準出力に流し、
//   その他のログが混ざらないようにするための簡易フィルタです。
// - 注意: 非常に単純なフィルタなので、必要に応じて調整してください。
export function setupStdioFiltering(): void {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);

  // process.stdout.write をラップして、JSON らしい出力だけを通す
  process.stdout.write = function(chunk: string | Uint8Array, ...args: never[]): boolean {
    const message = chunk.toString();
    // 先頭が '{'（JSON）か、または ISO タイムスタンプのようなログなら通す
    if (message.match(/^(\{|[\r\n]+$)/) || message.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return originalStdoutWrite(chunk, ...args);
    }
    // その他は捨てる（MCP のプロトコルに不要なログを混ぜないため）
    return true;
  } as typeof process.stdout.write;

  // stderr を無効化することで、stdout と混ざるのをさらに防ぐ場合があります。
  // ただし、本番では慎重に扱ってください（デバッグ情報が失われます）。
  // - ここで console.error を無効化すると stderr 側のログも抑制されるため、
  //   デバッグが必要な場合はコメントアウトしてください。
  // - MCP プロトコルの安定性優先で stderr を抑止することが多いです。
  console.error = function() { return; };
}
