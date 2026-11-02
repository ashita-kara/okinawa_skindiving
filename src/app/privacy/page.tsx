import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー・免責事項 | 沖縄スキンダイビング 底揺れ・海況ナビ",
  description: "沖縄スキンダイビング 底揺れ・海況ナビ（Proto Tools Lab）のプライバシーポリシーおよび免責事項",
  alternates: {
    canonical: "https://okinawa-dive.prototoolslab.com/privacy",
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
            ← 海況ナビに戻る
          </Link>
          <h1 className="mt-4 text-xl font-extrabold text-slate-900 sm:text-2xl">
            プライバシーポリシー・免責事項
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            運営：Proto Tools Lab（沖縄スキンダイビング 底揺れ・海況ナビ）
          </p>
        </div>

        <section className="space-y-2 text-xs leading-relaxed text-slate-700 sm:text-sm">
          <h2 className="font-bold text-slate-900">1. 利用者情報の取り扱いについて</h2>
          <p>
            本サービス（Webアプリおよびモバイルアプリ「沖縄スキンダイビング 底揺れ・海況ナビ」）では、お気に入りポイントの登録や息止めトレーニングの設定・自己ベスト記録などを、お使いの端末内（ブラウザの localStorage）にのみ保存します。これらの設定データが当方のサーバーへ送信・収集されることはありません。
          </p>
        </section>

        <section className="space-y-2 text-xs leading-relaxed text-slate-700 sm:text-sm">
          <h2 className="font-bold text-slate-900">2. 広告配信およびアクセス解析について</h2>
          <p>
            本サービスでは、第三者配信の広告サービス（Google AdMob / Google AdSense 等）およびアクセス解析ツールを利用する場合があります。広告配信事業者は、ユーザーの興味に応じた広告を表示するため、また広告配信の計測や不正防止のために、端末の広告ID（Advertising ID）や Cookie 等の識別子を利用することがあります。
          </p>
          <p>
            Google によるデータの使用およびパーソナライズド広告の無効化設定については、
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
          <h2 className="font-bold text-slate-900">3. 免責事項（海況・健康管理について）</h2>
          <p>
            本サービスは気象業務法に基づく独自の気象・波浪予報業務を行うものではありません。公開されている数値データ（Open-Meteo、気象庁潮位表など）と各ポイントの地形条件から算出した参考指数・目安を表示するナビゲーションツールです。
          </p>
          <p>
            表示される底揺れ（振られ幅）・透明度目安・離岸流注意表示は海での安全を保証するものではありません。エントリーの可否は必ず現地の海況・行政や管理者の指示・ご自身の体調とスキルに基づき自己責任でご判断ください。また、アプリ内の体調管理に関する記載やトレーニング機能は医学的な診断・治療を目的としたものではありません。本サービスの利用により生じたいかなる損害・事故についても、運営者は一切の責任を負いません。
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
