import { NextResponse } from "next/server";
import { KabuClient } from "@/lib/kabu-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { password, verification } = await req.json();
    if (!password) return NextResponse.json({ ok: false, error: "no password" }, { status: 400 });
    const client = new KabuClient({ password, verification: !!verification });
    const [positions, wallet] = await Promise.all([
      client.getPositions().catch(() => []),
      client.getWalletFuture().catch(() => null),
    ]);
    return NextResponse.json({ ok: true, positions, wallet });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
