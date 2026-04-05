// 型定義の補助ファイル: mineflayer-pathfinder の簡易的な型定義
// - 実行時には prismarine や minecraft-data の型と合致する実装が使われますが、
//   開発時に TypeScript の型チェックをパスさせるために最低限の宣言を行っています。
declare module 'mineflayer-pathfinder' {
  import type { Bot } from 'mineflayer';

  // Movements は pathfinder の移動設定クラスです。
  // ここではコンストラクタのシグネチャだけ宣言しています。
  export class Movements {
    constructor(_bot: Bot, _mcData: unknown);
  }
}