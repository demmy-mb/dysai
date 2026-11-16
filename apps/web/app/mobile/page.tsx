"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Check,
  RotateCcw,
  Award,
  MapPin,
  Sparkles,
  Calendar,
  ShieldCheck,
  CornerDownLeft,
  Monitor,
  Plus,
  Minus,
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

const MOBILE_CHIPS = [
  {
    label: "⊘ COS 201 cancelled",
    text: "COS 201 class today was cancelled, study Discrete Structures at 7pm for 90 minutes",
  },
  {
    label: "📅 Move IFT 211 test",
    text: "IFT 211 test moved to Friday 10am at E102, review Flip-Flops tonight",
  },
  {
    label: "⚡ Founder sprint",
    text: "Ship onboarding update by tomorrow 5pm and review growth metrics at 8pm",
  },
];

export default function DysAIMobileApp() {
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);
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
    setTimeout(() => setToast(null), 4000);
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
      showNotice(`✓ Checked in to ${code} (+50 XP)`);
    } else if (outcome === "cancelled") {
      showNotice(`⊘ ${code} marked Cancelled (0 impact on 75% Guard)`);
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
      showNotice("✦ Brain Dump synced (+15 XP)");
    } catch (err: unknown) {
      showNotice(
        err instanceof Error ? err.message : "Could not process Brain Dump"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const atRiskCount = courses.filter(
    (c) => computeAttendanceStatus(c).isAtRisk
  ).length;

  return (
    <div
      className="min-h-screen flex flex-col justify-between max-w-md mx-auto text-[#F5F7FA] border-x border-white/[0.08]"
      style={{
        background:
          "radial-gradient(circle at 50% 0%, #182036 0%, #0B0D13 55%)",
      }}
    >
      {/* COPILOT × JOMO STATUS HEADER */}
      <header className="sticky top-0 z-30 px-5 pt-4 pb-3 backdrop-blur-xl bg-[#0B0D13]/80 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 text-xs font-bold">
            ✦
          </div>
          <div>
            <span className="font-bold tracking-tight text-sm text-white">
              DysAI
            </span>
            <span className="block text-[10px] text-emerald-300 font-mono-code">
              SHIELD ACTIVE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("rewards")}
            className="px-3 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-300 font-mono-code text-xs font-bold cursor-pointer"
          >
            ⚡ {xpPoints} XP
          </button>

          <Link
            href="/"
            className="p-2 rounded-full bg-white/[0.06] border border-white/10 text-slate-300 hover:text-white"
            title="Switch to Desktop View"
          >
            <Monitor className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* TOAST BANNER */}
      {toast && (
        <div className="mx-4 mt-3 rounded-2xl bg-emerald-400 text-[#090B10] px-4 py-2.5 text-xs font-bold shadow-lg">
          {toast}
        </div>
      )}

      {/* MAIN SCROLLABLE VIEWPORT */}
      <main className="flex-1 px-4 pt-3 pb-28 space-y-3.5 overflow-y-auto">
        {activeTab === "dump" && (
          <>
            {/* 1. HERO: THE BRAIN DUMP COMPOSER (COPILOT SQUIRCLE CARD) */}
            <form
              onSubmit={handleBrainDump}
              className="rounded-[28px] p-4 border border-white/12 shadow-2xl space-y-3"
              style={{
                background:
                  "linear-gradient(180deg, rgba(30, 37, 56, 0.92) 0%, rgba(19, 23, 34, 0.96) 100%)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-base font-bold tracking-tight text-white">
                    Brain Dump
                  </h1>
                  <p className="text-xs text-slate-400">
                    Type once — populates Calendar, Tasks &amp; 75% Guard
                  </p>
                </div>
                <span className="text-[10px] font-mono-code px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300">
                  2.5 Flash
                </span>
              </div>

              <textarea
                rows={3}
                value={dumpInput}
                onChange={(e) => setDumpInput(e.target.value)}
                placeholder="What's happening? e.g. 'COS 201 class today was cancelled, study Discrete Structures at 7pm for 90m, finish IFT 211 lab by Thursday'..."
                className="w-full rounded-[20px] p-3.5 text-xs text-white placeholder:text-slate-400 border border-white/10 bg-[#090B10]/80 focus:border-emerald-400/60 focus:outline-none resize-none leading-relaxed"
              />

              {/* Quick Intent Chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {MOBILE_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDumpInput(chip.text)}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 font-medium cursor-pointer transition"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={isProcessing || !dumpInput.trim()}
                className="w-full py-3 rounded-[18px] bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 text-[#090B10] text-xs font-bold tracking-wide flex items-center justify-center gap-2 shadow-lg cursor-pointer transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isProcessing ? "Parsing..." : "Dump & Auto-Schedule"}
                </span>
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Live Action Receipt */}
            {lastReceipt && (
              <div className="rounded-[24px] border border-emerald-400/35 bg-emerald-400/10 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300">
                    ✦ Action Receipt (+15 XP)
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
                    className="inline-flex items-center gap-1 text-rose-300 font-semibold underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Undo
                  </button>
                </div>
                <p className="text-slate-200 leading-relaxed">
                  {lastReceipt.summary}
                </p>
              </div>
            )}

            {/* 2. JOMO-STYLE 30-MIN CLASS CHECK-IN SHIELD */}
            {activeClassCheckIn && (
              <div
                className="rounded-[26px] p-4 border border-amber-400/30 space-y-3"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(19, 23, 34, 0.94) 100%)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono-code text-[10px] font-bold uppercase tracking-wider">
                    🛡️ 30m Class Check-In Open
                  </span>
                  {activeClassCheckIn.location && (
                    <span className="font-mono-code text-xs text-slate-400">
                      {activeClassCheckIn.location}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Are you in{" "}
                    {activeClassCheckIn.courseCode || activeClassCheckIn.title}?
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Confirm to earn +50 XP or mark Cancelled so your 75% guard
                    isn&apos;t affected.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() =>
                      handleClassOutcome(activeClassCheckIn, "present")
                    }
                    className="py-2 rounded-2xl bg-emerald-400 text-[#090B10] text-xs font-bold cursor-pointer"
                  >
                    ✓ Yes (+50)
                  </button>
                  <button
                    onClick={() =>
                      handleClassOutcome(activeClassCheckIn, "cancelled")
                    }
                    className="py-2 rounded-2xl bg-white/10 border border-white/15 text-amber-200 text-xs font-semibold cursor-pointer"
                  >
                    ⊘ Cancelled
                  </button>
                  <button
                    onClick={() =>
                      handleClassOutcome(activeClassCheckIn, "absent")
                    }
                    className="py-2 rounded-2xl bg-white/5 border border-white/10 text-slate-300 text-xs cursor-pointer"
                  >
                    Missed
                  </button>
                </div>
              </div>
            )}

            {/* 3. COPILOT × JOMO 2-COLUMN BENTO SUMMARY */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setActiveTab("guard")}
                className="rounded-[24px] p-3.5 border border-white/10 bg-[#131722] space-y-2 cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">75% Pace</span>
                  <span className="text-rose-400 font-mono-code font-bold">
                    {atRiskCount} At Risk
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-mono-code font-semibold">
                      COS 201
                    </span>
                    <span className="font-mono-code text-rose-400">
                      {computeAttendanceStatus(courses[0]).percentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden relative">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{
                        width: `${computeAttendanceStatus(courses[0]).percentage}%`,
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white"
                      style={{ left: "75%" }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tap for all courses →
                  </p>
                </div>
              </div>

              <div
                onClick={() => setActiveTab("rewards")}
                className="rounded-[24px] p-3.5 border border-white/10 bg-[#131722] space-y-2 cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Jomo Perk</span>
                  <span className="text-emerald-300 font-mono-code font-bold">
                    {xpPoints >= 150 ? "Ready" : "Locked"}
                  </span>
                </div>
                <p className="text-xs font-bold text-white leading-snug">
                  🔓 2h Gaming &amp; Netflix Pass
                </p>
                <span className="inline-block text-[11px] font-mono-code text-emerald-300">
                  150 XP · Tap to unlock →
                </span>
              </div>
            </div>

            {/* 4. EARLY BIRD TASKS (+60 XP) */}
            <div className="rounded-[26px] p-4 border border-white/10 bg-[#131722] space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">
                  Execution Queue
                </h2>
                <span className="text-[11px] font-mono-code text-emerald-300">
                  Early = +60 XP
                </span>
              </div>

              <div className="space-y-2.5">
                {tasks.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      if (t.status !== "done") {
                        addXp(60);
                        showNotice("⚡ +60 XP Early Bird Task Bonus!");
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
                    className="flex items-start gap-2.5 text-xs cursor-pointer"
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        t.status === "done"
                          ? "bg-emerald-400 border-emerald-400 text-[#090B10]"
                          : "border-white/30"
                      }`}
                    >
                      {t.status === "done" && <Check className="w-2.5 h-2.5" />}
                    </span>
                    <span
                      className={
                        t.status === "done"
                          ? "line-through text-slate-500"
                          : "font-medium text-slate-100"
                      }
                    >
                      {t.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* TAB 2: TIMELINE WITH LIVE TIME LINE & PASSED EVENTS GREYED OUT */}
        {activeTab === "timeline" && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-white">
              Today&apos;s Synced Timeline
            </h2>
            {todayEvents.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                No events found for today.
              </p>
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
                        <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-[#090B10] font-mono-code text-[10px] font-bold">
                          NOW ·{" "}
                          {new Date(nowMs).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        <div className="flex-1 h-[1.5px] bg-emerald-400" />
                      </div>
                    )}

                    <div
                      className={`rounded-[22px] border p-3.5 space-y-2 transition ${
                        isPassed
                          ? "border-white/[0.05] bg-white/[0.02] opacity-40"
                          : isActive
                            ? "border-emerald-400/50 bg-emerald-400/10"
                            : "border-white/10 bg-[#131722]"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono-code text-slate-400">
                        <span>
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
                          <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-[#090B10] text-[10px] font-bold">
                            LIVE NOW
                          </span>
                        )}
                        {isPassed && (
                          <span className="uppercase text-[10px]">Passed</span>
                        )}
                      </div>

                      <p
                        className={`text-sm font-bold text-white ${
                          isPassed ? "line-through" : ""
                        }`}
                      >
                        {ev.title}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          {ev.location && (
                            <>
                              <MapPin className="w-3 h-3" />
                              {ev.location}
                            </>
                          )}
                        </span>

                        {ev.type === "class" && (
                          <div className="flex items-center gap-1.5">
                            {ev.attendanceMarked === "present" ? (
                              <span className="text-xs font-bold text-emerald-300">
                                ✓ In Class (+50)
                              </span>
                            ) : ev.attendanceMarked === "cancelled" ? (
                              <span className="text-xs font-bold text-amber-300">
                                ⊘ Cancelled
                              </span>
                            ) : (
                              <>
                                {nowMs >= startMs + 30 * 60 * 1000 && (
                                  <button
                                    onClick={() =>
                                      handleClassOutcome(ev, "present")
                                    }
                                    className="px-2.5 py-1 rounded-xl bg-emerald-400 text-[#090B10] text-xs font-bold cursor-pointer"
                                  >
                                    Check-In ✓
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    handleClassOutcome(ev, "cancelled")
                                  }
                                  className="px-2.5 py-1 rounded-xl border border-white/15 text-xs text-slate-300 cursor-pointer"
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
                              <span className="text-xs font-bold text-violet-300">
                                ✓ +40 XP
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
                                  showNotice("⚡ +40 XP Study Block Completed!");
                                }}
                                className="px-2.5 py-1 rounded-xl bg-violet-500 text-white text-xs font-bold cursor-pointer"
                              >
                                +40 XP ✓
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
              <h2 className="text-base font-bold text-white">
                75% Attendance Pace
              </h2>
              <span className="text-xs font-mono-code text-slate-400">
                White marker = 75%
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
                  className={`rounded-[24px] border p-4 space-y-2.5 bg-[#131722] ${
                    isAtRisk ? "border-rose-500/35" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono-code text-xs font-bold text-white">
                        {course.code}
                      </span>
                      <p className="text-xs text-slate-400">{course.title}</p>
                    </div>
                    <div className="text-right font-mono-code">
                      <span
                        className={`text-sm font-bold ${
                          isAtRisk ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {pct}%
                      </span>
                      <p className="text-[10px] text-slate-500">
                        {course.attendedClasses}/{course.totalClassesHeld}
                      </p>
                    </div>
                  </div>

                  {/* Copilot Horizontal Pace Bar with 75% Vertical Marker */}
                  <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isAtRisk ? "bg-rose-500" : "bg-emerald-400"
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white"
                      style={{ left: "75%" }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={
                        isAtRisk
                          ? "text-rose-300 font-medium"
                          : "text-emerald-300 font-medium"
                      }
                    >
                      {isAtRisk
                        ? `Below 75% — attend next ${classesNeededToRecover}`
                        : `Ahead of pace — ${safeSkipsAvailable} safe skips`}
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
                        className="p-1.5 rounded-lg bg-white/5 border border-white/10"
                      >
                        <Plus className="w-3 h-3" />
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
                        className="p-1.5 rounded-lg bg-white/5 border border-white/10"
                      >
                        <Minus className="w-3 h-3" />
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
            <div className="rounded-[26px] border border-emerald-400/35 bg-emerald-400/10 p-4 space-y-1">
              <span className="font-mono-code text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
                Jomo Strict Mode Unlocks
              </span>
              <div className="text-2xl font-bold font-mono-code text-white">
                {xpPoints} XP · Level {Math.floor(xpPoints / 150) + 1}
              </div>
              <p className="text-xs text-slate-300">
                Class Check-In +50 XP · Study Block +40 XP · Early Task +60 XP
              </p>
            </div>

            {[
              {
                title: "🔓 2h Guilt-Free Gaming / Netflix Pass",
                cost: 150,
                desc: "Unlocks distraction shield for a 2-hour evening chill window",
              },
              {
                title: "⚡ AI High-Yield Exam Cheat Sheet",
                cost: 250,
                desc: "Instant predicted lecturer quiz & 1-page cram sheet",
              },
              {
                title: "🌯 Takeout / Shawarma Milestone Treat",
                cost: 400,
                desc: "Reward for hitting your class + study streak",
              },
              {
                title: "🛡️ Safe-Skip Shield Token (80%+ Buffer)",
                cost: 500,
                desc: "Cash in 1 guilt-free skip on SEN 201 or BU COS 209",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="rounded-[22px] border border-white/10 bg-[#131722] p-4 flex items-center justify-between gap-3"
              >
                <div className="text-xs space-y-1">
                  <p className="font-bold text-white">{item.title}</p>
                  <p className="text-slate-400">{item.desc}</p>
                </div>
                <button
                  disabled={xpPoints < item.cost}
                  onClick={() => {
                    addXp(-item.cost);
                    showNotice(`Unlocked: ${item.title}!`);
                  }}
                  className="shrink-0 px-3.5 py-2 rounded-xl bg-emerald-400 disabled:opacity-30 text-[#090B10] text-xs font-bold cursor-pointer"
                >
                  {item.cost} XP
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* FLOATING GLASS BOTTOM DOCK (COPILOT × JOMO STYLE) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 pb-4 pt-2 bg-gradient-to-t from-[#0B0D13] via-[#0B0D13]/95 to-transparent">
        <div className="rounded-[24px] p-1.5 border border-white/12 bg-[#161B28]/95 backdrop-blur-xl grid grid-cols-4 gap-1 text-center text-xs font-semibold shadow-2xl">
          <button
            onClick={() => setActiveTab("dump")}
            className={`py-2.5 rounded-[18px] flex items-center justify-center gap-1 cursor-pointer transition ${
              activeTab === "dump"
                ? "bg-emerald-400 text-[#090B10] font-bold"
                : "text-slate-400"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dump</span>
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`py-2.5 rounded-[18px] flex items-center justify-center gap-1 cursor-pointer transition ${
              activeTab === "timeline"
                ? "bg-emerald-400 text-[#090B10] font-bold"
                : "text-slate-400"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Timeline</span>
          </button>
          <button
            onClick={() => setActiveTab("guard")}
            className={`py-2.5 rounded-[18px] flex items-center justify-center gap-1 cursor-pointer transition ${
              activeTab === "guard"
                ? "bg-emerald-400 text-[#090B10] font-bold"
                : "text-slate-400"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>75% Pace</span>
          </button>
          <button
            onClick={() => setActiveTab("rewards")}
            className={`py-2.5 rounded-[18px] flex items-center justify-center gap-1 cursor-pointer transition ${
              activeTab === "rewards"
                ? "bg-emerald-400 text-[#090B10] font-bold"
                : "text-slate-400"
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Unlocks</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
