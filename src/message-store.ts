// 簡易チャットメッセージストア
// - 古いメッセージを先頭から削って最大件数を保つ単純な実装です
interface StoredMessage {
  timestamp: number;
  username: string;
  content: string;
}

const MAX_STORED_MESSAGES = 100;

export class MessageStore {
  private messages: StoredMessage[] = [];
  private maxMessages = MAX_STORED_MESSAGES;

  // addMessage: 新しいチャットメッセージを追加します
  // - username: メッセージ送信者
  // - content: メッセージ本文
  addMessage(username: string, content: string): void {
    const message: StoredMessage = {
      timestamp: Date.now(),
      username,
      content
    };

    this.messages.push(message);

    // 容量オーバー時は最も古いメッセージを削除する
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
  }

  // getRecentMessages: 最新のメッセージを取得（デフォルト 10 件）
  // - count が 0 以下の場合は空配列を返します（安全ガード）
  getRecentMessages(count: number = 10): StoredMessage[] {
    if (count <= 0) {
      return [];
    }
    return this.messages.slice(-count);
  }

  // 現在の最大保持件数を返す
  getMaxMessages(): number {
    return this.maxMessages;
  }
}
