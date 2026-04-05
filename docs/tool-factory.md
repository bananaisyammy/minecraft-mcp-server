# ToolFactory: graceMs 設定

このドキュメントは `ToolFactory` の新しい `graceMs` 設定について説明します。

目的
- `startDamageTracking` の `stop()` 呼び出し時に短い猶予時間（デフォルト 80ms）を設け、ツール実行直後に発生する `health` / `food` / `air` 等のイベントやダメージを確実に検出します。

設定方法
1. コンストラクタ経由（推奨）

```ts
import { ToolFactory } from './src/tool-factory';

const factory = new ToolFactory(server, connection, { graceMs: 120 });
```

2. 環境変数（デフォルトより優先される）

- `MCP_GRACE_MS` をミリ秒で設定すると、その値が使用されます。

例（Unix/Windows PowerShell）:

```bash
# PowerShell
$env:MCP_GRACE_MS = "150"
npm start
```

実装の注意点
- デフォルトは 80ms です。
- 値を小さくしすぎると短時間のイベントを取りこぼす可能性があります。運用環境で挙動を確認しつつ調整してください。

用途
- `jump`, `craft-item` 等、executor が即時に終了するツールで発生する短時間イベントを拾うための調整に使用します。

問題があれば issue を作成してください。