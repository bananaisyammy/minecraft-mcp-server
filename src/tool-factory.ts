import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError, ZodRawShape, ZodType } from "zod";
import { BotConnection } from './bot-connection.js';

// MCP へ返すレスポンスの型。単純化しており、テキストコンテンツを配列で持ちます。
type McpResponse = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
};

type ToolDamageEvent = {
  // 実行されたツール名
  tool: string;
  // 受けたダメージ量（HP差分）
  amount: number;
  // ダメージ発生前後の HP（小数）
  beforeHealth: number;
  afterHealth: number;
  // ISO タイムスタンプ
  at: string;
  // 人間向けの簡易警告メッセージ
  warning: string;
  // 攻撃したエンティティ情報（可能な場合に設定する）
  attacker?: {
    id?: number;
    name?: string;
    mobType?: string;
  };
  // 攻撃の種類（例: "melee", "projectile", "fall", "fire", "unknown"）
  attackType?: string;
};

type HeaderContext = {
  toolName?: string;
  damages?: ToolDamageEvent[];
};

var posCache: string = '0 0 0';//プレイヤーの位置キャッシュ（バナナ送信で使用）

// ToolFactory は「ツール（小さな操作）」を MCP サーバーに登録するためのユーティリティです。
// 各ツールは名前と説明、引数スキーマ、実行関数（executor）を持ちます。
export class ToolFactory {
  private readonly graceMs: number;
  private readonly postExecWaitMs: number;
  private bananaTimer: ReturnType<typeof setInterval> | null = null;
  private readonly bananaIntervalMs: number;

  constructor(
    private server: McpServer,
    private connection: BotConnection,
    options?: { graceMs?: number; bananaIntervalMs?: number; postExecWaitMs?: number }
  ) {
    const envMs = typeof process !== 'undefined' && process.env && typeof process.env.MCP_GRACE_MS === 'string'
      ? parseInt(process.env.MCP_GRACE_MS, 10)
      : NaN;
    this.graceMs = (options && typeof options.graceMs === 'number')
      ? options.graceMs
      : (Number.isFinite(envMs) ? envMs : 80);
    this.bananaIntervalMs = (options && typeof options.bananaIntervalMs === 'number')
      ? options.bananaIntervalMs
      : 1;

    const envPostMs = typeof process !== 'undefined' && process.env && typeof process.env.MCP_POST_WAIT_MS === 'string'
      ? parseInt(process.env.MCP_POST_WAIT_MS, 10)
      : NaN;
    // デフォルトは 250ms。ただしテスト実行時は速度のために 0 にする。
    this.postExecWaitMs = (options && typeof options.postExecWaitMs === 'number')
      ? options.postExecWaitMs
      : (process.env.NODE_ENV === 'test' ? 0 : (Number.isFinite(envPostMs) ? envPostMs : 250));

    // 自動的にバナナ送信を開始し、ツール呼び出し時に停止、ツール完了時に再開する
    this.onToolInvoke(() => { try { this.stopBananaLoop(); } catch { /* ignore */ } });
    this.onToolReturn(() => { try { this.startBananaLoop(); } catch { /* ignore */ } });
    // 初期状態ではツールが呼ばれていない想定で開始する
    try { this.startBananaLoop(); } catch { /* ignore */ }
  }

  // 全ツール呼び出し前に実行されるハンドラ群
  private onToolInvokeHandlers: Array<(
    name: string,
    args: unknown
  ) => Promise<void> | void> = [];

  // 全ツール完了時に実行されるハンドラ群
  private onToolReturnHandlers: Array<(
    name: string,
    args: unknown,
    result: McpResponse | null,
    error?: Error | null
  ) => Promise<void> | void> = [];

  // 外部からフックを登録するための API
  onToolInvoke(handler: (name: string, args: unknown) => Promise<void> | void): void {
    this.onToolInvokeHandlers.push(handler);
  }

  onToolReturn(handler: (name: string, args: unknown, result: McpResponse | null, error?: Error | null) => Promise<void> | void): void {
    this.onToolReturnHandlers.push(handler);
  }

  // 内部呼び出し用：登録された on-invoke ハンドラを逐次呼び出す
  private async callOnInvokeHandlers(name: string, args: unknown): Promise<void> {
    for (const h of this.onToolInvokeHandlers) {
      try {
        await Promise.resolve(h(name, args));
      } catch (err) {
        // ハンドラは副作用用のため失敗しても主要処理を止めない
        // ここでは警告ログを出す
        // eslint-disable-next-line no-console
        console.warn(`onToolInvoke handler failed for tool ${name}:`, err);
      }
    }
  }

  // 内部呼び出し用：登録された on-return ハンドラを逐次呼び出す
  private async callOnReturnHandlers(name: string, args: unknown, result: McpResponse | null, error?: Error | null): Promise<void> {
    for (const h of this.onToolReturnHandlers) {
      try {
        await Promise.resolve(h(name, args, result, error));
      } catch (err) {
        // ハンドラの失敗は本体処理に影響を与えない
        // eslint-disable-next-line no-console
        console.warn(`onToolReturn handler failed for tool ${name}:`, err);
      }
    }
  }

  // registerTool: ツールを登録する共通のラッパー
  // - name: ツール名（例: "move-to-position"）
  // - description: ツールの説明（外部から参照される）
  // - schema: 引数のスキーマ（zod を使う）
  // - executor: 実際の処理を行う非同期関数
  // connection.setMcpRequestActive が存在すれば呼び出す安全なラッパー
  private setMcpRequestActive(active: boolean): void {
    try {
      const fn = (this.connection as unknown as { setMcpRequestActive?: (active: boolean) => void }).setMcpRequestActive;
      if (fn) fn(active);
    } catch {
      // テストでモックにメソッドが無くても許容する
    }
  }

  // バナナ送信用のループを開始
  private startBananaLoop(): void {
    if (this.bananaTimer) return;
    const execFn = (this.connection as unknown as { executeCommand?: (cmd: string) => boolean }).executeCommand;
    posCache = `${this.connection.getBot()!.entity.position.x} ${this.connection.getBot()!.entity.position.y} ${this.connection.getBot()!.entity.position.z}`;
    if (typeof execFn !== 'function') return; // テスト時のモックでは実行不可なため開始しない
    execFn.call(this.connection, "/attribute @s minecraft:gravity base set 0.0");//ここでプレイヤーの位置を戻す
    const send = () => {
      try {
        execFn.call(this.connection, '/tp @s ' + posCache);//ここでプレイヤーの位置を戻す
        //プレイヤーの座標を取得
        posCache = `${this.connection.getBot()!.entity.position.x} ${this.connection.getBot()!.entity.position.y} ${this.connection.getBot()!.entity.position.z}`;
      } catch {
        // ignore
      }
    };

    // 即時送信してからインターバルを開始
    send();
    this.bananaTimer = setInterval(send, 100);//100ms ごとに送信（サーバーへの負荷を考慮して短めの間隔に設定）
  }

  // バナナ送信用ループを停止
  private stopBananaLoop(): void {
    (this.connection as unknown as { executeCommand?: (cmd: string) => boolean }).executeCommand?.call(this.connection, "/attribute @s minecraft:gravity base set 0.08");//ここでプレイヤーの位置を戻す
    if (!this.bananaTimer) return;
    try {
      clearInterval(this.bananaTimer as any);
      posCache = `${this.connection.getBot()!.entity.position.x} ${this.connection.getBot()!.entity.position.y} ${this.connection.getBot()!.entity.position.z}`;
    } catch {
      // ignore
    }
    this.bananaTimer = null;
  }

  // ツール実行中のダメージ（health低下）を追跡する（攻撃者情報を可能な限り収集）
  private startDamageTracking(toolName: string): { stop: () => Promise<ToolDamageEvent[]> } {
    const damages: ToolDamageEvent[] = [];
    const getBotFn = (this.connection as unknown as { getBot?: () => unknown }).getBot;

    if (!getBotFn) {
      return { stop: async () => damages };
    }

    const bot = getBotFn.call(this.connection) as {
      health?: number;
      entity?: any;
      username?: string;
      on?: (event: string, listener: (...args: any[]) => void) => void;
      removeListener?: (event: string, listener: (...args: any[]) => void) => void;
    } | null;

    if (!bot || typeof bot.on !== 'function') {
      return { stop: async () => damages };
    }

    let previousHealth = typeof bot.health === 'number' ? bot.health : null;

    // 直近のエンティティアクションを保存して、ダメージ発生時に参照する
    const recentActions: Array<{ time: number; kind: string; entity?: any }> = [];
    const pushRecent = (kind: string, entity?: any) => {
      try {
        recentActions.push({ time: Date.now(), kind, entity });
        if (recentActions.length > 200) recentActions.shift();
      } catch {
        // ignore
      }
    };

    const swingHandler = (entity?: any) => pushRecent('swing', entity);
    const hurtHandler = (entity?: any) => pushRecent('hurt', entity);
    const projectileHandler = (entity?: any) => pushRecent('projectile', entity);

    const onHealthChanged = () => {
      const currentHealth = typeof bot.health === 'number' ? bot.health : null;
      if (previousHealth !== null && currentHealth !== null && currentHealth < previousHealth) {
        const damageAmount = Number((previousHealth - currentHealth).toFixed(2));

        // 直近 2 秒のアクションから攻撃者を推測
        const now = Date.now();
        const recentWindow = [...recentActions].reverse().filter(r => now - r.time <= 2000);

        // 優先: Bot 自身ではないエンティティを選ぶ（なければ最初の recent を使う）
        let recent = recentWindow.find((r) => {
          try {
            const ent = r.entity;
            if (!ent) return false;
            if (ent === bot || ent === bot.entity) return false;
            if (typeof ent.id === 'number' && typeof bot.entity?.id === 'number' && ent.id === bot.entity!.id) return false;
            if (typeof ent.username === 'string' && typeof (bot as any).username === 'string' && ent.username === (bot as any).username) return false;
            return true;
          } catch {
            return true;
          }
        }) || recentWindow[0];

        let attackerInfo: ToolDamageEvent['attacker'] | undefined = undefined;
        let attackType: string | undefined = undefined;
        if (recent && recent.entity) {
          const ent = recent.entity;
          let name: string | undefined;
          try {
            name = (ent && (ent.username || ent.displayName || ent.name || ent.mobType || ent.type || ent.id)) ?? undefined;
          } catch {
            name = undefined;
          }
          attackerInfo = {
            id: typeof ent?.id === 'number' ? ent.id : undefined,
            name: typeof name === 'string' ? name : String(name ?? ''),
            mobType: typeof ent?.mobType === 'string' ? ent.mobType : undefined
          };
          attackType = recent.kind === 'swing' || recent.kind === 'hurt' ? 'melee' : recent.kind === 'projectile' ? 'projectile' : 'unknown';
        } else {
          attackType = 'unknown';
        }

        damages.push({
          tool: toolName,
          amount: damageAmount,
          beforeHealth: Number(previousHealth.toFixed(2)),
          afterHealth: Number(currentHealth.toFixed(2)),
          at: new Date().toISOString(),
          warning: attackerInfo ? `-${damageAmount} HP from ${attackerInfo.name} (${attackType ?? 'unknown'})` : `Damage received during ${toolName}: -${damageAmount} HP`,
          attacker: attackerInfo,
          attackType
        });
      }
      previousHealth = currentHealth;
    };

    try {
      bot.on('health', onHealthChanged);
      bot.on('entitySwingArm', swingHandler);
      bot.on('entityHurt', hurtHandler);
      bot.on('launch', projectileHandler);
      bot.on('projectileHit', projectileHandler);
    } catch {
      return { stop: async () => damages };
    }

    let stopped = false;
    const graceMs = this.graceMs; // 設定可能な猶予時間（ms）

    return {
      stop: async () => {
        if (stopped) return damages;
        stopped = true;
        // executor が即座に返しても、この猶予時間中に来る health/food/air イベントを拾う
        await new Promise((resolve) => setTimeout(resolve, graceMs));
        try {
          if (typeof bot.removeListener === 'function') {
            bot.removeListener('health', onHealthChanged);
            bot.removeListener('entitySwingArm', swingHandler);
            bot.removeListener('entityHurt', hurtHandler);
            bot.removeListener('launch', projectileHandler);
            bot.removeListener('projectileHit', projectileHandler);
          }
        } catch {
          // ignore
        }
        return damages;
      }
    };
  }

  // getDamageWarn:
  // - ツール実行中に収集されたダメージ配列を受け取り、人間向けの警告メッセージを生成します。
  // - 空配列なら空文字列を返します（ヘッダーに警告を入れないため）。

  registerTool(
    name: string,
    description: string,
    schema: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    executor: (args: any) => Promise<McpResponse>
  ): void {
    this.server.tool(name, description, schema, async (args: unknown): Promise<McpResponse> => {
      // MCP リクエストが来たら bot のティック速度を早くする（パフォーマンス重視）
      this.setMcpRequestActive(true);

      // 呼び出し前ハンドラ呼び出し（失敗しても続行）
      await this.callOnInvokeHandlers(name, args);

      const damageTracker = this.startDamageTracking(name);

      let response: McpResponse | null = null;
      let execError: Error | null = null;
      let damages: ToolDamageEvent[] = [];

      try {
        // 接続を確認し、必要なら再接続を試みる
        const connectionCheck = await this.connection.checkConnectionAndReconnect();

        if (!connectionCheck.connected) {
          response = {
            content: [{ type: "text", text: connectionCheck.message! }],
            isError: true
          };
        } else {
          // スキーマがある場合はバリデーションしてから実行する
          const parsedArgs = this.shouldValidateSchema(schema)
            ? this.parseArgs(schema as ZodRawShape, args)
            : args;

          response = await executor(parsedArgs);
        }
      } catch (error) {
        execError = error instanceof Error ? error : new Error(String(error));
        response = this.createErrorResponse(execError);
      } finally {
        // executor の完了後に短い待機時間を入れてからダメージの集計／後処理を行う
        try {
          const waitMs = typeof this.postExecWaitMs === 'number' ? this.postExecWaitMs : 0;
          if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        } catch {
          // ignore
        }

        // ダメージ収集（graceMs 内のイベントも含める）
        damages = await damageTracker.stop();

        // 後処理ハンドラは待機とダメージ収集の後に呼ぶ
        try {
          await this.callOnReturnHandlers(name, args, response, execError ?? undefined);
        } catch (err) {
          console.log(`onToolReturn handler error for tool ${name}:`, err);
        }

        // 最後にティック速度を元に戻す
        this.setMcpRequestActive(false);
      }

      const finalResponse = response ?? this.createErrorResponse('Tool returned no response');
      return this.mergeDamageInfoIntoResponse(finalResponse, { toolName: name, damages });
    });
  }

  // 正常応答を作るヘルパー
  createResponse(text: string): McpResponse {
    return {
      content: [{ type: "text", text }]
    };
  }

  // エラー応答を作るヘルパー
  createErrorResponse(error: Error | string): McpResponse {
    const errorMessage = error instanceof Error ? error.message : error;
    return {
      content: [{ type: "text", text: `Failed: ${errorMessage}` }],
      isError: true
    };
  }

  // ダメージ警告を生成するメソッド
  getDamageWarn(context?: HeaderContext): string {
    const damages = context?.damages ?? [];

    // Bot の状態から水中ゲージ（oxygen）と空腹ゲージ（hunger）の警告を生成する
    let waterWarn = '';
    let hungerWarn = '';
    try {
      const bot = (this.connection as unknown as { getBot?: () => any }).getBot?.();
      const food = bot?.food as any | undefined;
      const entity = bot?.entity as any | undefined;

      // 水中ゲージ判定: `bot.oxygenLevel` を優先、なければ `entity.air`
      const oxygenVal = (typeof bot.oxygenLevel === 'number')
        ? Number(bot.oxygenLevel)
        : (typeof entity?.air === 'number' ? Number(entity.air) : undefined);

      if (typeof oxygenVal === 'number') {
        const maxOxygen = 20; // 目安
        if (oxygenVal <= Math.floor(maxOxygen / 2)) {
          waterWarn = '（水中ゲージが半分以下です）';
        }
      }

      // 空腹判定: Mineflayer の `bot.food` が持つ代表的なフィールドを順にチェック
      const hungerVal = (typeof food?.food === 'number')
        ? Number(food.food)
        : (typeof food?.hunger === 'number'
          ? Number(food.hunger)
          : (typeof food?.foodLevel === 'number' ? Number(food.foodLevel) : undefined));

      if (typeof hungerVal === 'number') {
        const maxHunger = 20; // Minecraft の空腹ゲージ上限
        if (hungerVal <= Math.floor(maxHunger / 2)) {
          hungerWarn = '（空腹ゲージが半分以下です！考えている時間はありません！早急に空気のあるところへ移動してください！）';
        }
      }
    } catch {
      // 無理に失敗させない（環境によっては bot/food が無い）
    }

    // ダメージ情報が無くても水中／空腹警告があればそれを返す
    if (damages.length === 0) {
      const combinedNoDamage = [waterWarn, hungerWarn].filter(Boolean).join(', ');
      return combinedNoDamage ? `注意！${combinedNoDamage}` : '';
    }

    const last = damages[damages.length - 1];
    const hp = Number(last.afterHealth.toFixed(2));
    const warnings = damages.map((d) => {
      if (d.warning) return String(d.warning);
      if (d.attacker && d.attacker.name) {
        return `-${d.amount} HP (${d.attackType ?? 'unknown'})`;
      }
      return `-${d.amount} HP during ${d.tool}`;
    }).join(', ');

    const extraWarns = [waterWarn, hungerWarn].filter(Boolean);
    const combined = extraWarns.length > 0 ? `${warnings}, ${extraWarns.join(', ')}` : warnings;
    return `注意！ダメージを受けています！(HP:${hp}/20),${combined}、ダメージの原因を特定して何とかすることをお勧めします。`;
  }

  private mergeDamageInfoIntoResponse(response: McpResponse, context?: HeaderContext): McpResponse {
    const damages = context?.damages ?? [];
    // 人間向けメッセージ（ダメージ警告 + 水中ゲージ警告）を先に取得
    const humanWarn = this.getDamageWarn(context);

    // ダメージが無く、かつ人間向け警告も無ければ何もしない
    if (damages.length === 0 && !humanWarn) {
      return response;
    }
    const existingHeader = (typeof response.header === 'object' && response.header !== null)
      ? (response.header as Record<string, unknown>)
      : {};

    const existingWarningsRaw = Array.isArray(existingHeader.warnings)
      ? existingHeader.warnings
      : [];
    const existingWarnings = existingWarningsRaw.map((w) => String(w));

    const totalDamage = Number(damages.reduce((sum, d) => sum + d.amount, 0).toFixed(2));
    const toolName = context?.toolName ?? 'unknown-tool';
    const warning = `Damage detected during ${toolName}: total ${totalDamage} HP`;

    // 人間向けの簡易警告文は既に上で取得済み（humanWarn）

    const combinedWarnings = [...existingWarnings];
    if (damages.length > 0) combinedWarnings.push(warning);
    if (humanWarn) combinedWarnings.push(humanWarn);

    const newHeader = {
      ...existingHeader,
      damages,
      warnings: combinedWarnings
    };

    const newResponse: McpResponse = {
      ...response,
      header: newHeader
    };

    // 一部クライアントは header を表示しない可能性があるため、
    // humanWarn を content にも追記して視認性を確保する
    const prevContent = Array.isArray(newResponse.content) ? newResponse.content : [];
    if (humanWarn) {
      newResponse.content = [...prevContent, { type: "text", text: humanWarn }];
    } else {
      newResponse.content = prevContent;
    }

    return newResponse;
  }

  // スキーマが空オブジェクトの場合はバリデーションを行うかどうかの判定
  private shouldValidateSchema(schema: Record<string, unknown>): boolean {
    const values = Object.values(schema);
    if (values.length === 0) {
      // スキーマが空ならデフォルトでバリデーションを行う（安全側）
      return true;
    }

    return values.every((value) => value instanceof ZodType);
  }

  // zod を使って引数をパース・検証する
  private parseArgs(schema: ZodRawShape, args: unknown): unknown {
    try {
      return z.object(schema).passthrough().parse(args ?? {});
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(this.formatZodError(error));
      }
      throw error;
    }
  }

  // Zod のエラーを分かりやすい文字列に整形する
  private formatZodError(error: ZodError): string {
    const details = error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        return `${path}${issue.message}`;
      })
      .join('; ');

    return `Invalid tool arguments: ${details}`;
  }
}
