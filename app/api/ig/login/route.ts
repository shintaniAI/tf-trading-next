// IG証券 ログインテスト
import { NextResponse } from "next/server";
import { IGClient } from "@/lib/ig-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { apiKey, identifier, password, env } = await req.json();
    if (!apiKey || !identifier || !password) {
      return NextResponse.json({ ok: false, error: "認証情報が不足" }, { status: 400 });
    }
    const client = new IGClient({ apiKey, identifier, password, env: env || "DEMO" });
    const session = await client.login();
    // 日経225 epic 自動検索
    let nikkei: string | null = null;
    try {
      const markets = await client.searchMarket("Japan 225");
      nikkei = markets[0]?.epic ?? null;
    } catch {}
    return NextResponse.json({
      ok: true,
      env: env || "DEMO",
      accountId: session.accountId,
      currency: session.currencyIsoCode,
      cstPrefix: session.cst.slice(0, 12) + "...",
      nikkeiEpic: nikkei,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "login failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
