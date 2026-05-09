// kabu Station 接続ヘルスチェック
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { password, verification } = await req.json();
    if (!password) {
      return NextResponse.json({ ok: false, error: "API パスワードが未設定" }, { status: 400 });
    }
    const port = verification ? 18081 : 18080;
    const url = `http://localhost:${port}/kabusapi/token`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ APIPassword: password }),
    });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ ok: false, error: `Status ${r.status}: ${text}` }, { status: 200 });
    }
    const j = await r.json();
    return NextResponse.json({
      ok: true,
      tokenPrefix: typeof j.Token === "string" ? j.Token.slice(0, 12) + "..." : "—",
      mode: verification ? "verification" : "production",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({
      ok: false,
      error: `${msg} | kabu Station が起動・ログインしているか、APIタブが有効か確認してください`,
    }, { status: 200 });
  }
}
