"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Pause, Square, RotateCcw, Volume2, VolumeX, Bell, Clock, Trophy,
  AlertTriangle, Zap, CheckCircle2, HelpCircle,
} from "lucide-react";

type Mode = "o2" | "co2" | "max" | "stretch";
type RestRule = "equal" | "x1.5" | "x2" | "fixed60" | "fixed90" | "fixed120";
type PhaseType = "prepare" | "hold" | "exhale" | "vacuum";
type SoundMode = "voice" | "bell" | "mute";
type MaxNotify = 0 | 30 | 60;

interface RoundStep {
  round: number;
  breatheSec: number;
  holdSec: number;
  exhaleSec?: number;
}

interface MaxRecord {
  date: string;
  holdSec: number;
  contractionSec?: number;
}

const STATS_KEY = "okinawa-skindiving:apnea-stats:v1";
const PREFS_KEY = "okinawa-skindiving:apnea-prefs:v1";
const MAX_KEY = "okinawa-skindiving:apnea-max:v1";

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

/** スマホ横幅1行に綺麗に4つ並ぶ準備呼吸オプション */
const PREP_OPTIONS = [15, 30, 45, 60] as const;
/** 一発計測用の準備カウントダウン4択（短め2つ＋公式風2つ） */
const MAX_PREP_OPTIONS = [15, 30, 90, 120] as const;

function fmt(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function ApneaTrainer() {
  const [mode, setMode] = useState<Mode>("o2");
  const [o2StartSec, setO2StartSec] = useState(60);
  const [restRule, setRestRule] = useState<RestRule>("equal");
  const [prepSec, setPrepSec] = useState<number>(30);
  const [co2HoldSec, setCo2HoldSec] = useState(75);
  const [co2Sets, setCo2Sets] = useState<6 | 8>(6);
  const [stretchSets, setStretchSets] = useState<4 | 5>(4);

  // 一発計測モード用設定
  const [maxPrepSec, setMaxPrepSec] = useState<number>(30);
  const [hideMaxTime, setHideMaxTime] = useState(false);
  const [maxNotify, setMaxNotify] = useState<MaxNotify>(0);
  const [bestHoldSec, setBestHoldSec] = useState(0);
  const [maxHistory, setMaxHistory] = useState<MaxRecord[]>([]);
  const [lastMaxResult, setLastMaxResult] = useState<{ holdSec: number; isNewBest: boolean; contractionSec?: number } | null>(null);

  const [soundMode, setSoundMode] = useState<SoundMode>("voice");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [roundIdx, setRoundIdx] = useState(0);
  const [phase, setPhase] = useState<PhaseType>("prepare");
  const [remaining, setRemaining] = useState(30);
  const [phaseTotal, setPhaseTotal] = useState(30);
  const [maxElapsed, setMaxElapsed] = useState(0);
  const [contractions, setContractions] = useState<Record<number, number>>({});
  const [totalSessions, setTotalSessions] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  // setState updater 内で副作用（音声再生）を呼ばないための進行管理 ref
  const runtimeRef = useRef({
    roundIdx: 0,
    phase: "prepare" as PhaseType,
    remaining: 30,
    phaseTotal: 30,
    maxElapsed: 0,
  });

  // 初回マウント時：保存された設定＆累計回数＆自己ベスト履歴を復元
  useEffect(() => {
    try {
      const savedStats = Number(localStorage.getItem(STATS_KEY) ?? "0");
      if (Number.isFinite(savedStats) && savedStats > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTotalSessions(savedStats);
      }
      const rawMax = localStorage.getItem(MAX_KEY);
      if (rawMax) {
        const parsed = JSON.parse(rawMax);
        if (typeof parsed.bestHoldSec === "number") setBestHoldSec(parsed.bestHoldSec);
        if (Array.isArray(parsed.history)) setMaxHistory(parsed.history.slice(0, 5));
      }
      const rawPrefs = localStorage.getItem(PREFS_KEY);
      if (rawPrefs) {
        const p = JSON.parse(rawPrefs);
        if (p.mode === "o2" || p.mode === "co2" || p.mode === "max" || p.mode === "stretch") setMode(p.mode);
        if (typeof p.o2StartSec === "number" && p.o2StartSec >= 15 && p.o2StartSec <= 300) setO2StartSec(p.o2StartSec);
        if (["equal", "x1.5", "x2", "fixed60", "fixed90", "fixed120"].includes(p.restRule)) setRestRule(p.restRule);
        if (typeof p.prepSec === "number" && [15, 30, 45, 60].includes(p.prepSec)) setPrepSec(p.prepSec);
        if (typeof p.maxPrepSec === "number" && [15, 30, 90, 120].includes(p.maxPrepSec)) setMaxPrepSec(p.maxPrepSec);
        if (typeof p.hideMaxTime === "boolean") setHideMaxTime(p.hideMaxTime);
        if (p.maxNotify === 0 || p.maxNotify === 30 || p.maxNotify === 60) setMaxNotify(p.maxNotify);
        if (typeof p.co2HoldSec === "number" && p.co2HoldSec >= 30 && p.co2HoldSec <= 240) setCo2HoldSec(p.co2HoldSec);
        if (p.co2Sets === 6 || p.co2Sets === 8) setCo2Sets(p.co2Sets);
        if (p.stretchSets === 4 || p.stretchSets === 5) setStretchSets(p.stretchSets);
        if (p.soundMode === "voice" || p.soundMode === "bell" || p.soundMode === "mute") setSoundMode(p.soundMode);
      }
    } catch {
      /* ignore */
    }
    setPrefsLoaded(true);
  }, []);

  // 設定変更時に localStorage へ自動保存
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          mode,
          o2StartSec,
          restRule,
          prepSec,
          maxPrepSec,
          hideMaxTime,
          maxNotify,
          co2HoldSec,
          co2Sets,
          stretchSets,
          soundMode,
        })
      );
    } catch {
      /* ignore */
    }
  }, [
    prefsLoaded, mode, o2StartSec, restRule, prepSec, maxPrepSec,
    hideMaxTime, maxNotify, co2HoldSec, co2Sets, stretchSets, soundMode,
  ]);

  /** ラウンド一覧の生成 */
  const schedule = useMemo<RoundStep[]>(() => {
    if (mode === "max") {
      return [{ round: 1, breatheSec: maxPrepSec, holdSec: 0 }];
    }
    if (mode === "o2") {
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
      return Array.from({ length: co2Sets }, (_, idx) => {
        const breatheSec = idx === 0 ? prepSec : Math.max(30, 120 - idx * 15);
        return { round: idx + 1, breatheSec, holdSec: co2HoldSec };
      });
    }
    return Array.from({ length: stretchSets }, (_, idx) => ({
      round: idx + 1,
      breatheSec: idx === 0 ? 15 : 20,
      exhaleSec: 10,
      holdSec: 15,
    }));
  }, [mode, o2StartSec, restRule, prepSec, maxPrepSec, co2HoldSec, co2Sets, stretchSets]);

  const totalWorkoutSec = useMemo(
    () => schedule.reduce((acc, s) => acc + s.breatheSec + (s.exhaleSec ?? 0) + s.holdSec, 0),
    [schedule]
  );

  /**
   * ベル音モード専用トーン（音声ガイドモード時は AudioContext を一切起動しないことで
   * Android / Pixel の TTS と WebAudio の干渉によるガビガビ音割れを根本から防ぐ）
   */
  const playBell = useCallback(
    (freq = 587.33, durationMs = 150) => {
      if (soundMode !== "bell" || typeof window === "undefined") return;
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume();

        const now = ctx.currentTime;
        const dur = durationMs / 1000;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + dur + 0.01);
      } catch {
        /* ignore audio error */
      }
    },
    [soundMode]
  );

  /**
   * ガイド通知
   * - voiceモード時: AudioContextを使わず、OS標準のネイティブTTS（volume/rate無加工）で1回だけ発声
   * - bellモード時: ベル音のみ
   */
  const notify = useCallback(
    (text: string, bellFreq = 784) => {
      if (soundMode === "mute" || typeof window === "undefined") return;
      if (soundMode === "bell" || !("speechSynthesis" in window)) {
        playBell(bellFreq, 200);
        return;
      }
      try {
        // 発話中のときだけ cancel し、volume/rate はスマホ標準(1.0)のまま無加工で渡すことでリサンプリング音割れを防ぐ
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        window.speechSynthesis.speak(u);
      } catch {
        /* ignore */
      }
    },
    [soundMode, playBell]
  );

  /** 設定変更時のリセット */
  const resetTimer = useCallback(() => {
    setRunning(false);
    setCompleted(false);
    const first = schedule[0]?.breatheSec ?? 30;
    runtimeRef.current = {
      roundIdx: 0,
      phase: "prepare",
      remaining: first,
      phaseTotal: first,
      maxElapsed: 0,
    };
    setRoundIdx(0);
    setPhase("prepare");
    setRemaining(first);
    setPhaseTotal(first);
    setMaxElapsed(0);
    setContractions({});
    setLastMaxResult(null);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    }
  }, [schedule]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetTimer();
  }, [resetTimer]);

  /** 一発計測のストップ（記録確定） */
  const finishMaxHold = useCallback(() => {
    if (mode !== "max" || runtimeRef.current.phase !== "hold") return;
    setRunning(false);
    setCompleted(true);
    const finalSec = runtimeRef.current.maxElapsed;
    const cSec = contractions[1];
    const isNewBest = finalSec > bestHoldSec && finalSec >= 5;
    const nextBest = isNewBest ? finalSec : bestHoldSec;

    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const newRec: MaxRecord = { date: dateStr, holdSec: finalSec, contractionSec: cSec };
    const nextHist = [newRec, ...maxHistory].slice(0, 5);

    setBestHoldSec(nextBest);
    setMaxHistory(nextHist);
    setLastMaxResult({ holdSec: finalSec, isNewBest, contractionSec: cSec });

    try {
      localStorage.setItem(MAX_KEY, JSON.stringify({ bestHoldSec: nextBest, history: nextHist }));
      const nextCount = totalSessions + 1;
      setTotalSessions(nextCount);
      localStorage.setItem(STATS_KEY, String(nextCount));
    } catch {
      /* ignore */
    }

    const min = Math.floor(finalSec / 60);
    const sec = finalSec % 60;
    const spoken = min > 0 ? `${min}分${sec > 0 ? `${sec}秒` : ""}` : `${sec}秒`;
    notify(`計測終了。記録は${spoken}です`, 880);
  }, [mode, contractions, bestHoldSec, maxHistory, totalSessions, notify]);

  /**
   * 1秒ごとのタイマー進行
   * （React の setState updater 関数内で音声再生を呼ばないよう runtimeRef で1秒に1回だけ確実に処理する）
   */
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const rt = runtimeRef.current;

      // 一発計測モードのホールド中（カウントアップ）
      if (mode === "max" && rt.phase === "hold") {
        const next = rt.maxElapsed + 1;
        rt.maxElapsed = next;
        setMaxElapsed(next);
        if (maxNotify > 0 && next % maxNotify === 0) {
          const m = Math.floor(next / 60);
          const s = next % 60;
          const label = m > 0 ? `${m}分${s > 0 ? `${s}秒` : ""}経過` : `${s}秒経過`;
          notify(label, 659.25);
        }
        return;
      }

      // カウントダウン中（残り2秒以上）
      if (rt.remaining > 1) {
        const next = rt.remaining - 1;
        rt.remaining = next;
        setRemaining(next);

        if (next === 90 && rt.phaseTotal >= 110) notify("1分30秒前", 523.25);
        else if (next === 60 && rt.phaseTotal >= 80) notify("1分前", 523.25);
        else if (next === 30 && rt.phaseTotal >= 45) notify("30秒前", 523.25);
        else if (next === 15 && rt.phaseTotal >= 25) notify("15秒前", 523.25);
        else if (next === 10 && rt.phaseTotal >= 20) notify("10秒前", 523.25);
        else if (next === 5) notify("5秒前", 523.25);
        else if (soundMode === "bell" && next <= 3 && next >= 1) {
          playBell(523.25, 100);
        }
        return;
      }

      // 残り1秒 → 次のフェーズへ切り替え
      const curStep = schedule[rt.roundIdx];
      if (!curStep) return;

      if (mode === "max" && rt.phase === "prepare") {
        rt.phase = "hold";
        rt.maxElapsed = 0;
        setPhase("hold");
        setMaxElapsed(0);
        notify("スタート", 783.99);
        return;
      }

      if (mode === "stretch") {
        if (rt.phase === "prepare") {
          const ex = curStep.exhaleSec ?? 10;
          rt.phase = "exhale";
          rt.phaseTotal = ex;
          rt.remaining = ex;
          setPhase("exhale");
          setPhaseTotal(ex);
          setRemaining(ex);
          notify("息を吐き切ってください", 659.25);
          return;
        }
        if (rt.phase === "exhale") {
          rt.phase = "vacuum";
          rt.phaseTotal = curStep.holdSec;
          rt.remaining = curStep.holdSec;
          setPhase("vacuum");
          setPhaseTotal(curStep.holdSec);
          setRemaining(curStep.holdSec);
          notify("息を止めてキープ", 783.99);
          return;
        }
      } else if (rt.phase === "prepare") {
        rt.phase = "hold";
        rt.phaseTotal = curStep.holdSec;
        rt.remaining = curStep.holdSec;
        setPhase("hold");
        setPhaseTotal(curStep.holdSec);
        setRemaining(curStep.holdSec);
        notify("息を止めてください", 783.99);
        return;
      }

      // 次のラウンドへ、または完了
      if (rt.roundIdx + 1 < schedule.length) {
        const nextIdx = rt.roundIdx + 1;
        const nextStep = schedule[nextIdx];
        rt.roundIdx = nextIdx;
        rt.phase = "prepare";
        rt.phaseTotal = nextStep.breatheSec;
        rt.remaining = nextStep.breatheSec;
        setRoundIdx(nextIdx);
        setPhase("prepare");
        setPhaseTotal(nextStep.breatheSec);
        setRemaining(nextStep.breatheSec);
        notify("呼吸してください", 587.33);
      } else {
        rt.remaining = 0;
        setRemaining(0);
        setRunning(false);
        setCompleted(true);
        notify("トレーニング完了です。お疲れ様でした", 880);
        setTotalSessions((s) => {
          const nextCount = s + 1;
          try {
            localStorage.setItem(STATS_KEY, String(nextCount));
          } catch {
            /* ignore */
          }
          return nextCount;
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, schedule, mode, maxNotify, soundMode, playBell, notify]);

  const elapsedInHold =
    mode === "max"
      ? maxElapsed
      : phase === "hold" || phase === "vacuum"
        ? phaseTotal - remaining
        : 0;

  const progress =
    mode === "max" && phase === "hold"
      ? ((maxElapsed % 60) / 60) * 100
      : phaseTotal > 0
        ? ((phaseTotal - remaining) / phaseTotal) * 100
        : 0;

  const toggleRun = () => {
    if (completed) {
      resetTimer();
      return;
    }
    if (!running) {
      const rt = runtimeRef.current;
      if (rt.roundIdx === 0 && rt.phase === "prepare" && rt.remaining === rt.phaseTotal) {
        notify(
          mode === "stretch"
            ? "ストレッチを開始します"
            : mode === "max"
              ? "カウントダウンを開始します"
              : "スタートします",
          659.25
        );
      }
    }
    setRunning((r) => !r);
  };

  const recordContraction = () => {
    if (phase !== "hold") return;
    setContractions((prev) => ({ ...prev, [roundIdx + 1]: elapsedInHold }));
  };

  const cycleSoundMode = () => {
    // モード切替時に残っている音声をクリア
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSoundMode((prev) => (prev === "voice" ? "bell" : prev === "bell" ? "mute" : "voice"));
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
            必ず<b>陸上の安全な場所（ベッド・ソファ・カーペットの上など）</b>で行い、水中・浴槽・運転中などでは絶対に実施しないでください。
          </li>
          <li>
            事前の大きく速い深呼吸の繰り返し（<b>過呼吸／ハイパーベンチレーション</b>）は、前触れのない意識喪失（ブラックアウト）の原因となるため厳禁です。
          </li>
        </ul>
      </div>

      {/* メニュー選択タブ（4モード） */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="トレーニング種別">
        {(
          [
            {
              id: "o2",
              title: "① O2テーブル",
              sub: "5セットで15秒ずつ息止めを伸ばす練習",
            },
            {
              id: "co2",
              title: "② CO2テーブル",
              sub: "息止め一定・休憩を短縮して苦しさに慣れる",
            },
            {
              id: "max",
              title: "③ 一発計測（記録測定）",
              sub: "ストップを押すまで測る自己ベスト測定",
            },
            {
              id: "stretch",
              title: "④ 横隔膜ストレッチ",
              sub: "息を吐き切ってお腹を引き込む柔軟ワーク",
            },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-2xl border p-3 text-left transition ${
              mode === m.id
                ? "border-sky-400 bg-sky-50/80 shadow-sm ring-2 ring-sky-200"
                : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/30"
            }`}
          >
            <p className="text-xs font-bold text-slate-800 sm:text-sm">{m.title}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500 sm:text-[11px]">{m.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        {/* 左カラム: タイマー本体 */}
        <section className="flex flex-col items-center justify-between rounded-3xl border border-sky-100 bg-white p-5 shadow-xl sm:p-7">
          <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            {mode === "max" ? (
              <span className="flex items-center gap-1 font-semibold text-slate-700">
                <Trophy className="h-4 w-4 text-amber-500" />
                自己ベスト：<b className="font-mono text-sm text-sky-800">{bestHoldSec > 0 ? fmt(bestHoldSec) : "--:--"}</b>
              </span>
            ) : (
              <span>
                セット <b className="font-mono text-base text-slate-800">{roundIdx + 1}</b> / {schedule.length}
                <span className="ml-1.5 text-slate-400">（計 {fmt(totalWorkoutSec)}）</span>
              </span>
            )}
            <div className="flex items-center gap-1.5">
              {mode === "max" && (
                <button
                  type="button"
                  onClick={() => setHideMaxTime((h) => !h)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                    hideMaxTime
                      ? "bg-amber-50 text-amber-800 ring-amber-300"
                      : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                  }`}
                  title="息止め中のタイム表示のON/OFFを切り替えます"
                >
                  <Clock className="h-3.5 w-3.5" />
                  {hideMaxTime ? "タイム非表示" : "タイム表示あり"}
                </button>
              )}
              <button
                type="button"
                onClick={cycleSoundMode}
                title="タップで「音声ガイド → ベル音のみ → 消音」を切り替えます"
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                  soundMode === "voice"
                    ? "bg-sky-50 text-sky-700 ring-sky-200"
                    : soundMode === "bell"
                      ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                      : "bg-slate-100 text-slate-500 ring-slate-200"
                }`}
              >
                {soundMode === "voice" ? (
                  <>
                    <Volume2 className="h-3.5 w-3.5" />
                    音声ガイド
                  </>
                ) : soundMode === "bell" ? (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    ベル音のみ
                  </>
                ) : (
                  <>
                    <VolumeX className="h-3.5 w-3.5" />
                    消音
                  </>
                )}
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
                strokeDashoffset={
                  mode === "max" && phase === "hold" && hideMaxTime
                    ? 0
                    : 2 * Math.PI * 96 * (1 - progress / 100)
                }
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
            <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
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
                  ? lastMaxResult?.isNewBest
                    ? "🏆 自己ベスト更新！"
                    : "🎉 完了！"
                  : phase === "hold"
                    ? mode === "max"
                      ? "🟧 一発計測中（カウントアップ）"
                      : "🟧 息止め（ホールド）"
                    : phase === "vacuum"
                      ? "🟧 息止め＋横隔膜引き上げ"
                      : phase === "exhale"
                        ? "🟩 息をすべて吐き切る"
                        : "🟦 準備呼吸・リラックス"}
              </span>

              {/* メイン時計数字 */}
              {mode === "max" && phase === "hold" ? (
                hideMaxTime ? (
                  <div className="mt-3 flex flex-col items-center">
                    <Clock className="h-10 w-10 animate-pulse text-amber-500" />
                    <p className="mt-1.5 text-sm font-bold text-slate-700">タイム非表示で計測中</p>
                    <p className="text-[11px] text-slate-400">ストップを押すと記録が表示されます</p>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 font-mono text-6xl font-black tracking-tight text-slate-800">
                      {fmt(maxElapsed)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">ストップを押すまで計測します</p>
                  </>
                )
              ) : mode === "max" && completed && lastMaxResult ? (
                <>
                  <p className="mt-2 font-mono text-6xl font-black tracking-tight text-emerald-700">
                    {fmt(lastMaxResult.holdSec)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {lastMaxResult.contractionSec !== undefined
                      ? `最初の苦しさ ${fmt(lastMaxResult.contractionSec)}（＋${lastMaxResult.holdSec - lastMaxResult.contractionSec}秒粘り）`
                      : "今回の息止め記録"}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 font-mono text-6xl font-black tracking-tight text-slate-800">
                    {fmt(remaining)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {phase === "hold" || phase === "vacuum" ? (
                      <>
                        経過 <b className="font-mono text-slate-700">{fmt(elapsedInHold)}</b>
                      </>
                    ) : mode === "max" ? (
                      <>0:00で息止め計測スタート</>
                    ) : (
                      <>次の息止め：{fmt(schedule[roundIdx]?.holdSec ?? 0)}</>
                    )}
                  </p>
                </>
              )}
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
                ? mode === "max" && hideMaxTime && !completed
                  ? "最初の苦しさ：記録済み（終了後に表示）"
                  : `最初の苦しさ記録済み：${fmt(contractions[roundIdx + 1])}`
                : "息止め中に「最初の苦しさ」が来たらタップ"}
            </button>
          )}

          {/* 開始・ストップ・一時停止・リセットボタン */}
          <div className="flex w-full max-w-xs items-center gap-3">
            {mode === "max" && phase === "hold" && running ? (
              <button
                type="button"
                onClick={finishMaxHold}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-rose-600 active:scale-98"
              >
                <Square className="h-4 w-4 fill-white" />
                ストップ（息止め終了）
              </button>
            ) : (
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
            )}
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
            累計クリア：<b className="font-mono text-slate-600">{totalSessions}</b>回（選択設定はこのブラウザに自動保存されます）
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
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">1セット目の前の準備呼吸（開始カウントダウン）：</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PREP_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={running}
                        onClick={() => setPrepSec(s)}
                        className={`rounded-xl py-2 font-mono text-xs font-bold transition ${
                          prepSec === s ? "bg-sky-500 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        } disabled:opacity-50`}
                      >
                        {fmt(s)}
                      </button>
                    ))}
                  </div>
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
                  息止め時間は毎回同じ（無理のない秒数）に固定し、2セット目以降の休憩時間を <b>1:45 → 1:30 → 1:15 → 1:00 → 0:45 → 0:30</b> と少しずつ短くしていく方法です。長い時間息を止めなくても、後半の「早く息を吸いたい感覚」に落ち着いて対処する練習ができます。
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
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">1セット目の前の準備呼吸（開始カウントダウン）：</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PREP_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={running}
                        onClick={() => setPrepSec(s)}
                        className={`rounded-xl py-2 font-mono text-xs font-bold transition ${
                          prepSec === s ? "bg-sky-500 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        } disabled:opacity-50`}
                      >
                        {fmt(s)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === "max" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">1. 計測前の準備カウントダウン</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  すぐ始めたい時は0:15/0:30、本番と同じようにじっくり呼吸を整えてから測る時は1:30/2:00を選びます。
                </p>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {MAX_PREP_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={running}
                      onClick={() => setMaxPrepSec(s)}
                      className={`rounded-xl py-2 font-mono text-xs font-bold transition ${
                        maxPrepSec === s ? "bg-sky-500 text-white shadow-xs" : "bg-sky-50 text-slate-700 hover:bg-sky-100"
                      } disabled:opacity-50`}
                    >
                      {fmt(s)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800">2. 息止め中の画面表示・経過通知</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  時計の数字を見ると意識して苦しくなりやすい方は「タイム非表示」にするとリラックスして記録が伸びやすくなります。
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setHideMaxTime(false)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
                      !hideMaxTime
                        ? "bg-sky-500 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    タイム表示あり
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideMaxTime(true)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
                      hideMaxTime
                        ? "bg-amber-500 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    タイム非表示（計測後に表示）
                  </button>
                </div>

                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">息止め中の経過時間の音声通知：</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        [0, "通知なし（集中）"],
                        [30, "30秒ごと"],
                        [60, "1分ごと"],
                      ] as const
                    ).map(([sec, label]) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setMaxNotify(sec)}
                        className={`rounded-xl py-2 text-xs font-bold transition ${
                          maxNotify === sec
                            ? "bg-teal-500 text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {bestHoldSec > 0 && (
                <div className="rounded-2xl bg-sky-50/70 p-3 text-xs text-slate-700">
                  <p className="font-bold text-sky-900">
                    🏆 現在の自己ベスト：{fmt(bestHoldSec)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    → CO2テーブルのおすすめ固定秒数（約55%）：
                    <b className="ml-1 font-mono text-sky-800">
                      {fmt(Math.max(30, Math.round((bestHoldSec * 0.55) / 15) * 15))}
                    </b>
                  </p>
                </div>
              )}

              {maxHistory.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="w-full text-center text-xs">
                    <thead className="bg-slate-50 text-[11px] text-slate-500">
                      <tr>
                        <th className="py-2 font-semibold">測定日時</th>
                        <th className="py-2 font-semibold">息止め記録</th>
                        <th className="py-2 font-semibold">最初の苦しさ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {maxHistory.map((h, i) => (
                        <tr key={h.date + i} className="text-slate-700">
                          <td className="py-2 font-mono text-[11px] text-slate-500">{h.date}</td>
                          <td className="py-2 font-mono font-bold text-amber-700">
                            {fmt(h.holdSec)}
                            {h.holdSec === bestHoldSec && (
                              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-800">BEST</span>
                            )}
                          </td>
                          <td className="py-2 font-mono text-[11px] text-slate-500">
                            {h.contractionSec !== undefined ? fmt(h.contractionSec) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

          {/* ラウンド一覧テーブル（O2 / CO2 / Stretch 時） */}
          {mode !== "max" && (
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
          )}
        </section>
      </div>
    </div>
  );
}
