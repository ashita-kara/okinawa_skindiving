"use client";

import { useState } from "react";
import { Waves, HeartPulse, ChevronDown, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";

interface GuideItem {
  id: string;
  badge: string;
  title: string;
  whatHappens: string;
  whyItHappens: string;
  countermeasure: string;
}

const CHAPTER_1: GuideItem[] = [
  {
    id: "mesh-and-reef",
    badge: "海況のしくみ 01",
    title: "なぜ一般的な波情報だけでは沖縄のビーチの揺れが分からないのか？",
    whatHappens:
      "天気サイトや一般的な波情報アプリでは「波が低い・穏やか」と出ているのに、実際のビーチにエントリーすると水中で体が大きく振られたり、階段や岩場で波が立っていたりすることがあります。",
    whyItHappens:
      "一般的な波情報が見ているのは沖合数キロ〜十数キロの「外洋の波の高さ」です。しかし沖縄の海は「海岸が開けている方角」「沖合のサンゴ礁の棚（アウターリーフ・イノー）」「潜る水深」によって、同じ日の同じ時間でもポイントごとに揺れ方が大きく変わるためです。",
    countermeasure:
      "本アプリでは、沖合のうねり（高さ・周期・向き）に対して各ポイントの「開口方位」「リーフによる減衰」「潮位」「基準水深」を掛け合わせ、実際に潜る水深で体が何cm振られるかの目安を算出しています。",
  },
  {
    id: "swell-period-sickness",
    badge: "海況のしくみ 02",
    title: "なぜ「うねりの周期（秒）」が長いと、砂が舞って波酔いするのか？",
    whatHappens:
      "水面は一見穏やかに見えるのに、うねりの周期が8秒以上の日は水底の砂が舞って白濁りし、水面で休んでいると10分〜15分ほどで急に波酔い（サージ酔い）しやすくなります。",
    whyItHappens:
      "風で表面がチャプチャプしているだけの波（周期3〜5秒）は水深3〜5mではほぼ消えますが、遠くの台風や低気圧から届く「周期8秒以上のうねり」は波と波の間隔が長く、水深5m〜10mの海底までエネルギーが届きます。水面で揺られながら、下で前後に20〜30cm以上往復する砂や海藻を見続けることで、目からの情報と三半規管の感覚にズレが生じるためです。",
    countermeasure:
      "本アプリではスキンダイバーの実体感に合わせ、振られ幅23cm以上を「注意（波酔い・底揺れ警戒）」としています。周期が8秒以上の日は、風裏やリーフに守られた振られ幅9cm以下のポイントを選ぶと快適です。",
  },
  {
    id: "reef-tide-current",
    badge: "海況のしくみ 03",
    title: "「リーフの高さ × 引き潮」で起きる強い流れ（離岸流）のしくみ",
    whatHappens:
      "満潮の時は穏やかだったインリーフ（イノー）が、引き潮の途中から急にプール間や水路で川のような強い沖向きの流れ（カレント）に変わることがあります。",
    whyItHappens:
      "大度海岸（ジョン万）や備瀬崎など沖側に浅いリーフの棚がある場所では、満潮時は棚の上全体から広く水が外洋へ逃げていきます。しかし引き潮で潮位がリーフの天井の高さ（約80〜120cm前後）まで下がると、壁の上から水が逃げられなくなり、リーフの切れ目（水路）という狭い出口にすべての排水が集中するためです。",
    countermeasure:
      "潮が速く引いている時間帯（カードに「⚠️引き潮離岸流に注意」が出ている時）は、リーフの切れ目や水路の近くに寄らないようにし、潮位が下がりきる前に岸側へ戻る計画を立てましょう。",
  },
  {
    id: "reef-stagnation-turbidity",
    badge: "海況のしくみ 04",
    title: "複雑なリーフ内のプール（大度海岸など）で「白濁り」がすぐには回復しない理由",
    whatHappens:
      "リーフに守られた浅いプール（大度海岸の第1・第2プールなど）では、底揺れがほとんど無く穏やかな日でも、他のエリアのように透明度がすぐには回復せず、弱めの白濁りが残ることがあります。",
    whyItHappens:
      "岸側のプールから沖のアウトリーフまでの間に広大で複雑なサンゴ礁の棚（リーフ）がある場合、その複雑な地形が「外洋のうねり（底揺れ）を防ぐ防波堤」になる一方で、「外洋の澄んだ海水との入れ替わりも妨げる壁」になります。満潮時や前日までの波で舞い上がった微細なサンゴ砂・シルトが複雑なリーフの奥に閉じ込められやすく、干潮でリーフが閉ざされるとさらに水が滞留するため、一度白濁りが出ると回復までに時間がかかります。",
    countermeasure:
      "底揺れを避けて穏やかに練習したい時は第1・第2プールなどのインリーフが最適ですが、透明度を重視したい日は、うねりと流れが穏やかなタイミングを見極めて沖側（水交換の良い第4プールやアウトリーフ側、または外洋に面した岩礁ポイント）を選ぶのがおすすめです。",
  },
];

const CHAPTER_2: GuideItem[] = [
  {
    id: "heavy-food-dairy",
    badge: "体調・習慣 01",
    title: "前日夜〜当日の「ゆで卵・脂っこい食事・乳製品」",
    whatHappens:
      "いつもなら平気な少しの底揺れでも急に波酔いや吐き気が出たり、喉や鼻の奥が詰まった感じがして耳抜きが通りにくくなったりします。",
    whyItHappens:
      "固ゆで卵や揚げ物・脂っこい食事は胃の中に長く留まりやすく、頭を下にして潜る姿勢（ジャックナイフ）や水圧でお腹が押された際に逆流感やムカムカを招きやすくなります。さらに消化のために胃腸へ血液が集まると、水中でリラックスして酸素を節約する働きとも競合してしまいます。また、牛乳やヨーグルトなどの乳製品は口や喉の奥に粘り気が出やすく、耳抜きの通りが悪く感じられることがあります。",
    countermeasure:
      "潜る前日夜〜当日の朝は、消化の良い炭水化物（おにぎり・うどん・バナナなど）を腹八分目で早めに摂り、エントリー直前の乳製品は控えるのが快適さの秘訣です。",
  },
  {
    id: "caffeine-citrus",
    badge: "体調・習慣 02",
    title: "エントリー前の「濃いコーヒー・エナジードリンク・柑橘ジュース」",
    whatHappens:
      "海に入ってもドキドキして息が長く止まらない、ふくらはぎや足裏がつりやすい、うねりの中で胃がムカムカして波酔いしやすくなります。",
    whyItHappens:
      "眠気覚ましのコーヒーやエナジードリンクに含まれるカフェインは、神経を興奮させて心拍数を上げるため、素潜りで大切な「水に入ると脈が落ち着く反応」を妨げて酸素を早く消費してしまいます。また、利尿作用による水分不足（足つり）や、オレンジジュース等の柑橘類の酸味と重なることで胃が荒れて波酔いを誘発しやすくなります。",
    countermeasure:
      "海へ向かう朝はコーヒーやエナジードリンクを控え、水や麦茶・ノンカフェイン飲料でこまめに水分を補給しましょう。",
  },
  {
    id: "workout-fatigue",
    badge: "体調・習慣 03",
    title: "ハードな「筋トレ・ランニング」直後のエントリー",
    whatHappens:
      "普段なら余裕で潜れる深さや時間なのに、潜り始めてすぐに息が上がってしまい、息止め時間が極端に短くなります。",
    whyItHappens:
      "激しい筋トレや長距離ランニングを行った後は、疲労した筋肉を回復させるために、じっと安静にしていても普段より多くの酸素を使い続ける状態が1〜2日ほど続くためです。身体の基礎的な酸素消費ペースが上がっているため、息を止めた直後から苦しさが早く訪れます。",
    countermeasure:
      "しっかり深く・長く潜りたい日の前日は、ハードな筋トレや走り込みを休養日に充てるだけで、水中での息の持ちと余裕が大きく変わります。",
  },
  {
    id: "body-care-hot-bath",
    badge: "体調・習慣 04",
    title: "「カッサ・強いもみほぐし」や「直前の熱い長風呂・サウナ」",
    whatHappens:
      "海に入って体が冷えた途端、肩や背中に鉛を乗せたような強い重だるさや、締め付けられるような痛みが出ることがあります。",
    whyItHappens:
      "カッサや強いもみほぐし・吸い玉など、毛細血管や筋繊維に強い刺激（微細なダメージ）を与えるケアを受けた後の組織は、表面の痛みが引いていても完全に回復するまでに1週間近くの期間を必要とします。回復途中のデリケートな状態で海水の「冷え」を受けると、血管が急激に縮んで筋肉が強くこわばり、激しい重だるさや痛みとして現れやすくなります。また、潜る直前の熱い長風呂やサウナも血管を広げすぎて水中での体温・血圧調整を乱しやすくなります。",
    countermeasure:
      "カッサや強いもみほぐし等を受ける場合は、海に入る予定日から少なくとも1週間は間を空けることをおすすめします。直前は軽いストレッチ程度にとどめ、潜水前後の熱い長風呂・サウナも控えましょう。",
  },
  {
    id: "autonomic-nerves-panic",
    badge: "体調・習慣 05（重要）",
    title: "「自律神経の乱れ・交感神経優位」が招く息止め低下と水中での危険性",
    whatHappens:
      "普段なら余裕で止められるはずの息が極端に短くなり（いつもの1/3〜1/5程度になることも）、潜った直後に急激な息苦しさに襲われます。さらに「海の中（すぐには息が吸えない・休めない場所）」という状況から強い不安や恐怖が押し寄せ、気持ちが乱れてパニックや溺水につながる危険があります。",
    whyItHappens:
      "素潜りで長く楽に息が持つのは、リラックス状態（副交感神経が優位）で心拍数がゆっくりになり、酸素の消費が抑えられるためです。しかし当日の緊張・睡眠不足・波酔いだけでなく、1〜2日前のハードな運動・夜更かし・多忙な生活などで「交感神経（戦闘・緊張モード）」が優位な状態が続いていると、基礎心拍数が下がらず酸素を急速に消費してしまいます。さらに息苦しさ（二酸化炭素）への耐性も大幅に落ちるため、想像以上に早い段階で強い苦しさと動悸が引き起こされます。",
    countermeasure:
      "普段から常に交感神経が優位な状態で生活している方や、自律神経が乱れやすい方にとって、最も大切な安全対策は「深く潜る技術」よりも「心身をゆるめてリラックスすること」です。海に入る1〜2日前から睡眠と休息をとって神経を休め、当日もまずは水面で浮きながら「吐く息を長くする穏やかな呼吸」で全身の力を抜く時間を十分にとりましょう。少しでも「今日は息が浅い・心が落ち着かない」と感じたら、無理に潜らない判断が命を守ります。",
  },
  {
    id: "alcohol-smoking-nasal",
    badge: "体調・習慣 06",
    title: "「前日の深酒・喫煙」と「鼻づまり時の無理な潜水」",
    whatHappens:
      "耳抜きが抜けない、浮上する時に耳の奥が激しく痛んでめまいがする（リバースブロック）、少し動いただけで息が切れるといったトラブルが起きやすくなります。",
    whyItHappens:
      "朝にはお酒が抜けているつもりでも、翌日は体内の水分不足と鼻の奥のむくみが残りやすく、耳抜きの通り道が狭くなっています。また鼻炎や風邪で鼻が詰まっている時に無理をして潜ると、水中で空気の通り道が塞がって浮上時に耳の空気が抜けなくなる危険があります。喫煙も血液が運べる酸素を減らし息切れを早めます。",
    countermeasure:
      "潜る前日の深酒は避け、鼻が詰まっている日は無理に頭まで潜らず、水面からのスノーケリングに切り替えましょう。",
  },
  {
    id: "sleep-phone-spiral",
    badge: "体調・習慣 07",
    title: "「寝不足・移動中のスマホ凝視」と「不調時の無理な潜降」",
    whatHappens:
      "水中で急に脈が速くなる、首や肩が強く張る、エントリーして5分〜10分で激しい波酔いと嘔吐に襲われるといった悪循環に陥りやすくなります。",
    whyItHappens:
      "寝不足や、車内・船上でのスマホ画面の凝視は、目と首の筋肉を緊張させ、海に入る前から酔いやすく脈も落ち着かない状態を作ります。また首周りがキツすぎるウェットスーツも息苦しさを招きます。こうした不調が重なった状態で「息が止まらないのに無理をして潜る」と、水中で焦りから心拍数が急上昇し、肩の強い張りや激しい波酔いが一気に連鎖します。",
    countermeasure:
      "移動中はスマホを置いて遠くの景色を見て目を休めましょう。そして海に入って「今日は息が続かない・肩が重い」と感じたら、無理に潜らず浅場でゆっくり過ごすか早めに上がるのが一番の安全策です。",
  },
  {
    id: "hyperventilation-ban",
    badge: "体調・習慣 08（最重要）",
    title: "潜る直前の「大きく速い深呼吸の繰り返し（過呼吸）」は絶対NG",
    whatHappens:
      "水中や浮上間際に「苦しい」という感覚がほとんどないまま、突然前触れなく意識を失う（ブラックアウト）重大な事故につながります。",
    whyItHappens:
      "息を長く止めようとして「スー、ハー、スー、ハー」と深く速い呼吸を繰り返しても、体内の酸素はほとんど増えません。その代わり、脳に「そろそろ息を吸おう」と知らせる二酸化炭素のサインだけが極端に減ってしまうため、苦しさを感じないまま酸素だけが尽きてしまいます。",
    countermeasure:
      "海で潜る前も、自宅での息止めトレーニングでも、事前の呼吸は「いつも通りの静かで穏やかな呼吸」を徹底してください。",
  },
];

export default function GuideSection() {
  const allIds = [...CHAPTER_1, ...CHAPTER_2].map((i) => i.id);
  const [openIds, setOpenIds] = useState<string[]>(["mesh-and-reef", "heavy-food-dairy"]);

  const toggle = (id: string) =>
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allOpen = openIds.length === allIds.length;

  return (
    <div className="space-y-8">
      {/* イントロヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sky-100 bg-white p-5 shadow-md sm:p-6">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 sm:text-xl">
            沖縄の海況のしくみ ＆ スキンダイバーの体調管理読本
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            「なぜこのポイントは揺れるのか」という地形のしくみと、「なぜ今日に限って波酔いするのか・息が続かないのか」という現場の実体験に基づくコンディション管理をまとめています。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenIds(allOpen ? [] : allIds)}
          className="rounded-full bg-sky-50 px-4 py-2 text-xs font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-100"
        >
          {allOpen ? "すべて折りたたむ" : "すべて開いて読む"}
        </button>
      </div>

      {/* 第1章 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Waves className="h-5 w-5 text-sky-600" />
          <h3 className="text-base font-extrabold text-slate-800 sm:text-lg">
            第1章：沖縄の海況と地形のしくみ（4項目）
          </h3>
        </div>
        <div className="space-y-3">
          {CHAPTER_1.map((item) => (
            <GuideCard key={item.id} item={item} open={openIds.includes(item.id)} onToggle={() => toggle(item.id)} tone="sky" />
          ))}
        </div>
      </section>

      {/* 第2章 */}
      <section className="space-y-3">
        <div className="px-1">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-teal-600" />
            <h3 className="text-base font-extrabold text-slate-800 sm:text-lg">
              第2章：潜る前・当日の「身体コンディションと避けるべき習慣」（8項目）
            </h3>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            ※ダイバーの実体験と一般的なコンディション管理の知恵をまとめた読み物であり、医療・栄養・薬学上の診断や助言を行うものではありません。
          </p>
        </div>
        <div className="space-y-3">
          {CHAPTER_2.map((item) => (
            <GuideCard key={item.id} item={item} open={openIds.includes(item.id)} onToggle={() => toggle(item.id)} tone="teal" />
          ))}
        </div>
      </section>
    </div>
  );
}

function GuideCard({
  item,
  open,
  onToggle,
  tone,
}: {
  item: GuideItem;
  open: boolean;
  onToggle: () => void;
  tone: "sky" | "teal";
}) {
  const badgeCls =
    tone === "sky"
      ? "bg-sky-50 text-sky-700 ring-sky-200"
      : item.id === "hyperventilation-ban"
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : "bg-teal-50 text-teal-700 ring-teal-200";

  return (
    <article className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-md transition hover:border-sky-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
      >
        <div className="min-w-0">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${badgeCls}`}>
            {item.badge}
          </span>
          <h4 className="mt-1.5 text-sm font-bold leading-snug text-slate-800 sm:text-base">{item.title}</h4>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180 text-sky-600" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 pb-5 pt-4 text-xs leading-relaxed text-slate-700 sm:px-6 sm:text-sm">
          <div className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-200/80">
            <p className="flex items-center gap-1.5 font-bold text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
              起きやすいこと
            </p>
            <p className="mt-1 text-slate-700">{item.whatHappens}</p>
          </div>

          <div className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-200/80">
            <p className="flex items-center gap-1.5 font-bold text-sky-800">
              <HelpCircle className="h-4 w-4 shrink-0 text-sky-500" />
              理由・しくみ
            </p>
            <p className="mt-1 text-slate-700">{item.whyItHappens}</p>
          </div>

          <div className="rounded-2xl bg-emerald-50/60 p-3.5 ring-1 ring-emerald-200/80">
            <p className="flex items-center gap-1.5 font-bold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              対策・目安
            </p>
            <p className="mt-1 text-emerald-950">{item.countermeasure}</p>
          </div>
        </div>
      )}
    </article>
  );
}

