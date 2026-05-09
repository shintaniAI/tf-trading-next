// 先物発注エンドポイント
import { NextResponse } from "next/server";
import { KabuClient } from "@/lib/kabu-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      password, verification, mode,
      symbol, side, qty, tradeType, frontOrderType, price,
    } = body;

    if (mode === "PAPER") {
      return NextResponse.json({
        ok: true,
        mode: "PAPER",
        simulated: true,
        message: "PAPER モード - 仮想発注（実際の注文は出ていません）",
        order: { symbol, side, qty, tradeType, frontOrderType, price },
      });
    }

    if (!password || !symbol || !side || !qty) {
      return NextResponse.json({ ok: false, error: "必須パラメータ不足" }, { status: 400 });
    }

    const client = new KabuClient({ password, verification: !!verification });
    const result = await client.sendOrderFuture({
      symbol, side, qty,
      tradeType: tradeType ?? 1,
      frontOrderType: frontOrderType ?? 120, // 寄成デフォルト
      price: price ?? 0,
    });
    return NextResponse.json({ ok: result.Result === 0, result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "order failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
