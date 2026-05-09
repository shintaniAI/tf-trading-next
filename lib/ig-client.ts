// IG証券 REST API クライアント
// Docs: https://labs.ig.com/
// 認証: X-IG-API-KEY + CST + X-SECURITY-TOKEN

export type IGEnv = "DEMO" | "LIVE";
export type IGCredentials = {
  apiKey: string;
  identifier: string;  // ユーザー名
  password: string;
  env: IGEnv;
};

export type IGSession = {
  cst: string;
  securityToken: string;
  accountId: string;
  currencyIsoCode: string;
};

export type IGPosition = {
  position: {
    dealId: string;
    direction: "BUY" | "SELL";
    size: number;
    level: number;
    currency: string;
  };
  market: {
    epic: string;
    instrumentName: string;
    bid: number;
    offer: number;
  };
};

export type IGMarketSearchResult = {
  epic: string;
  instrumentName: string;
  expiry: string;
  marketStatus: string;
};

const BASE_URLS: Record<IGEnv, string> = {
  DEMO: "https://demo-api.ig.com/gateway/deal",
  LIVE: "https://api.ig.com/gateway/deal",
};

export class IGClient {
  private session: IGSession | null = null;

  constructor(private creds: IGCredentials) {}

  private get baseUrl() { return BASE_URLS[this.creds.env]; }

  /** ログイン → CST と Security Token を取得 */
  async login(): Promise<IGSession> {
    const r = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: {
        "X-IG-API-KEY": this.creds.apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json; charset=UTF-8",
        "Version": "2",
      },
      body: JSON.stringify({
        identifier: this.creds.identifier,
        password: this.creds.password,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Login failed ${r.status}: ${text}`);
    }
    const cst = r.headers.get("CST");
    const securityToken = r.headers.get("X-SECURITY-TOKEN");
    if (!cst || !securityToken) throw new Error("CSTまたはX-SECURITY-TOKENが取れない");
    const body = await r.json();
    this.session = {
      cst,
      securityToken,
      accountId: body.currentAccountId || "",
      currencyIsoCode: body.currencyIsoCode || "JPY",
    };
    return this.session;
  }

  private headers(version = "1"): HeadersInit {
    if (!this.session) throw new Error("ログインしていません");
    return {
      "X-IG-API-KEY": this.creds.apiKey,
      "CST": this.session.cst,
      "X-SECURITY-TOKEN": this.session.securityToken,
      "Content-Type": "application/json",
      "Accept": "application/json; charset=UTF-8",
      "Version": version,
    };
  }

  /** 銘柄検索（日経225 の epic を見つける） */
  async searchMarket(searchTerm: string): Promise<IGMarketSearchResult[]> {
    const r = await fetch(
      `${this.baseUrl}/markets?searchTerm=${encodeURIComponent(searchTerm)}`,
      { headers: this.headers() }
    );
    if (!r.ok) throw new Error(`market search ${r.status}`);
    const j = await r.json();
    return j.markets || [];
  }

  /** 残高・口座情報 */
  async getAccounts(): Promise<unknown> {
    const r = await fetch(`${this.baseUrl}/accounts`, { headers: this.headers() });
    if (!r.ok) throw new Error(`accounts ${r.status}`);
    return r.json();
  }

  /** ポジション一覧 */
  async getPositions(): Promise<IGPosition[]> {
    const r = await fetch(`${this.baseUrl}/positions`, { headers: this.headers("2") });
    if (!r.ok) throw new Error(`positions ${r.status}`);
    const j = await r.json();
    return j.positions || [];
  }

  /** 成行発注（OTC） */
  async openPosition(params: {
    epic: string;
    direction: "BUY" | "SELL";
    size: number;
    expiry?: string;        // "DFB"（CFD永続）が日経225 CFD のデフォ
    currencyCode?: string;  // "JPY"
  }): Promise<{ dealReference: string }> {
    const body = {
      epic: params.epic,
      expiry: params.expiry ?? "DFB",
      direction: params.direction,
      size: params.size,
      orderType: "MARKET",
      currencyCode: params.currencyCode ?? "JPY",
      forceOpen: true,
      guaranteedStop: false,
    };
    const r = await fetch(`${this.baseUrl}/positions/otc`, {
      method: "POST",
      headers: this.headers("2"),
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`order ${r.status}: ${text}`);
    }
    return r.json();
  }

  /** ポジション決済（反対サイドで成行） */
  async closePosition(params: {
    dealId: string;
    direction: "BUY" | "SELL";  // 逆方向
    size: number;
    epic: string;
    expiry?: string;
  }): Promise<{ dealReference: string }> {
    const body = {
      dealId: params.dealId,
      epic: params.epic,
      expiry: params.expiry ?? "DFB",
      direction: params.direction,
      size: params.size,
      orderType: "MARKET",
    };
    const r = await fetch(`${this.baseUrl}/positions/otc`, {
      method: "POST",
      headers: { ...this.headers("1"), "_method": "DELETE" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`close ${r.status}: ${text}`);
    }
    return r.json();
  }
}
