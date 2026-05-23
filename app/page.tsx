import { fetchYahoo } from "@/lib/yahoo";
import { Dashboard } from "@/components/Dashboard";

export const revalidate = 600;

export default async function Home() {
  const data = await (async () => {
    try {
      const [n225, dji] = await Promise.all([
        fetchYahoo("%5EN225"),
        fetchYahoo("%5EDJI"),
      ]);
      return { n225, dji, error: null as string | null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      return { n225: null, dji: null, error: msg };
    }
  })();

  if (data.error || !data.n225 || !data.dji) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-xl border border-[var(--red)] bg-[var(--red)]/10 p-6 max-w-md">
          <h1 className="text-lg font-bold text-[var(--red)] mb-2">⚠️ データ取得失敗</h1>
          <p className="text-sm text-[var(--text-muted)]">{data.error}</p>
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            Yahoo Finance API のレート制限の可能性。少し待ってからリロードしてください。
          </p>
        </div>
      </div>
    );
  }

  return <Dashboard n225={data.n225} dji={data.dji} />;
}
