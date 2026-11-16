"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Check,
  RotateCcw,
  Award,
  MapPin,
  Calendar,
  ShieldCheck,
  Monitor,
  Plus,
  Minus,
  ArrowUp,
  Ban,
  Clock,
  Sparkles,
  CheckCircle2,
  Circle,
  Lock,
  Unlock,
  Sun,
  Moon,
} from "lucide-react";
import {
  CourseProfile,
  DEFAULT_BABCOCK_COURSES,
  computeAttendanceStatus,
} from "../lib/babcockKnowledge";

type EventType = "class" | "study" | "founder" | "exam";

interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  courseCode?: string | null;
  location?: string | null;
  startIso: string;
  endIso: string;
  attendanceMarked?: "present" | "absent" | "cancelled";
  studyCompleted?: boolean;
  brainDumpId?: string;
}

interface TaskItem {
  id: string;
  title: string;
  domain: "school" | "founder" | "personal";
  courseCode?: string | null;
  priority: "high" | "medium" | "low";
  status: "todo" | "done";
  subtasks: Array<{ title: string; completed: boolean }>;
  brainDumpId?: string;
}

const PROMPT_SUGGESTIONS = [
  {
    label: "COS 201 cancelled today",
    text: "COS 201 class today was cancelled, study Discrete Structures at 7pm for 90 minutes",
  },
  {
    label: "Move IFT 211 test to Friday",
    text: "IFT 211 test moved to Friday 10am at E102, review Flip-Flops tonight",
  },
  {
    label: "Founder sprint tomorrow",
    text: "Ship onboarding update by tomorrow 5pm and review growth metrics at 8pm",
  },
];

export default function DysAIMobileApp() {
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);
  const [isLight, setIsLight] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "dump" | "timeline" | "guard" | "rewards"
  >("dump");

  const [dumpInput, setDumpInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{
    id: string;
    summary: string;
    counts: { events: number; tasks: number; studyTopics: number };
  } | null>(null);

  const [xpPoints, setXpPoints] = useState<number>(230);
  const [courses, setCourses] = useState<CourseProfile[]>(
    DEFAULT_BABCOCK_COURSES
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([
    {
      id: "m-t-1",
      title: "Ship user feedback & product iteration sprint",
      domain: "founder",
      priority: "high",
      status: "todo",
      subtasks: [
        { title: "Finalize onboarding flow polish", completed: true },
        { title: "Push release build to staging", completed: false },
      ],
    },
    {
      id: "m-t-2",
      title: "Complete CSC 203 Discrete Structures proof set",
      domain: "school",
      courseCode: "CSC 203",
      priority: "high",
      status: "todo",
      subtasks: [{ title: "Solve recurrence relations", completed: false }],
    },
  ]);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    const savedXp = window.localStorage.getItem("dysai_xp_points");
    if (savedXp && !isNaN(Number(savedXp))) setXpPoints(Number(savedXp));
    const savedCourses = window.localStorage.getItem("dysai_babcock_courses");
    if (savedCourses) {
      try {
        const parsed = JSON.parse(savedCourses);
        if (Array.isArray(parsed) && parsed.length > 0) setCourses(parsed);
      } catch {}
    }

    fetch("/api/gcal")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.events)) {
          setEvents(data.events);
        }
      })
      .catch(() => {});

    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const showNotice = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const addXp = (delta: number) => {
    setXpPoints((prev) => {
      const next = Math.max(0, prev + delta);
      window.localStorage.setItem("dysai_xp_points", String(next));
      return next;
    });
  };

  const todayEvents = useMemo(() => {
    if (!mounted) return [];
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    return events.filter((ev) => {
      const t = Date.parse(ev.startIso);
      return t >= start && t < end;
    });
  }, [events, mounted]);

  // 30-min into class check-in detector
  const activeClassCheckIn = useMemo(() => {
    if (!mounted) return null;
    const thirtyMins = 30 * 60 * 1000;
    return (
      todayEvents.find((ev) => {
        if (ev.type !== "class" || ev.attendanceMarked) return false;
        const startMs = Date.parse(ev.startIso);
        return nowMs >= startMs + thirtyMins;
      }) || null
    );
  }, [todayEvents, nowMs, mounted]);

  const handleClassOutcome = (
    ev: CalendarEvent,
    outcome: "present" | "absent" | "cancelled"
  ) => {
    const code = (ev.courseCode || ev.title).trim().toUpperCase();
    setEvents((prev) =>
      prev.map((item) =>
        item.id === ev.id ? { ...item, attendanceMarked: outcome } : item
      )
    );

    if (outcome !== "cancelled") {
      setCourses((prev) => {
        const updated = prev.map((c) =>
          c.code.toUpperCase() === code
            ? {
                ...c,
                totalClassesHeld: c.totalClassesHeld + 1,
                attendedClasses:
                  c.attendedClasses + (outcome === "present" ? 1 : 0),
              }
            : c
        );
        window.localStorage.setItem(
          "dysai_babcock_courses",
          JSON.stringify(updated)
        );
        return updated;
      });
    }

    if (outcome === "present") {
      addXp(50);
      showNotice(`Checked in to ${code} (+50 XP)`);
    } else if (outcome === "cancelled") {
      showNotice(`${code} marked Cancelled (excluded from 75% guard)`);
    } else {
      showNotice(`Logged missed class for ${code}`);
    }

    fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseCode: code,
        present: outcome === "present",
        cancelled: outcome === "cancelled",
        eventId: ev.id,
      }),
    }).catch(() => {});
  };

  const handleBrainDump = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = dumpInput.trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    try {
      const res = await fetch("/api/brain-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: trimmed,
          currentIsoTime: new Date().toISOString(),
          courses,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse");

      const dumpId = `mdump-${Date.now()}`;
      const newEvents: CalendarEvent[] = (data.events || []).map(
        (ev: CalendarEvent, i: number) => ({
          ...ev,
          id: `${dumpId}-ev-${i}`,
          brainDumpId: dumpId,
        })
      );
      const newTasks: TaskItem[] = (data.tasks || []).map(
        (
          t: {
            title: string;
            domain: "school" | "founder" | "personal";
            courseCode?: string;
            priority: "high" | "medium" | "low";
            subtasks: string[];
          },
          i: number
        ) => ({
          id: `${dumpId}-t-${i}`,
          title: t.title,
          domain: t.domain,
          courseCode: t.courseCode || null,
          priority: t.priority,
          status: "todo",
          subtasks: (t.subtasks || []).map((s) => ({
            title: s,
            completed: false,
          })),
          brainDumpId: dumpId,
        })
      );

      const cancelledCodes: string[] = Array.isArray(data.cancelledClasses)
        ? data.cancelledClasses.map((c: string) => c.trim().toUpperCase())
        : [];

      setEvents((prev) => {
        const updated =
          cancelledCodes.length > 0
            ? prev.map((ev) => {
                const code = (ev.courseCode || ev.title).trim().toUpperCase();
                if (
                  ev.type === "class" &&
                  cancelledCodes.some(
                    (cc) => code.includes(cc) || cc.includes(code)
                  )
                ) {
                  return { ...ev, attendanceMarked: "cancelled" as const };
                }
                return ev;
              })
            : prev;
        return [...updated, ...newEvents].sort(
          (a, b) => Date.parse(a.startIso) - Date.parse(b.startIso)
        );
      });

      setTasks((prev) => [...newTasks, ...prev]);
      setLastReceipt({
        id: dumpId,
        summary: data.summary,
        counts: {
          events: newEvents.length,
          tasks: newTasks.length,
          studyTopics: (data.studyTopics || []).length,
        },
      });
      setDumpInput("");
      addXp(15);
      showNotice("Brain Dump synced (+15 XP)");
    } catch (err: unknown) {
      showNotice(
        err instanceof Error ? err.message : "Could not process Brain Dump"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const level = Math.floor(xpPoints / 150) + 1;
  const levelProgressPct = Math.round(((xpPoints % 150) / 150) * 100);
  const safeCoursesCount = courses.filter(
    (c) => !computeAttendanceStatus(c).isAtRisk
  ).length;

  return (
    <div
      className={`min-h-[100dvh] flex flex-col justify-between max-w-[430px] mx-auto transition-colors duration-200 ${
        isLight
          ? "bg-[#F8FAFC] text-[#0F172A] border-x border-slate-200"
          : "bg-[#090A0F] text-[#F8FAFC] border-x border-white/[0.07]"
      }`}
    >
      {/* FLOATING TOP BAR (UIUX-DESIGNER + MOBILE-NATIVE COMPLIANT) */}
      <header
        className={`translucent-chrome safe-top sticky top-0 z-30 px-5 pb-3 backdrop-blur-xl border-b flex items-center justify-between ${
          isLight
            ? "bg-[#F8FAFC]/90 border-slate-200/80"
            : "bg-[#090A0F]/90 border-white/[0.06]"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[#3B82F6] text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4" strokeWidth={2} />
          </div>
          <div>
            <span className="font-bold tracking-tight text-base block leading-none">
              DysAI
            </span>
            <span
              className={`text-xs mt-1 block ${
                isLight ? "text-slate-500" : "text-slate-400"
              }`}
            >
              {mounted
                ? new Date().toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "Executive OS"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("rewards")}
            className={`min-h-[38px] px-3 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer ${
              isLight
                ? "bg-white border-slate-200 text-slate-900 hover:bg-slate-100"
                : "bg-[#12151E] border-white/[0.08] text-white hover:bg-[#191D29]"
            }`}
          >
            <Award className="w-4 h-4 text-[#3B82F6]" strokeWidth={2} />
            <span className="font-mono-code">{xpPoints} XP</span>
          </button>

          <button
            onClick={() => setIsLight(!isLight)}
            aria-label="Toggle color theme"
            className={`h-9 w-9 rounded-xl border flex items-center justify-center transition cursor-pointer ${
              isLight
                ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                : "bg-[#12151E] border-white/[0.08] text-slate-300 hover:bg-[#191D29]"
            }`}
          >
            {isLight ? (
              <Moon className="w-4 h-4" strokeWidth={1.75} />
            ) : (
              <Sun className="w-4 h-4" strokeWidth={1.75} />
            )}
          </button>

          <Link
            href="/"
            aria-label="Open Desktop View"
            className={`h-9 w-9 rounded-xl border flex items-center justify-center transition ${
              isLight
                ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                : "bg-[#12151E] border-white/[0.08] text-slate-300 hover:bg-[#191D29]"
            }`}
          >
            <Monitor className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </div>
      </header>

      {/* TRANSIENT TOAST */}
      {toast && (
        <div className="enter-surface mx-5 mt-3 rounded-xl bg-[#3B82F6] text-white px-4 py-2.5 text-xs font-semibold shadow-md flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main className="flex-1 px-5 pt-4 pb-28 space-y-4 overflow-y-auto overscroll-contain">
        {activeTab === "dump" && (
          <>
            {/* 1. HERO: THE BRAIN DUMP SURFACE (PRIMARY ACTION) */}
            <form
              onSubmit={handleBrainDump}
              className={`rounded-2xl border p-4 space-y-3.5 ${
                isLight
                  ? "bg-white border-slate-200/90 shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
                  : "bg-[#12151E] border-white/[0.08]"
              }`}
            >
              <div className="flex items-center justify-between">
                <label
                  htmlFor="mobile-brain-dump"
                  className="text-sm font-bold tracking-tight"
                >
                  Brain Dump
                </label>
                <span
                  className={`text-xs ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  Auto-syncs Calendar &amp; Tasks
                </span>
              </div>

              <div
                className={`rounded-xl border p-3 focus-within:border-[#3B82F6] ${
                  isLight
                    ? "bg-[#F8FAFC] border-slate-200"
                    : "bg-[#090A0F] border-white/[0.07]"
                }`}
              >
                <textarea
                  id="mobile-brain-dump"
                  rows={3}
                  enterKeyHint="send"
                  value={dumpInput}
                  onChange={(e) => setDumpInput(e.target.value)}
                  placeholder="Type a messy thought... e.g. 'COS 201 class today was cancelled, study Discrete Structures at 7pm for 90m, finish IFT 211 lab by Thursday'"
                  className="w-full text-base leading-relaxed bg-transparent focus:outline-none resize-none placeholder:text-slate-400"
                />

                <div className="flex items-center justify-between pt-2 border-t border-current/5">
                  <span
                    className={`text-xs font-mono-code ${
                      isLight ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    +15 XP per capture
                  </span>

                  <button
                    type="submit"
                    disabled={isProcessing || !dumpInput.trim()}
                    className="min-h-[40px] px-4 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{isProcessing ? "Parsing..." : "Capture"}</span>
                    <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
                  </button>
                </div>
              </div>

              {/* Single-row horizontal scroll-snap prompt pills */}
              <div className="chip-carousel flex gap-2 overflow-x-auto pb-0.5">
                {PROMPT_SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDumpInput(item.text)}
                    className={`shrink-0 min-h-[36px] px-3 rounded-xl border text-xs font-medium cursor-pointer ${
                      isLight
                        ? "bg-[#F8FAFC] border-slate-200 text-slate-700 hover:bg-slate-100"
                        : "bg-[#191D29] border-white/[0.06] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </form>

            {/* Live Action Receipt */}
            {lastReceipt && (
              <div
                className={`enter-surface rounded-2xl border p-4 space-y-2 text-xs ${
                  isLight
                    ? "bg-emerald-50/80 border-emerald-200 text-slate-900"
                    : "bg-emerald-500/10 border-emerald-500/25 text-slate-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Synced to Calendar &amp; Convex
                  </span>
                  <button
                    onClick={() => {
                      setEvents((prev) =>
                        prev.filter((e) => e.brainDumpId !== lastReceipt.id)
                      );
                      setTasks((prev) =>
                        prev.filter((t) => t.brainDumpId !== lastReceipt.id)
                      );
                      setLastReceipt(null);
                    }}
                    className="inline-flex items-center gap-1 text-rose-500 font-semibold hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo
                  </button>
                </div>
                <p className="leading-relaxed opacity-85">
                  {lastReceipt.summary}
                </p>
              </div>
            )}

            {/* 2. JOMO-STYLE 30-MIN LIVE CLASS CHECK-IN CARD */}
            {activeClassCheckIn && (
              <div
                className={`rounded-2xl border p-4 space-y-3 ${
                  isLight
                    ? "bg-white border-blue-200 shadow-sm"
                    : "bg-[#12151E] border-[#3B82F6]/35"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#3B82F6] animate-pulse" />
                    <span className="text-xs font-semibold text-[#3B82F6]">
                      30m Class Check-In
                    </span>
                  </div>
                  {activeClassCheckIn.location && (
                    <span
                      className={`text-xs font-mono-code ${
                        isLight ? "text-slate-500" : "text-slate-400"
                      }`}
                    >
                      {activeClassCheckIn.location}
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="text-sm font-bold">
                    Are you in{" "}
                    {activeClassCheckIn.courseCode || activeClassCheckIn.title}?
                  </h2>
                  <p
                    className={`text-xs mt-0.5 ${
                      isLight ? "text-slate-600" : "text-slate-400"
                    }`}
                  >
                    Confirm attendance for +50 XP, or mark Cancelled so your
                    75% pace is unaffected.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() =>
                      handleClassOutcome(activeClassCheckIn, "present")
                    }
                    className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>In Class</span>
                  </button>
                  <button
                    onClick={() =>
                      handleClassOutcome(activeClassCheckIn, "cancelled")
                    }
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                      isLight
                        ? "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        : "border-white/10 bg-[#191D29] text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cancelled</span>
                  </button>
                  <button
                    onClick={() =>
                      handleClassOutcome(activeClassCheckIn, "absent")
                    }
                    className={`min-h-[44px] rounded-xl border text-xs font-medium transition cursor-pointer ${
                      isLight
                        ? "border-slate-200 bg-white text-slate-500 hover:text-rose-600"
                        : "border-white/10 bg-transparent text-slate-400 hover:text-rose-400"
                    }`}
                  >
                    Missed
                  </button>
                </div>
              </div>
            )}

            {/* 3. COPILOT × JOMO METRIC BENTO (2 CARDS) */}
            <div className="grid grid-cols-2 gap-3">
              {/* Copilot 75% Pace Card */}
              <button
                type="button"
                onClick={() => setActiveTab("guard")}
                className={`text-left rounded-2xl border p-4 space-y-2.5 transition cursor-pointer ${
                  isLight
                    ? "bg-white border-slate-200 hover:border-slate-300"
                    : "bg-[#12151E] border-white/[0.08] hover:border-white/15"
                }`}
              >
                <div className="flex items-center justify-between">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="font-mono-code text-xs font-semibold text-emerald-500">
                    {safeCoursesCount}/{courses.length} Safe
                  </span>
                </div>
                <div>
                  <div className="text-lg font-bold tracking-tight">
                    75% Guard
                  </div>
                  <p
                    className={`text-xs ${
                      isLight ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    View course pace bars
                  </p>
                </div>
              </button>

              {/* Jomo XP & Unlocks Card */}
              <button
                type="button"
                onClick={() => setActiveTab("rewards")}
                className={`text-left rounded-2xl border p-4 space-y-2.5 transition cursor-pointer ${
                  isLight
                    ? "bg-white border-slate-200 hover:border-slate-300"
                    : "bg-[#12151E] border-white/[0.08] hover:border-white/15"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Unlock className="w-4 h-4 text-[#3B82F6]" />
                  <span className="font-mono-code text-xs font-semibold text-[#3B82F6]">
                    Level {level}
                  </span>
                </div>
                <div>
                  <div className="text-lg font-bold tracking-tight font-mono-code">
                    {xpPoints} XP
                  </div>
                  <div
                    className={`h-1.5 w-full rounded-full mt-1.5 overflow-hidden ${
                      isLight ? "bg-slate-100" : "bg-white/[0.08]"
                    }`}
                  >
                    <div
                      className="h-full bg-[#3B82F6] rounded-full"
                      style={{ width: `${levelProgressPct}%` }}
                    />
                  </div>
                </div>
              </button>
            </div>

            {/* 4. PRIORITY TASKS (EARLY COMPLETION = +60 XP) */}
            <div
              className={`rounded-2xl border p-4 space-y-3 ${
                isLight
                  ? "bg-white border-slate-200"
                  : "bg-[#12151E] border-white/[0.08]"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold tracking-tight">
                  Priority Tasks
                </h2>
                <span className="text-xs font-mono-code text-[#3B82F6] font-medium">
                  Early +60 XP
                </span>
              </div>

              <div className="divide-y divide-current/5">
                {tasks.slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (t.status !== "done") {
                        addXp(60);
                        showNotice("Early Task Bonus (+60 XP)");
                      }
                      setTasks((prev) =>
                        prev.map((item) =>
                          item.id === t.id
                            ? {
                                ...item,
                                status:
                                  item.status === "done" ? "todo" : "done",
                              }
                            : item
                        )
                      );
                    }}
                    className="w-full py-3 flex items-start gap-3 text-left cursor-pointer"
                  >
                    {t.status === "done" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <Circle
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          isLight ? "text-slate-400" : "text-slate-500"
                        }`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold leading-snug ${
                          t.status === "done" ? "line-through opacity-45" : ""
                        }`}
                      >
                        {t.title}
                      </p>
                      {t.courseCode && (
                        <span
                          className={`inline-block mt-1 text-[10px] font-mono-code px-2 py-0.5 rounded-md ${
                            isLight
                              ? "bg-slate-100 text-slate-700"
                              : "bg-white/[0.06] text-slate-300"
                          }`}
                        >
                          {t.courseCode}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* TAB 2: TIMELINE WITH LIVE TIME LINE & PASSED EVENTS GREYED OUT */}
        {activeTab === "timeline" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold tracking-tight">
                Today&apos;s Schedule
              </h1>
              <span
                className={`text-xs font-mono-code ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {todayEvents.length} blocks
              </span>
            </div>

            {todayEvents.length === 0 ? (
              <div
                className={`rounded-2xl border p-8 text-center text-xs ${
                  isLight
                    ? "bg-white border-slate-200 text-slate-500"
                    : "bg-[#12151E] border-white/[0.08] text-slate-400"
                }`}
              >
                No events scheduled for today.
              </div>
            ) : (
              todayEvents.map((ev, idx) => {
                const start = new Date(ev.startIso);
                const end = new Date(ev.endIso);
                const startMs = start.getTime();
                const endMs = end.getTime();
                const isPassed = nowMs > endMs;
                const isActive = nowMs >= startMs && nowMs <= endMs;
                const prevEnd =
                  idx > 0
                    ? new Date(todayEvents[idx - 1].endIso).getTime()
                    : 0;
                const showLineBefore =
                  nowMs < startMs && (idx === 0 || nowMs > prevEnd);

                return (
                  <React.Fragment key={ev.id}>
                    {showLineBefore && (
                      <div className="flex items-center gap-2 py-1">
                        <span className="px-2 py-0.5 rounded-md bg-[#3B82F6] text-white font-mono-code text-[10px] font-semibold">
                          {new Date(nowMs).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        <div className="flex-1 h-[1.5px] bg-[#3B82F6]" />
                      </div>
                    )}

                    <div
                      className={`rounded-2xl border p-4 space-y-2.5 transition ${
                        isPassed
                          ? isLight
                            ? "bg-slate-100/70 border-slate-200/60 opacity-50"
                            : "bg-white/[0.02] border-white/[0.04] opacity-45"
                          : isActive
                            ? "border-[#3B82F6] bg-[#3B82F6]/[0.07]"
                            : isLight
                              ? "bg-white border-slate-200"
                              : "bg-[#12151E] border-white/[0.08]"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono-code">
                        <span className="flex items-center gap-1.5 opacity-70">
                          <Clock className="w-3.5 h-3.5" />
                          {start.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {end.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-md bg-[#3B82F6] text-white text-[10px] font-semibold">
                            Live Now
                          </span>
                        )}
                        {isPassed && (
                          <span className="text-[10px] opacity-60">Passed</span>
                        )}
                      </div>

                      <p
                        className={`text-sm font-bold ${
                          isPassed ? "line-through" : ""
                        }`}
                      >
                        {ev.title}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs opacity-65 flex items-center gap-1">
                          {ev.location && (
                            <>
                              <MapPin className="w-3.5 h-3.5" />
                              {ev.location}
                            </>
                          )}
                        </span>

                        {ev.type === "class" && (
                          <div className="flex items-center gap-1.5">
                            {ev.attendanceMarked === "present" ? (
                              <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" />
                                In Class (+50)
                              </span>
                            ) : ev.attendanceMarked === "cancelled" ? (
                              <span className="text-xs font-semibold text-amber-500 flex items-center gap-1">
                                <Ban className="w-3.5 h-3.5" />
                                Cancelled
                              </span>
                            ) : (
                              <>
                                {nowMs >= startMs + 30 * 60 * 1000 && (
                                  <button
                                    onClick={() =>
                                      handleClassOutcome(ev, "present")
                                    }
                                    className="min-h-[34px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                                  >
                                    Check-In
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    handleClassOutcome(ev, "cancelled")
                                  }
                                  className={`min-h-[34px] px-2.5 rounded-xl border text-xs font-medium cursor-pointer ${
                                    isLight
                                      ? "border-slate-200 bg-slate-50"
                                      : "border-white/10 bg-white/5"
                                  }`}
                                >
                                  Cancelled
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {ev.type === "study" && (
                          <>
                            {ev.studyCompleted ? (
                              <span className="text-xs font-semibold text-[#3B82F6]">
                                Completed (+40 XP)
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setEvents((prev) =>
                                    prev.map((item) =>
                                      item.id === ev.id
                                        ? { ...item, studyCompleted: true }
                                        : item
                                    )
                                  );
                                  addXp(40);
                                  showNotice("Study Block Completed (+40 XP)");
                                }}
                                className="min-h-[34px] px-3 rounded-xl bg-[#3B82F6] text-white text-xs font-semibold cursor-pointer"
                              >
                                Complete (+40 XP)
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: COPILOT-STYLE 75% ATTENDANCE PACE BARS */}
        {activeTab === "guard" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold tracking-tight">
                75% Attendance Pace
              </h1>
              <span
                className={`text-xs font-mono-code ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Marker = 75%
              </span>
            </div>

            {courses.map((course) => {
              const {
                percentage: pct,
                isAtRisk,
                classesNeededToRecover,
                safeSkipsAvailable,
              } = computeAttendanceStatus(course);
              return (
                <div
                  key={course.code}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    isLight
                      ? "bg-white border-slate-200"
                      : "bg-[#12151E] border-white/[0.08]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono-code text-xs font-bold">
                        {course.code}
                      </span>
                      <p
                        className={`text-xs ${
                          isLight ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        {course.title}
                      </p>
                    </div>
                    <div className="text-right font-mono-code">
                      <span
                        className={`text-sm font-bold ${
                          isAtRisk ? "text-rose-500" : "text-emerald-500"
                        }`}
                      >
                        {pct}%
                      </span>
                      <p
                        className={`text-[10px] ${
                          isLight ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {course.attendedClasses}/{course.totalClassesHeld}
                      </p>
                    </div>
                  </div>

                  {/* Copilot Horizontal Pace Bar with 75% Tick */}
                  <div
                    className={`h-2 w-full rounded-full overflow-hidden relative ${
                      isLight ? "bg-slate-100" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        isAtRisk ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                    <div
                      className={`absolute top-0 bottom-0 w-0.5 ${
                        isLight ? "bg-slate-900" : "bg-white"
                      }`}
                      style={{ left: "75%" }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={
                        isAtRisk
                          ? "text-rose-500 font-medium"
                          : "text-emerald-500 font-medium"
                      }
                    >
                      {isAtRisk
                        ? `Attend next ${classesNeededToRecover} to hit 75%`
                        : `${safeSkipsAvailable} safe skips available`}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setCourses((prev) =>
                            prev.map((c) =>
                              c.code === course.code
                                ? {
                                    ...c,
                                    attendedClasses: c.attendedClasses + 1,
                                    totalClassesHeld: c.totalClassesHeld + 1,
                                  }
                                : c
                            )
                          );
                          addXp(50);
                        }}
                        aria-label="Log attended class"
                        className={`h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer ${
                          isLight
                            ? "border-slate-200 bg-slate-50"
                            : "border-white/10 bg-white/5"
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setCourses((prev) =>
                            prev.map((c) =>
                              c.code === course.code
                                ? {
                                    ...c,
                                    totalClassesHeld: c.totalClassesHeld + 1,
                                  }
                                : c
                            )
                          );
                        }}
                        aria-label="Log missed class"
                        className={`h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer ${
                          isLight
                            ? "border-slate-200 bg-slate-50"
                            : "border-white/10 bg-white/5"
                        }`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 4: JOMO-STYLE REWARD UNLOCKS VAULT */}
        {activeTab === "rewards" && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-[#3B82F6] text-white p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold opacity-90">
                  Level {level} Execution Score
                </span>
                <Award className="w-4 h-4" />
              </div>
              <div className="text-3xl font-bold font-mono-code tracking-tight">
                {xpPoints} XP
              </div>
              <p className="text-xs opacity-90">
                Class Check-In +50 XP · Study Block +40 XP · Early Task +60 XP
              </p>
            </div>

            {[
              {
                title: "2h Guilt-Free Gaming / Netflix Pass",
                cost: 150,
                desc: "Unlocks distraction shield for a 2-hour evening chill window",
              },
              {
                title: "AI High-Yield Exam Cheat Sheet",
                cost: 250,
                desc: "Instant predicted lecturer quiz & 1-page cram sheet",
              },
              {
                title: "Takeout / Shawarma Milestone Treat",
                cost: 400,
                desc: "Reward for hitting your class + study streak",
              },
              {
                title: "Safe-Skip Shield Token (80%+ Buffer)",
                cost: 500,
                desc: "Cash in 1 guilt-free skip on SEN 201 or BU COS 209",
              },
            ].map((item, idx) => {
              const unlocked = xpPoints >= item.cost;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
                    isLight
                      ? "bg-white border-slate-200"
                      : "bg-[#12151E] border-white/[0.08]"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      {unlocked ? (
                        <Unlock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <p className="text-xs font-bold">{item.title}</p>
                    </div>
                    <p
                      className={`text-xs ${
                        isLight ? "text-slate-500" : "text-slate-400"
                      }`}
                    >
                      {item.desc}
                    </p>
                  </div>
                  <button
                    disabled={!unlocked}
                    onClick={() => {
                      addXp(-item.cost);
                      showNotice(`Unlocked: ${item.title}`);
                    }}
                    className="shrink-0 min-h-[38px] px-3.5 rounded-xl bg-[#3B82F6] disabled:opacity-30 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {item.cost} XP
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* FLOATING BOTTOM NAVIGATION BAR (UIUX-DESIGNER + MOBILE-NATIVE SAFE-AREA RULE) */}
      <nav className="safe-bottom fixed bottom-2 left-4 right-4 max-w-[398px] mx-auto z-40">
        <div
          className={`translucent-chrome rounded-2xl p-1.5 border backdrop-blur-xl grid grid-cols-4 gap-1 shadow-xl ${
            isLight
              ? "bg-white/95 border-slate-200/90"
              : "bg-[#12151E]/95 border-white/[0.08]"
          }`}
        >
          <button
            onClick={() => setActiveTab("dump")}
            className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "dump"
                ? "bg-[#3B82F6] text-white"
                : isLight
                  ? "text-slate-500 hover:text-slate-900"
                  : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-4 h-4" strokeWidth={2} />
            <span>Dump</span>
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "timeline"
                ? "bg-[#3B82F6] text-white"
                : isLight
                  ? "text-slate-500 hover:text-slate-900"
                  : "text-slate-400 hover:text-white"
            }`}
          >
            <Calendar className="w-4 h-4" strokeWidth={2} />
            <span>Schedule</span>
          </button>
          <button
            onClick={() => setActiveTab("guard")}
            className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "guard"
                ? "bg-[#3B82F6] text-white"
                : isLight
                  ? "text-slate-500 hover:text-slate-900"
                  : "text-slate-400 hover:text-white"
            }`}
          >
            <ShieldCheck className="w-4 h-4" strokeWidth={2} />
            <span>75% Pace</span>
          </button>
          <button
            onClick={() => setActiveTab("rewards")}
            className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "rewards"
                ? "bg-[#3B82F6] text-white"
                : isLight
                  ? "text-slate-500 hover:text-slate-900"
                  : "text-slate-400 hover:text-white"
            }`}
          >
            <Award className="w-4 h-4" strokeWidth={2} />
            <span>Unlocks</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
