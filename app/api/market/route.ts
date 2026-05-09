import { NextResponse } from "next/server";
import { fetchYahoo } from "@/lib/yahoo";

export const revalidate = 600;

export async function GET() {
  try {
    const [n225, dji] = await Promise.all([
      fetchYahoo("%5EN225"),
      fetchYahoo("%5EDJI"),
    ]);
    return NextResponse.json({ n225, dji });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
