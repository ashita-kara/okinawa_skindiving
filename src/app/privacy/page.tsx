import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー | 水粒子軌道 計算シミュレーター",
  description: "水粒子軌道 計算シミュレーターのプライバシーポリシーおよび利用規約",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-[#fbf7ef] px-5 py-10 text-slate-800 sm:px-10">
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-sky-100 bg-white p-6 shadow-md sm:p-10">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3.5 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-100"
          >
            ← シミュレーターに戻る
          </Link>
          <h1 className="mt-4 text-xl font-extrabold text-slate-900 sm:text-2xl">
            プライバシーポリシー・利用規約
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            運営：Proto Tools Lab（水粒子軌道 計算シミュレーター）
          </p>
        </div>

        <section className="space-y-2 text-xs leading-relaxed text-slate-700 sm:text-sm">
          <h2 className="font-bold text-slate-900">1. 利用者情報の取り扱いについて</h2>
          <p>
            本ツール（水粒子軌道 計算シミュレーター）では、ブックマーク登録やタイマー設定・記録などを、お使いの端末内（ブラウザの localStorage）にのみ保存します。これらの設定データが当方のサーバーへ送信・収集されることはありません。
          </p>
        </section>

        <section className="space-y-2 text-xs leading-relaxed text-slate-700 sm:text-sm">
          <h2 className="font-bold text-slate-900">2. アクセス解析について</h2>
          <p>
            本ツールでは、第三者配信のサービスを利用する場合があります。Google によるデータの使用については、
            <a
              href="https://policies.google.com/technologies/ads?hl=ja"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sky-700 underline"
            >
              Google のポリシーと規約
            </a>
            をご確認ください。
          </p>
        </section>

        <section className="space-y-2 text-xs leading-relaxed text-slate-700 sm:text-sm">
          <h2 className="font-bold text-slate-900">3. 計算モデルについて</h2>
          <p>
            本ツールは、微小振幅波理論（Airy波理論）および設定された地形減衰係数・水深パラメータに外部APIの公開数値を代入した際の理論演算値を算出する個人向け計算シミュレーターです。シミュレーション結果の正確性や特定の目的に対する適合性について、運営者は一切の保証を行いません。
          </p>
        </section>

        <section className="space-y-2 text-xs leading-relaxed text-slate-700 sm:text-sm">
          <h2 className="font-bold text-slate-900">4. お問い合わせ窓口</h2>
          <p>
            本ポリシーに関するお問い合わせは、下記までご連絡ください。
            <br />
            運営者：Proto Tools Lab
            <br />
            メールアドレス：prototoolslab@gmail.com
          </p>
        </section>

        <p className="border-t border-slate-100 pt-4 text-[11px] text-slate-400">
          制定日：2026年11月2日
        </p>
      </div>
    </div>
  );
}

