"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, AlertTriangle, Zap, CheckCircle2, Footprints, HelpCircle,
} from "lucide-react";

type Mode = "o2" | "co2" | "stretch";
type RestRule = "equal" | "x1.5" | "x2" | "fixed60" | "fixed90" | "fixed120";
type PhaseType = "prepare" | "hold" | "exhale" | "vacuum";

interface RoundStep {
  round: number;
  breatheSec: number;
  holdSec: number;
  exhaleSec?: number;
}

const STATS_KEY = "okinawa-skindiving:apnea-stats:v1";

/** O2テーブルの開始時間プリセット（ここから+15秒ずつ5セット） */
const O2_START_PRESETS = [
  { start: 30, label: "0:30 → 1:30" },
  { start: 60, label: "1:00 → 2:00" },
  { start: 90, label: "1:30 → 2:30" },
  { start: 120, label: "2:00 → 3:00" },
  { start: 150, label: "2:30 → 3:30" },
  { start: 180, label: "3:00 → 4:00" },
  { start: 210, label: "3:30 → 4:30" },
  { start: 240, label: "4:00 → 5:00" },
];

const CO2_HOLD_PRESETS = [
  { hold: 45, label: "0:45（入門）" },
  { hold: 60, label: "1:00（初級）" },
  { hold: 75, label: "1:15（初中級）" },
  { hold: 90, label: "1:30（中級）" },
  { hold: 105, label: "1:45（中上級）" },
  { hold: 120, label: "2:00（上級）" },
];

const REST_RULES: { id: RestRule; label: string; desc: string }[] = [
  { id: "equal", label: "等倍（×1.0）", desc: "前の息止めと同じ時間だけ休む" },
  { id: "x1.5", label: "1.5倍", desc: "前の息止めの1.5倍休む（上限2:30）" },
  { id: "x2", label: "2倍", desc: "前の息止めの2倍休む（上限3:00）" },
  { id: "fixed60", label: "固定 1:00", desc: "毎回1分間の固定休憩" },
  { id: "fixed90", label: "固定 1:30", desc: "毎回1分30秒の固定休憩" },
  { id: "fixed120", label: "固定 2:00", desc: "毎回2分間の固定休憩（定番）" },
];

function fmt(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function ApneaTrainer() {
  const [mode, setMode] = useState<Mode>("o2");
  const [o2StartSec, setO2StartSec] = useState(60); // デフォルト 1:00 → 2:00
  const [restRule, setRestRule] = useState<RestRule>("equal");
  const [prepSec, setPrepSec] = useState(45);
  const [co2HoldSec, setCo2HoldSec] = useState(75);
  const [co2Sets, setCo2Sets] = useState<6 | 8>(6);
  const [stretchSets, setStretchSets] = useState<4 | 5>(4);

  const [soundOn, setSoundOn] = useState(true);
  const [walkPaceOn, setWalkPaceOn] = useState(false);

  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [roundIdx, setRoundIdx] = useState(0);
  const [phase, setPhase] = useState<PhaseType>("prepare");
  const [remaining, setRemaining] = useState(45);
  const [phaseTotal, setPhaseTotal] = useState(45);
  const [contractions, setContractions] = useState<Record<number, number>>({});
  const [totalSessions, setTotalSessions] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(STATS_KEY) ?? "0");
      if (Number.isFinite(saved) && saved > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTotalSessions(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** ラウンド一覧の生成 */
  const schedule = useMemo<RoundStep[]>(() => {
    if (mode === "o2") {
      // 5セット: start, start+15, start+30, start+45, start+60
      return Array.from({ length: 5 }, (_, idx) => {
        const holdSec = o2StartSec + idx * 15;
        const prevHold = idx === 0 ? o2StartSec : o2StartSec + (idx - 1) * 15;
        let breatheSec = prepSec;
        if (idx > 0) {
          if (restRule === "equal") breatheSec = prevHold;
          else if (restRule === "x1.5") breatheSec = Math.min(150, Math.round((prevHold * 1.5) / 5) * 5);
          else if (restRule === "x2") breatheSec = Math.min(180, prevHold * 2);
          else if (restRule === "fixed60") breatheSec = 60;
          else if (restRule === "fixed90") breatheSec = 90;
          else breatheSec = 120;
        }
        return { round: idx + 1, breatheSec, holdSec };
      });
    }
    if (mode === "co2") {
      // 息止め一定、休憩を1:45から15秒ずつ短縮（最低0:30）
      return Array.from({ length: co2Sets }, (_, idx) => {
        const breatheSec = Math.max(30, 105 - idx * 15);
        return { round: idx + 1, breatheSec, holdSec: co2HoldSec };
      });
    }
    // stretch: 呼吸20秒 → 吐き切り10秒 → 引き込みキープ15秒
    return Array.from({ length: stretchSets }, (_, idx) => ({
      round: idx + 1,
      breatheSec: idx === 0 ? 15 : 20,
      exhaleSec: 10,
      holdSec: 15,
    }));
  }, [mode, o2StartSec, restRule, prepSec, co2HoldSec, co2Sets, stretchSets]);

  const totalWorkoutSec = useMemo(
    () => schedule.reduce((acc, s) => acc + s.breatheSec + (s.exhaleSec ?? 0) + s.holdSec, 0),
    [schedule]
  );

  /** ビープ音 */
  const playBeep = useCallback(
    (freq = 660, durationMs = 110, gainVal = 0.12) => {
      if (!soundOn || typeof window === "undefined") return;
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = gainVal;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + durationMs / 1000);
      } catch {
        /* ignore audio error */
      }
    },
    [soundOn]
  );

  /** 日本語音声ガイド */
  const speak = useCallback(
    (text: string) => {
      if (!soundOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
      } catch {
        /* ignore */
      }
    },
    [soundOn]
  );

  /** 設定変更時のリセット */
  const resetTimer = useCallback(() => {
    setRunning(false);
    setCompleted(false);
    setRoundIdx(0);
    setPhase("prepare");
    const first = schedule[0]?.breatheSec ?? 45;
    setRemaining(first);
    setPhaseTotal(first);
    setContractions({});
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [schedule]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetTimer();
  }, [resetTimer]);

  /** 1秒ごとのカウントダウン進行 */
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev > 1) {
          const next = prev - 1;
          // カウントダウン通知
          if (next === 30) speak("30秒前");
          else if (next === 15 && phaseTotal >= 25) speak("15秒前");
          else if (next === 10 && phaseTotal >= 20) speak("10秒前");
          else if (next <= 5 && next >= 1) {
            playBeep(520, 90, 0.14);
          } else if (phase === "hold" && walkPaceOn) {
            // 歩行ペース用メトロノーム音（1秒1歩）
            playBeep(360, 35, 0.06);
          }
          return next;
        }

        // フェーズ切り替え
        const curStep = schedule[roundIdx];
        if (!curStep) return 0;

        if (mode === "stretch") {
          if (phase === "prepare") {
            setPhase("exhale");
            setPhaseTotal(curStep.exhaleSec ?? 10);
            playBeep(620, 200, 0.18);
            speak("息をゆっくり全て吐き切ってください");
            return curStep.exhaleSec ?? 10;
          }
          if (phase === "exhale") {
            setPhase("vacuum");
            setPhaseTotal(curStep.holdSec);
            playBeep(820, 240, 0.2);
            speak("息を止めて、お腹を引き込みキープ");
            return curStep.holdSec;
          }
        } else if (phase === "prepare") {
          setPhase("hold");
          setPhaseTotal(curStep.holdSec);
          playBeep(820, 240, 0.2);
          speak("息を止めてください");
          return curStep.holdSec;
        }

        // 次のラウンドへ、または完了
        if (roundIdx + 1 < schedule.length) {
          const nextStep = schedule[roundIdx + 1];
          setRoundIdx(roundIdx + 1);
          setPhase("prepare");
          setPhaseTotal(nextStep.breatheSec);
          playBeep(580, 240, 0.2);
          speak("呼吸を再開してください");
          return nextStep.breatheSec;
        } else {
          setRunning(false);
          setCompleted(true);
          playBeep(880, 350, 0.22);
          speak("トレーニング完了です。お疲れ様でした");
          setTotalSessions((s) => {
            const nextCount = s + 1;
            try {
              localStorage.setItem(STATS_KEY, String(nextCount));
            } catch {
              /* ignore */
            }
            return nextCount;
          });
          return 0;
        }
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, phase, phaseTotal, roundIdx, schedule, mode, walkPaceOn, playBeep, speak]);

  const elapsedInHold = phase === "hold" || phase === "vacuum" ? phaseTotal - remaining : 0;
  const progress = phaseTotal > 0 ? ((phaseTotal - remaining) / phaseTotal) * 100 : 0;

  const toggleRun = () => {
    if (completed) {
      resetTimer();
      return;
    }
    if (!running) {
      playBeep(660, 80, 0.1);
      if (roundIdx === 0 && remaining === phaseTotal) {
        speak(
          mode === "stretch"
            ? "ストレッチを開始します。ゆっくり呼吸してください"
            : "トレーニングを開始します。力を抜いて呼吸してください"
        );
      }
    }
    setRunning((r) => !r);
  };

  const recordContraction = () => {
    if (phase !== "hold") return;
    setContractions((prev) => ({ ...prev, [roundIdx + 1]: elapsedInHold }));
    playBeep(740, 70, 0.1);
  };

  return (
    <div className="space-y-6">
      {/* 安全警告バナー */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs leading-relaxed text-amber-900 shadow-xs">
        <p className="flex items-start gap-2 font-bold text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>安全上の絶対ルール（始める前に必ずご確認ください）</span>
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-[11px] text-amber-800 sm:text-xs">
          <li>
            必ず<b>陸上の安全な場所（ベッド・ソファ・カーペットの上など）</b>で行い、水中・浴槽・運転中・階段付近では絶対に実施しないでください。
          </li>
          <li>
            事前の大きく速い深呼吸の繰り返し（<b>過呼吸／ハイパーベンチレーション</b>）は、前触れのない意識喪失（ブラックアウト）の原因となるため厳禁です。
          </li>
          <li>
            歩行しながら行う場合は、転倒やふらつきに備えて周囲に角や障害物のない平坦な室内で、無理のない範囲（自己責任）で行ってください。
          </li>
        </ul>
      </div>

      {/* メニュー選択タブ */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="tablist" aria-label="トレーニング種別">
        {(
          [
            {
              id: "o2",
              title: "① O2テーブル（5セット延長）",
              sub: "0:30→1:30〜4:00→5:00まで15秒ずつ息止めを伸ばす実践メニュー",
            },
            {
              id: "co2",
              title: "② CO2耐性テーブル（休憩短縮）",
              sub: "息止め時間は一定のまま、休憩を少しずつ短くして苦しさに慣れるメニュー",
            },
            {
              id: "stretch",
              title: "③ 横隔膜・胸郭ストレッチ",
              sub: "息を吐き切ってお腹を引き込む固定ワークタイム（約3分半）",
            },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-2xl border p-3.5 text-left transition ${
              mode === m.id
                ? "border-sky-400 bg-sky-50/80 shadow-sm ring-2 ring-sky-200"
                : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/30"
            }`}
          >
            <p className="text-sm font-bold text-slate-800">{m.title}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">{m.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        {/* 左カラム: タイマー本体 */}
        <section className="flex flex-col items-center justify-between rounded-3xl border border-sky-100 bg-white p-5 shadow-xl sm:p-7">
          <div className="flex w-full items-center justify-between text-xs text-slate-500">
            <span>
              セット <b className="font-mono text-base text-slate-800">{roundIdx + 1}</b> / {schedule.length}
              <span className="ml-2 text-slate-400">（全体 {fmt(totalWorkoutSec)}）</span>
            </span>
            <div className="flex items-center gap-1.5">
              {mode !== "stretch" && (
                <button
                  type="button"
                  onClick={() => setWalkPaceOn((w) => !w)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                    walkPaceOn
                      ? "bg-teal-50 text-teal-700 ring-teal-300"
                      : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100"
                  }`}
                  title="息止め中に1秒1歩のペース音を鳴らし、歩数（秒数）を表示します"
                >
                  <Footprints className="h-3.5 w-3.5" />
                  歩行ペース音 {walkPaceOn ? "ON" : "OFF"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSoundOn((s) => !s)}
                aria-label={soundOn ? "音声ガイドをミュート" : "音声ガイドをオン"}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                  soundOn
                    ? "bg-sky-50 text-sky-700 ring-sky-200"
                    : "bg-slate-100 text-slate-500 ring-slate-200"
                }`}
              >
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {soundOn ? "音ON" : "消音"}
              </button>
            </div>
          </div>

          {/* 円形プログレスタイマー */}
          <div className="relative my-5 flex h-60 w-60 items-center justify-center sm:h-68 sm:w-68">
            <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
              <circle cx="110" cy="110" r="96" className="fill-none stroke-slate-100" strokeWidth="12" />
              <circle
                cx="110"
                cy="110"
                r="96"
                strokeDasharray={2 * Math.PI * 96}
                strokeDashoffset={2 * Math.PI * 96 * (1 - progress / 100)}
                strokeLinecap="round"
                className={`fill-none transition-all duration-500 ${
                  completed
                    ? "stroke-emerald-500"
                    : phase === "hold" || phase === "vacuum"
                      ? "stroke-amber-500"
                      : phase === "exhale"
                        ? "stroke-teal-500"
                        : "stroke-sky-500"
                }`}
                strokeWidth="12"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                  completed
                    ? "bg-emerald-50 text-emerald-700"
                    : phase === "hold"
                      ? "bg-amber-100 text-amber-800"
                      : phase === "vacuum"
                        ? "bg-amber-100 text-amber-800"
                        : phase === "exhale"
                          ? "bg-teal-50 text-teal-700"
                          : "bg-sky-50 text-sky-700"
                }`}
              >
                {completed
                  ? "🎉 完了！"
                  : phase === "hold"
                    ? "🟧 息止め（ホールド）"
                    : phase === "vacuum"
                      ? "🟧 息止め＋横隔膜引き上げ"
                      : phase === "exhale"
                        ? "🟩 息をすべて吐き切る"
                        : "🟦 呼吸・リラックス"}
              </span>
              <p className="mt-2 font-mono text-6xl font-black tracking-tight text-slate-800">
                {fmt(remaining)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {phase === "hold" || phase === "vacuum" ? (
                  <>
                    経過 <b className="font-mono text-slate-700">{fmt(elapsedInHold)}</b>
                    {walkPaceOn && phase === "hold" && (
                      <span className="ml-1.5 font-semibold text-teal-700">（目安 {elapsedInHold}歩）</span>
                    )}
                  </>
                ) : (
                  <>次の息止め：{fmt(schedule[roundIdx]?.holdSec ?? 0)}</>
                )}
              </p>
            </div>
          </div>

          {/* コントラクション記録ボタン（息止め中のみアクティブ） */}
          {mode !== "stretch" && (
            <button
              type="button"
              disabled={phase !== "hold"}
              onClick={recordContraction}
              className="mb-3 flex w-full max-w-xs items-center justify-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-40"
            >
              <Zap className="h-3.5 w-3.5" />
              {contractions[roundIdx + 1] !== undefined
                ? `最初の苦しさ記録済み：${fmt(contractions[roundIdx + 1])}（再タップで上書き）`
                : "息止め中に「最初の苦しさ」が来たらタップ"}
            </button>
          )}

          {/* 開始・一時停止・リセットボタン */}
          <div className="flex w-full max-w-xs items-center gap-3">
            <button
              type="button"
              onClick={toggleRun}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold text-white shadow-md transition active:scale-98 ${
                running
                  ? "bg-amber-500 hover:bg-amber-600"
                  : "bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600"
              }`}
            >
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {completed ? "もう一度行う" : running ? "一時停止" : "スタート"}
            </button>
            <button
              type="button"
              onClick={resetTimer}
              aria-label="リセット"
              className="flex items-center justify-center gap-1 rounded-2xl bg-slate-100 px-4 py-3.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              <RotateCcw className="h-4 w-4" />
              リセット
            </button>
          </div>

          <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            この端末での累計クリア回数：<b className="font-mono text-slate-600">{totalSessions}</b> 回
          </p>
        </section>

        {/* 右カラム: 時間・休憩設定 ＋ セット一覧表 */}
        <section className="space-y-4 rounded-3xl border border-sky-100 bg-white p-5 shadow-xl sm:p-6">
          {mode === "o2" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">1. 息止めタイムを選択（15秒刻み×5セット）</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  1セット目から5セット目まで、15秒ずつ息止め時間が伸びていきます。
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {O2_START_PRESETS.map((p) => (
                    <button
                      key={p.start}
                      type="button"
                      disabled={running}
                      onClick={() => setO2StartSec(p.start)}
                      className={`rounded-xl px-2.5 py-2 font-mono text-xs font-bold transition ${
                        o2StartSec === p.start
                          ? "bg-sky-500 text-white shadow-xs"
                          : "bg-sky-50 text-slate-700 hover:bg-sky-100"
                      } disabled:opacity-50`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  <span>
                    現在：<b>{fmt(o2StartSec)}</b> 開始 → 最終 <b>{fmt(o2StartSec + 60)}</b>
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={running || o2StartSec <= 15}
                      onClick={() => setO2StartSec((s) => Math.max(15, s - 15))}
                      className="rounded-lg bg-white px-2.5 py-1 font-mono font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-sky-50 disabled:opacity-40"
                    >
                      -15秒
                    </button>
                    <button
                      type="button"
                      disabled={running || o2StartSec >= 300}
                      onClick={() => setO2StartSec((s) => Math.min(300, s + 15))}
                      className="rounded-lg bg-white px-2.5 py-1 font-mono font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-sky-50 disabled:opacity-40"
                    >
                      +15秒
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800">2. セット間の休憩（呼吸）時間ルール</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  一般的には「前の息止め時間と同じ（等倍）〜2倍」または「固定1分30秒〜2分」が目安です。
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {REST_RULES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={running}
                      onClick={() => setRestRule(r.id)}
                      title={r.desc}
                      className={`rounded-xl px-2.5 py-2 text-left text-xs transition ${
                        restRule === r.id
                          ? "bg-teal-500 font-bold text-white shadow-xs"
                          : "bg-slate-50 font-semibold text-slate-700 hover:bg-teal-50"
                      } disabled:opacity-50`}
                    >
                      <div>{r.label}</div>
                      <div className={`text-[10px] font-normal ${restRule === r.id ? "text-teal-50" : "text-slate-400"}`}>
                        {r.desc}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <span>1セット目の前の準備呼吸：</span>
                  {[30, 45, 60, 90].map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={running}
                      onClick={() => setPrepSec(s)}
                      className={`rounded-lg px-2 py-1 font-mono text-xs font-semibold ${
                        prepSec === s ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      } disabled:opacity-50`}
                    >
                      {fmt(s)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === "co2" && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-sky-50/70 p-3 text-xs leading-relaxed text-slate-600">
                <p className="flex items-center gap-1 font-bold text-sky-800">
                  <HelpCircle className="h-3.5 w-3.5" /> CO2耐性テーブルとは？
                </p>
                <p className="mt-1">
                  息止め時間は毎回同じ（無理のない秒数）に固定し、間の休憩時間を <b>1:45 → 1:30 → 1:15 → 1:00 → 0:45 → 0:30</b> と少しずつ短くしていく方法です。長い時間息を止めなくても、後半の「早く息を吸いたい感覚」に落ち着いて対処する練習ができます。
                </p>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">固定する息止め時間を選択（自己ベストの50〜60%が目安）</h3>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {CO2_HOLD_PRESETS.map((p) => (
                    <button
                      key={p.hold}
                      type="button"
                      disabled={running}
                      onClick={() => setCo2HoldSec(p.hold)}
                      className={`rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                        co2HoldSec === p.hold
                          ? "bg-sky-500 text-white shadow-xs"
                          : "bg-sky-50 text-slate-700 hover:bg-sky-100"
                      } disabled:opacity-50`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span>セット数：</span>
                    {([6, 8] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={running}
                        onClick={() => setCo2Sets(n)}
                        className={`rounded-lg px-2.5 py-1 font-semibold ${
                          co2Sets === n ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-600"
                        } disabled:opacity-50`}
                      >
                        {n}セット
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={running || co2HoldSec <= 30}
                      onClick={() => setCo2HoldSec((s) => Math.max(30, s - 15))}
                      className="rounded-lg bg-slate-100 px-2 py-1 font-mono font-bold text-slate-700 disabled:opacity-40"
                    >
                      -15秒
                    </button>
                    <button
                      type="button"
                      disabled={running || co2HoldSec >= 240}
                      onClick={() => setCo2HoldSec((s) => Math.min(240, s + 15))}
                      className="rounded-lg bg-slate-100 px-2 py-1 font-mono font-bold text-slate-700 disabled:opacity-40"
                    >
                      +15秒
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === "stretch" && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-teal-50/70 p-3 text-xs leading-relaxed text-slate-600">
                <p className="font-bold text-teal-800">横隔膜・胸郭ストレッチの流れ（固定ワークタイム）</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  <li>
                    <b>呼吸（20秒）</b>：肩とみぞおちの力を抜いてゆっくり呼吸します。
                  </li>
                  <li>
                    <b>吐き切り（10秒）</b>：口から細く長く、肺の空気を最後まで吐き切ります。
                  </li>
                  <li>
                    <b>引き込みキープ（15秒）</b>：息を止めたまま、お腹をへこませて肋骨の下（横隔膜）を上に引き上げて15秒キープします（※痛みのない気持ちいい範囲で行ってください）。
                  </li>
                </ol>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>反復回数：</span>
                {([4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={running}
                    onClick={() => setStretchSets(n)}
                    className={`rounded-lg px-3 py-1.5 font-semibold ${
                      stretchSets === n ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-600"
                    } disabled:opacity-50`}
                  >
                    {n}セット（約{fmt(n * 45 - 5)}）
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ラウンド一覧テーブル */}
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full text-center text-xs">
              <thead className="bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="py-2 font-semibold">セット</th>
                  <th className="py-2 font-semibold">{mode === "stretch" ? "呼吸 → 吐き切り" : "呼吸（休憩）"}</th>
                  <th className="py-2 font-semibold">{mode === "stretch" ? "引き込みキープ" : "息止め"}</th>
                  {mode !== "stretch" && <th className="py-2 font-semibold">最初の苦しさ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedule.map((s, idx) => {
                  const active = idx === roundIdx && !completed;
                  const done = completed || idx < roundIdx;
                  return (
                    <tr
                      key={s.round}
                      className={active ? "bg-sky-50/90 font-bold text-sky-900" : done ? "bg-emerald-50/30 text-slate-400" : "text-slate-700"}
                    >
                      <td className="py-2 font-mono">
                        #{s.round} {done && "✓"}
                      </td>
                      <td className="py-2 font-mono text-sky-700">
                        {fmt(s.breatheSec)}
                        {s.exhaleSec ? ` → ${fmt(s.exhaleSec)}` : ""}
                      </td>
                      <td className="py-2 font-mono font-bold text-amber-700">
                        {fmt(s.holdSec)}
                        {walkPaceOn && mode !== "stretch" && (
                          <span className="ml-1 text-[10px] font-normal text-teal-600">({s.holdSec}歩)</span>
                        )}
                      </td>
                      {mode !== "stretch" && (
                        <td className="py-2 font-mono text-[11px] text-slate-500">
                          {contractions[s.round] !== undefined ? fmt(contractions[s.round]) : "-"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
