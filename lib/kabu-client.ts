// kabu Station API クライアント (TypeScript版)
// 三菱UFJ eスマート証券の API ラッパー
// ドキュメント: https://kabucom.github.io/kabusapi/reference/index.html

export type KabuConfig = {
  password: string;
  verification: boolean; // true = 検証モード(port 18081), false = 本番(18080)
};

export type KabuPosition = {
  Symbol: string;
  SymbolName: string;
  Side: "1" | "2"; // 1=売 2=買
  LeavesQty: number;
  Price: number;
};

export type KabuOrderResult = {
  Result: number; // 0 = 成功
  OrderId?: string;
};

export type KabuWallet = {
  FutureTradeLimit: number;
  MarginPremiumTotal: number;
};

export class KabuClient {
  private token: string | null = null;
  private baseUrl: string;

  constructor(private config: KabuConfig) {
    const port = config.verification ? 18081 : 18080;
    this.baseUrl = `http://localhost:${port}/kabusapi`;
  }

  async getToken(): Promise<string> {
    const r = await fetch(`${this.baseUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ APIPassword: this.config.password }),
    });
    if (!r.ok) throw new Error(`token error ${r.status}`);
    const j = await r.json();
    this.token = j.Token;
    return j.Token;
  }

  private async authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.token) await this.getToken();
    const r = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        "Content-Type": "application/json",
        "X-API-KEY": this.token!,
      },
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`${r.status}: ${text}`);
    }
    return r.json();
  }

  async getWalletFuture(): Promise<KabuWallet> {
    return this.authedFetch("/wallet/future");
  }

  async getPositions(): Promise<KabuPosition[]> {
    return this.authedFetch("/positions");
  }

  async getOrders(): Promise<unknown[]> {
    return this.authedFetch("/orders");
  }

  /**
   * 先物発注
   * @param symbol 銘柄コード（例: 167060019）
   * @param side "1"=売, "2"=買
   * @param qty 枚数
   * @param tradeType 1=新規, 2=返済
   * @param frontOrderType 120=寄成, 130=引成, 10=成行, 20=指値
   */
  async sendOrderFuture(params: {
    symbol: string;
    side: "1" | "2";
    qty: number;
    tradeType: 1 | 2;
    frontOrderType: number;
    price?: number;
    exchange?: number; // 2=大証
  }): Promise<KabuOrderResult> {
    const body = {
      Password: this.config.password,
      Symbol: params.symbol,
      Exchange: params.exchange ?? 2,
      TradeType: params.tradeType,
      TimeInForce: 1, // FAS
      Side: params.side,
      Qty: params.qty,
      FrontOrderType: params.frontOrderType,
      Price: params.price ?? 0,
      ExpireDay: 0,
    };
    return this.authedFetch("/sendorder/future", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async cancelOrder(orderId: string): Promise<KabuOrderResult> {
    return this.authedFetch("/cancelorder", {
      method: "PUT",
      body: JSON.stringify({ OrderId: orderId, Password: this.config.password }),
    });
  }
}
