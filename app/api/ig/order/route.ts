import { NextResponse } from "next/server";
import { IGClient } from "@/lib/ig-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, identifier, password, env, mode, epic, direction, size, kind } = body;

    if (mode === "PAPER") {
      return NextResponse.json({
        ok: true, mode: "PAPER", simulated: true,
        message: "PAPER モード - 仮想発注",
        order: { epic, direction, size, kind },
      });
    }

    if (!apiKey || !identifier || !password || !epic) {
      return NextResponse.json({ ok: false, error: "必須パラメータ不足" }, { status: 400 });
    }

    const client = new IGClient({ apiKey, identifier, password, env: env || "DEMO" });
    await client.login();

    if (kind === "open") {
      const result = await client.openPosition({
        epic, direction, size, currencyCode: "JPY",
      });
      return NextResponse.json({ ok: true, dealReference: result.dealReference });
    } else {
      // 決済: 既存ポジションを取得して反対サイドで close
      const positions = await client.getPositions();
      const target = positions.find((p) => p.market.epic === epic);
      if (!target) {
        return NextResponse.json({ ok: false, error: "決済対象のポジションなし" }, { status: 200 });
      }
      const oppositeDir: "BUY" | "SELL" = target.position.direction === "BUY" ? "SELL" : "BUY";
      const result = await client.closePosition({
        dealId: target.position.dealId,
        epic,
        direction: oppositeDir,
        size: target.position.size,
      });
      return NextResponse.json({ ok: true, dealReference: result.dealReference });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "order failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
