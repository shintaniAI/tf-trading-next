import { NextResponse } from "next/server";
import { IGClient } from "@/lib/ig-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { apiKey, identifier, password, env } = await req.json();
    if (!apiKey || !identifier || !password) {
      return NextResponse.json({ ok: false, error: "認証情報不足" }, { status: 400 });
    }
    const client = new IGClient({ apiKey, identifier, password, env: env || "DEMO" });
    await client.login();
    const [positions, accounts] = await Promise.all([
      client.getPositions().catch(() => []),
      client.getAccounts().catch(() => null),
    ]);
    return NextResponse.json({ ok: true, positions, accounts });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
