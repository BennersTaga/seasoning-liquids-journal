import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-orange-50 p-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <div className="text-xs tracking-widest text-amber-700">調味液日報</div>
          <h1 className="text-3xl font-semibold">プロトタイプ ステージング</h1>
          <p className="text-sm text-muted-foreground">
            下のリンクからプロトタイプを用途別に開けます（どちらも同じコンポーネントを表示します）。
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium">オフィス</h2>
            <p className="text-sm text-muted-foreground mt-1">
              チーム向けのオフィスビューとしてプロトタイプを表示します。
            </p>
            <Link
              href="/office"
              className="mt-4 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium hover:bg-orange-50"
            >
              オフィスを開く →
            </Link>
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium">現場</h2>
            <p className="text-sm text-muted-foreground mt-1">
              同じプロトタイプを現場向けに再利用します。
            </p>
            <Link
              href="/floor"
              className="mt-4 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium hover:bg-orange-50"
            >
              現場を開く →
            </Link>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          プロトタイプ本体は <code>src/app/(ui)/prototype/page.tsx</code> にあります。
        </p>
      </div>
    </main>
  );
}
