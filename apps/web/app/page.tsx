"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  RotateCcw,
  Bell,
  MapPin,
  KeyRound,
  RefreshCw,
  Check,
  ArrowUpRight,
  Sun,
  Moon,
  CornerDownLeft,
  Plus,
  Minus,
  BookOpen,
  BookMarked,
  GraduationCap,
  FileText,
  Upload,
  Send,
  Pencil,
  X,
  AlertTriangle,
  Sparkles,
  Award,
} from "lucide-react";
import {
  BABCOCK_UNIVERSITY_HANDBOOK_RULES,
  CourseProfile,
  DEFAULT_BABCOCK_COURSES,
  computeAttendanceStatus,
} from "./lib/babcockKnowledge";

type Domain = "school" | "founder" | "personal";
type Priority = "high" | "medium" | "low";
type EventType = "class" | "study" | "founder" | "exam";
type Confidence = "weak" | "review" | "solid";

interface Subtask {
  title: string;
  completed: boolean;
}

interface TaskItem {
  id: string;
  title: string;
  domain: Domain;
  courseCode?: string | null;
  priority: Priority;
  dueLabel?: string;
  dueIso?: string | null;
  subtasks: Subtask[];
  status: "todo" | "done";
  brainDumpId?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  courseCode?: string | null;
  location?: string | null;
  startIso: string;
  endIso: string;
  gcalEventId?: string;
  syncStatus: "pending_push" | "synced" | "external";
  attendanceMarked?: "present" | "absent";
  brainDumpId?: string;
}

interface StudyTopic {
  id: string;
  courseCode: string;
  topic: string;
  confidence: Confidence;
  brainDumpId?: string;
}

interface CoachingBrief {
  teacherNote: string;
  attendanceWarning?: string | null;
  testPrediction?: string | null;
  textbookRecommendation?: string | null;
}

interface BrainDumpReceipt {
  id: string;
  rawText: string;
  summary: string;
  counts: {
    tasks: number;
    events: number;
    studyTopics: number;
  };
  coaching?: CoachingBrief;
  undone: boolean;
  createdAt: number;
}

interface TutorQuiz {
  question: string;
  options: string[];
  correctIndex: number;
  workedSolution: string;
}

interface TutorLesson {
  explanation: string;
  keyTakeaways: string[];
  textbookGuide: string;
  lecturerExamTip: string;
  quiz: TutorQuiz;
}

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

interface HandbookAgentReply {
  answer: string;
  citationsOrRules: string[];
  suggestedAction?: string | null;
}

interface ProactiveNotification {
  id: string;
  title: string;
  body: string;
  category: "class_t15m" | "task_deadline" | "daily_brief" | "gap_nudge";
  read: boolean;
}

const QUICK_DUMPS = [
  {
    label: "+ Reschedule COS 201 test",
    prompt:
      "COS 201 test moved to Friday 10am at New Horizon Rm 2, study Discrete Structures for 2 hours tonight, and ship onboarding update tomorrow",
  },
  {
    label: "+ IFT 211 Lab & Founder Sync",
    prompt:
      "IFT 211 lab report due Thursday 5pm, review Karnaugh Maps (still weak), and schedule Founder growth sync tomorrow at 4pm",
  },
  {
    label: "+ SEN 201 Presentation",
    prompt:
      "SEN 201 group presentation next Wednesday at 10am at New Horizon Rm 5, finish UML sequence diagrams tonight",
  },
];

export default function DysAIDashboard() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);
  const [theme, setTheme] = useState<"paper" | "obsidian">("paper");
  const [dumpInput, setDumpInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<"all" | Domain>("all");
  const [agendaTab, setAgendaTab] = useState<"today" | "tomorrow" | "week">(
    "today"
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(
    "task-seed-1"
  );
  const [activeReceipt, setActiveReceipt] = useState<BrainDumpReceipt | null>(
    null
  );
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeyOverride, setApiKeyOverride] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSyncingGcal, setIsSyncingGcal] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [dismissedCheckInIds, setDismissedCheckInIds] = useState<string[]>([]);
  const [checkInToast, setCheckInToast] = useState<string | null>(null);
  const hasLoadedStorage = useRef(false);

  const [courses, setCourses] = useState<CourseProfile[]>(
    DEFAULT_BABCOCK_COURSES
  );
  const [customHandbookText, setCustomHandbookText] = useState("");

  // Study Topic Quick-Add state
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicCourse, setNewTopicCourse] = useState("IFT 211");
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicConfidence, setNewTopicConfidence] =
    useState<Confidence>("weak");

  // Interactive AI Teacher & Quiz Modal state
  const [activeTutorTopic, setActiveTutorTopic] = useState<StudyTopic | null>(
    null
  );
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [tutorLesson, setTutorLesson] = useState<TutorLesson | null>(null);
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(
    null
  );
  const [tutorChat, setTutorChat] = useState<ChatTurn[]>([]);
  const [tutorFollowUpInput, setTutorFollowUpInput] = useState("");
  const [tutorFollowUpLoading, setTutorFollowUpLoading] = useState(false);

  // Course / Lecturer / Textbook Editor Modal state
  const [editingCourse, setEditingCourse] = useState<CourseProfile | null>(
    null
  );
  const [isNewCourse, setIsNewCourse] = useState(false);
  const [courseForm, setCourseForm] = useState<CourseProfile>({
    code: "",
    title: "",
    attendedClasses: 0,
    totalClassesHeld: 0,
    targetAttendanceRatio: 0.75,
    lecturerName: "",
    teachingStyle: "",
    testPattern: "",
    recommendedTextbooks: "",
  });

  // Babcock Handbook & Agent Hub Modal state
  const [showHandbookModal, setShowHandbookModal] = useState(false);
  const [handbookTab, setHandbookTab] = useState<"agent" | "rules">("agent");
  const [handbookQuestion, setHandbookQuestion] = useState("");
  const [handbookFile, setHandbookFile] = useState<{
    name: string;
    mimeType: string;
    data: string;
  } | null>(null);
  const [handbookChat, setHandbookChat] = useState<
    Array<{ question: string; reply: HandbookAgentReply }>
  >([]);
  const [handbookLoading, setHandbookLoading] = useState(false);
  const [handbookError, setHandbookError] = useState<string | null>(null);

  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [tasks, setTasks] = useState<TaskItem[]>([
    {
      id: "task-seed-1",
      title: "Ship user feedback & product iteration sprint deliverables",
      domain: "founder",
      courseCode: null,
      priority: "high",
      dueLabel: "Tomorrow · 5:00 PM",
      status: "todo",
      subtasks: [
        { title: "Finalize onboarding flow polish", completed: true },
        {
          title: "Review weekly growth & partnership metrics",
          completed: false,
        },
        { title: "Push release build to staging", completed: false },
      ],
    },
    {
      id: "task-seed-2",
      title: "Complete CSC 203 Discrete Structures problem set",
      domain: "school",
      courseCode: "CSC 203",
      priority: "high",
      dueLabel: "Thu · 10:00 AM",
      status: "todo",
      subtasks: [
        {
          title: "Solve recurrence relations & induction proofs",
          completed: true,
        },
        {
          title: "Review equivalence relations before class",
          completed: false,
        },
      ],
    },
    {
      id: "task-seed-3",
      title: "Prepare IFT 211 combinational logic lab notes",
      domain: "school",
      courseCode: "IFT 211",
      priority: "medium",
      dueLabel: "Fri · 2:00 PM",
      status: "todo",
      subtasks: [
        { title: "Simplify 4-variable K-Map expressions", completed: false },
        { title: "Verify truth tables for multiplexer circuit", completed: false },
      ],
    },
  ]);

  const [studyTopics, setStudyTopics] = useState<StudyTopic[]>([
    {
      id: "st-seed-1",
      courseCode: "CSC 203",
      topic: "Mathematical Induction & Recurrence Relations",
      confidence: "weak",
    },
    {
      id: "st-seed-2",
      courseCode: "IFT 211",
      topic: "Sequential Logic & Flip-Flop Timing",
      confidence: "review",
    },
    {
      id: "st-seed-3",
      courseCode: "COS 201",
      topic: "Pointers, Arrays & Memory Allocation",
      confidence: "review",
    },
    {
      id: "st-seed-4",
      courseCode: "SEN 201",
      topic: "Requirements Engineering & UML Architecture",
      confidence: "solid",
    },
  ]);

  const [dumps, setDumps] = useState<BrainDumpReceipt[]>([]);

  const [notifications, setNotifications] = useState<ProactiveNotification[]>([
    {
      id: "notif-1",
      title: "Attendance Guard: COS 201 (73%) & IFT 211 (71%)",
      body: "Both are slightly below the 75% threshold. Attend your next E102 and New Horizon Rm 2 lectures.",
      category: "class_t15m",
      read: false,
    },
    {
      id: "notif-2",
      title: "Free-Block Gap Nudge",
      body: "You have an open window between Maths (4:50 PM) and your 7:00 PM Founder Block at Hostel.",
      category: "gap_nudge",
      read: false,
    },
  ]);

  const syncFromGoogleCalendar = async () => {
    try {
      setIsSyncingGcal(true);
      const res = await fetch("/api/gcal");
      const data = await res.json();
      if (data.error) {
        setGcalConnected(false);
        setErrorMsg(`Google Calendar: ${data.error}`);
        return;
      }
      if (data.configured) {
        setGcalConnected(true);
        if (Array.isArray(data.events)) {
          setEvents((prev) => {
            const localOnly = prev.filter((e) => !e.id.startsWith("gcal-"));
            const merged = [...localOnly, ...data.events];
            return merged.sort(
              (a, b) => Date.parse(a.startIso) - Date.parse(b.startIso)
            );
          });
        }
      }
    } catch {
      setGcalConnected(false);
    } finally {
      setIsSyncingGcal(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    const savedKey = window.localStorage.getItem("dysai_gemini_key");
    if (savedKey) setApiKeyOverride(savedKey);
    const savedTheme = window.localStorage.getItem("dysai_theme") as
      | "paper"
      | "obsidian"
      | null;
    if (savedTheme) setTheme(savedTheme);

    try {
      const savedCourses = window.localStorage.getItem("dysai_babcock_courses");
      if (savedCourses) {
        const parsedCourses = JSON.parse(savedCourses);
        if (Array.isArray(parsedCourses) && parsedCourses.length > 0) {
          setCourses(parsedCourses);
        }
      }
      const savedHandbook = window.localStorage.getItem(
        "dysai_babcock_handbook_text"
      );
      if (savedHandbook) setCustomHandbookText(savedHandbook);
    } catch {
      // Ignore malformed localStorage cache
    }
    hasLoadedStorage.current = true;

    syncFromGoogleCalendar();

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    setNowMs(Date.now());
    const clockInterval = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearInterval(clockInterval);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage.current) return;
    window.localStorage.setItem(
      "dysai_babcock_courses",
      JSON.stringify(courses)
    );
  }, [courses]);

  useEffect(() => {
    if (!hasLoadedStorage.current) return;
    window.localStorage.setItem(
      "dysai_babcock_handbook_text",
      customHandbookText
    );
  }, [customHandbookText]);

  const toggleTheme = () => {
    const next = theme === "paper" ? "obsidian" : "paper";
    setTheme(next);
    window.localStorage.setItem("dysai_theme", next);
  };

  const handleBrainDumpSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = dumpInput.trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/brain-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: trimmed,
          currentIsoTime: new Date().toISOString(),
          courses,
          customHandbookText,
          apiKeyOverride: apiKeyOverride.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to parse Brain Dump");
      }

      const dumpId = `dump-${Date.now()}`;

      // 1. Auto-register any new course codes discovered by Gemini
      const discoveredCodes = new Set<string>();
      data.tasks?.forEach((t: { courseCode?: string }) => {
        if (t.courseCode) discoveredCodes.add(t.courseCode.toUpperCase());
      });
      data.events?.forEach((ev: { courseCode?: string }) => {
        if (ev.courseCode) discoveredCodes.add(ev.courseCode.toUpperCase());
      });
      data.studyTopics?.forEach((st: { courseCode?: string }) => {
        if (st.courseCode) discoveredCodes.add(st.courseCode.toUpperCase());
      });

      if (discoveredCodes.size > 0) {
        setCourses((prev) => {
          const existingCodes = new Set(prev.map((c) => c.code));
          const additions: CourseProfile[] = [];
          discoveredCodes.forEach((code) => {
            if (!existingCodes.has(code)) {
              additions.push({
                code,
                title: `${code} Course`,
                attendedClasses: 1,
                totalClassesHeld: 1,
                targetAttendanceRatio: 0.75,
                lecturerName: "",
                teachingStyle: "",
                testPattern: "",
                recommendedTextbooks: "",
              });
            }
          });
          return [...prev, ...additions];
        });
      }

      // 2. Commit parsed Tasks
      const createdTasks: TaskItem[] = (data.tasks || []).map(
        (
          t: {
            title: string;
            domain: Domain;
            courseCode?: string | null;
            priority: Priority;
            dueIso?: string | null;
            subtasks: string[];
          },
          i: number
        ) => ({
          id: `${dumpId}-t-${i}`,
          title: t.title,
          domain: t.domain,
          courseCode: t.courseCode ? t.courseCode.toUpperCase() : null,
          priority: t.priority,
          dueIso: t.dueIso || null,
          subtasks: (t.subtasks || []).map((st) => ({
            title: st,
            completed: false,
          })),
          status: "todo",
          brainDumpId: dumpId,
        })
      );

      // 3. Commit parsed Events
      const createdEvents: CalendarEvent[] = (data.events || []).map(
        (
          ev: {
            title: string;
            type: EventType;
            courseCode?: string | null;
            location?: string | null;
            startIso: string;
            endIso: string;
          },
          i: number
        ) => ({
          id: `${dumpId}-ev-${i}`,
          title: ev.title,
          type: ev.type,
          courseCode: ev.courseCode ? ev.courseCode.toUpperCase() : null,
          location: ev.location || null,
          startIso: ev.startIso,
          endIso: ev.endIso,
          gcalEventId: `gcal_${dumpId}_${i}`,
          syncStatus: "synced",
          brainDumpId: dumpId,
        })
      );

      // 4. Commit parsed Study Topics
      const createdTopics: StudyTopic[] = (data.studyTopics || []).map(
        (
          st: {
            courseCode: string;
            topic: string;
            confidence: Confidence;
          },
          i: number
        ) => ({
          id: `${dumpId}-st-${i}`,
          courseCode: st.courseCode.toUpperCase(),
          topic: st.topic,
          confidence: st.confidence,
          brainDumpId: dumpId,
        })
      );

      const receipt: BrainDumpReceipt = {
        id: dumpId,
        rawText: trimmed,
        summary: data.summary,
        counts: {
          tasks: createdTasks.length,
          events: createdEvents.length,
          studyTopics: createdTopics.length,
        },
        coaching: data.coaching || undefined,
        undone: false,
        createdAt: Date.now(),
      };

      setTasks((prev) => [...createdTasks, ...prev]);
      if (createdTasks.length > 0) {
        setExpandedTaskId(createdTasks[0].id);
      }
      setEvents((prev) =>
        [...prev, ...createdEvents].sort(
          (a, b) => Date.parse(a.startIso) - Date.parse(b.startIso)
        )
      );
      setStudyTopics((prev) => [...createdTopics, ...prev]);
      setDumps((prev) => [receipt, ...prev]);
      setActiveReceipt(receipt);
      setDumpInput("");

      if (createdEvents.length > 0) {
        fetch("/api/gcal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: createdEvents }),
        })
          .then((r) => r.json())
          .then((gcalRes) => {
            if (gcalRes.pushed?.length) {
              const idMap = new Map<string, string>(
                gcalRes.pushed.map(
                  (p: { localId: string; gcalEventId: string }) => [
                    p.localId,
                    p.gcalEventId,
                  ]
                )
              );
              setEvents((prev) =>
                prev.map((ev) =>
                  idMap.has(ev.id)
                    ? {
                        ...ev,
                        gcalEventId: idMap.get(ev.id),
                        syncStatus: "synced",
                      }
                    : ev
                )
              );
            }
          })
          .catch(() => {});
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Unexpected error parsing dump";
      setErrorMsg(msg);
      if (msg.includes("GEMINI_API_KEY")) {
        setShowKeyModal(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoDump = (dumpId: string) => {
    const eventsToDelete = events
      .filter((ev) => ev.brainDumpId === dumpId && ev.gcalEventId)
      .map((ev) => ev.gcalEventId!);
    if (eventsToDelete.length > 0) {
      fetch("/api/gcal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gcalEventIds: eventsToDelete }),
      }).catch(() => {});
    }

    setTasks((prev) => prev.filter((t) => t.brainDumpId !== dumpId));
    setEvents((prev) => prev.filter((ev) => ev.brainDumpId !== dumpId));
    setStudyTopics((prev) => prev.filter((st) => st.brainDumpId !== dumpId));
    setDumps((prev) =>
      prev.map((d) => (d.id === dumpId ? { ...d, undone: true } : d))
    );
    if (activeReceipt?.id === dumpId) {
      setActiveReceipt((prev) => (prev ? { ...prev, undone: true } : null));
    }
  };

  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === "done" ? "todo" : "done" }
          : t
      )
    );
  };

  const toggleSubtask = (taskId: string, subIndex: number) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: t.subtasks.map((st, idx) =>
                idx === subIndex ? { ...st, completed: !st.completed } : st
              ),
            }
          : t
      )
    );
  };

  const cycleConfidence = (topicId: string) => {
    const order: Confidence[] = ["weak", "review", "solid"];
    setStudyTopics((prev) =>
      prev.map((st) =>
        st.id === topicId
          ? {
              ...st,
              confidence:
                order[(order.indexOf(st.confidence) + 1) % order.length],
            }
          : st
      )
    );
  };

  const recordAttendance = (
    code: string,
    present: boolean,
    eventId?: string,
    courseTitle?: string
  ) => {
    const normalizedCode = code.trim().toUpperCase();

    // 1. Mark the calendar event as present/absent if linked
    if (eventId) {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === eventId
            ? { ...ev, attendanceMarked: present ? "present" : "absent" }
            : ev
        )
      );
      setDismissedCheckInIds((prev) => [...prev, eventId]);
    }

    // 2. Auto-increment (or auto-create) the course in the 75% Attendance Guard
    setCourses((prev) => {
      const exists = prev.some((c) => c.code.toUpperCase() === normalizedCode);
      if (exists) {
        return prev.map((c) =>
          c.code.toUpperCase() === normalizedCode
            ? {
                ...c,
                totalClassesHeld: c.totalClassesHeld + 1,
                attendedClasses: c.attendedClasses + (present ? 1 : 0),
              }
            : c
        );
      }
      return [
        {
          code: normalizedCode,
          title: courseTitle || `${normalizedCode} Course`,
          attendedClasses: present ? 1 : 0,
          totalClassesHeld: 1,
          targetAttendanceRatio: 0.75,
        },
        ...prev,
      ];
    });

    // 3. Sync with Convex DB via /api/attendance
    fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseCode: normalizedCode,
        present,
        eventId,
      }),
    }).catch(() => {});

    setCheckInToast(
      present
        ? `✓ Checked in to ${normalizedCode} — synced to 75% Attendance Guard & Convex DB`
        : `Logged missed class for ${normalizedCode} — synced to Convex DB`
    );
    setTimeout(() => setCheckInToast(null), 4500);
  };

  const updateTopicConfidence = (topicId: string, confidence: Confidence) => {
    setStudyTopics((prev) =>
      prev.map((st) => (st.id === topicId ? { ...st, confidence } : st))
    );
    setActiveTutorTopic((prev) =>
      prev && prev.id === topicId ? { ...prev, confidence } : prev
    );
  };

  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTopicTitle.trim();
    if (!trimmed) return;
    const added: StudyTopic = {
      id: `st-custom-${Date.now()}`,
      courseCode: newTopicCourse.trim().toUpperCase() || "GEN",
      topic: trimmed,
      confidence: newTopicConfidence,
    };
    setStudyTopics((prev) => [added, ...prev]);
    setNewTopicTitle("");
    setShowAddTopic(false);
  };

  const openTopicTutor = async (topic: StudyTopic) => {
    setActiveTutorTopic(topic);
    setTutorLoading(true);
    setTutorError(null);
    setTutorLesson(null);
    setSelectedQuizOption(null);
    setTutorChat([]);
    setTutorFollowUpInput("");

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "teach_topic",
          courseCode: topic.courseCode,
          topic: topic.topic,
          confidence: topic.confidence,
          courses,
          customHandbookText,
          apiKeyOverride: apiKeyOverride.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load AI Tutor lesson");
      }
      setTutorLesson(data as TutorLesson);
    } catch (err: unknown) {
      setTutorError(
        err instanceof Error ? err.message : "Could not generate lesson"
      );
    } finally {
      setTutorLoading(false);
    }
  };

  const sendTutorFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTutorTopic || !tutorFollowUpInput.trim() || tutorFollowUpLoading)
      return;
    const question = tutorFollowUpInput.trim();
    const nextHistory: ChatTurn[] = [
      ...tutorChat,
      { role: "user", text: question },
    ];
    setTutorChat(nextHistory);
    setTutorFollowUpInput("");
    setTutorFollowUpLoading(true);
    setTutorError(null);

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "teach_topic",
          courseCode: activeTutorTopic.courseCode,
          topic: activeTutorTopic.topic,
          confidence: activeTutorTopic.confidence,
          userMessage: question,
          chatHistory: tutorChat,
          courses,
          customHandbookText,
          apiKeyOverride: apiKeyOverride.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to get tutor reply");
      }
      setTutorChat((prev) => [
        ...prev,
        { role: "assistant", text: data.reply },
      ]);
    } catch (err: unknown) {
      setTutorError(
        err instanceof Error ? err.message : "Failed to send follow-up"
      );
    } finally {
      setTutorFollowUpLoading(false);
    }
  };

  const openEditCourseModal = (course: CourseProfile) => {
    setIsNewCourse(false);
    setEditingCourse(course);
    setCourseForm({ ...course });
  };

  const openNewCourseModal = () => {
    const blank: CourseProfile = {
      code: "",
      title: "",
      attendedClasses: 0,
      totalClassesHeld: 0,
      targetAttendanceRatio: 0.75,
      lecturerName: "",
      teachingStyle: "",
      testPattern: "",
      recommendedTextbooks: "",
    };
    setIsNewCourse(true);
    setEditingCourse(blank);
    setCourseForm(blank);
  };

  const saveCourseProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const code = courseForm.code.trim().toUpperCase();
    if (!code) return;
    const normalized: CourseProfile = {
      ...courseForm,
      code,
      title: courseForm.title.trim() || `${code} Course`,
      attendedClasses: Math.max(0, Number(courseForm.attendedClasses) || 0),
      totalClassesHeld: Math.max(0, Number(courseForm.totalClassesHeld) || 0),
      targetAttendanceRatio: 0.75,
    };

    if (isNewCourse) {
      setCourses((prev) => {
        const exists = prev.some((c) => c.code === code);
        if (exists) {
          return prev.map((c) => (c.code === code ? normalized : c));
        }
        return [...prev, normalized];
      });
    } else if (editingCourse) {
      setCourses((prev) =>
        prev.map((c) => (c.code === editingCourse.code ? normalized : c))
      );
    }
    setEditingCourse(null);
  };

  const handleHandbookFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHandbookError(null);

    if (file.size > 10 * 1024 * 1024) {
      setHandbookError(
        "File is larger than 10MB. Please upload a smaller PDF or paste key text excerpts."
      );
      return;
    }

    const isTextFile =
      file.type.startsWith("text/") ||
      file.name.toLowerCase().endsWith(".txt") ||
      file.name.toLowerCase().endsWith(".md");

    const reader = new FileReader();
    if (isTextFile) {
      reader.onload = () => {
        const content = typeof reader.result === "string" ? reader.result : "";
        setCustomHandbookText((prev) =>
          prev.trim()
            ? `${prev.trim()}\n\n--- ${file.name} ---\n${content}`
            : content
        );
        setHandbookFile(null);
      };
      reader.readAsText(file);
    } else {
      reader.onload = () => {
        const dataUrl =
          typeof reader.result === "string" ? reader.result : "";
        setHandbookFile({
          name: file.name,
          mimeType: file.type || "application/pdf",
          data: dataUrl,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const askHandbookAgent = async (
    e?: React.FormEvent,
    presetQuestion?: string
  ) => {
    if (e) e.preventDefault();
    const q = (presetQuestion ?? handbookQuestion).trim();
    if (!q || handbookLoading) return;

    setHandbookLoading(true);
    setHandbookError(null);
    if (!presetQuestion) setHandbookQuestion("");

    try {
      const historyForApi: ChatTurn[] = handbookChat.flatMap((turn) => [
        { role: "user", text: turn.question },
        { role: "assistant", text: turn.reply.answer },
      ]);

      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "ask_handbook_or_agent",
          question: q,
          courses,
          customHandbookText,
          fileData: handbookFile?.data,
          fileMimeType: handbookFile?.mimeType,
          fileName: handbookFile?.name,
          chatHistory: historyForApi,
          apiKeyOverride: apiKeyOverride.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to ask Babcock Agent");
      }
      setHandbookChat((prev) => [
        ...prev,
        { question: q, reply: data as HandbookAgentReply },
      ]);
    } catch (err: unknown) {
      setHandbookError(
        err instanceof Error ? err.message : "Failed to reach Babcock Agent"
      );
    } finally {
      setHandbookLoading(false);
    }
  };

  const filteredAgendaEvents = useMemo(() => {
    if (!mounted) return [];
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
    const dayAfterTomorrow = tomorrowStart + 24 * 60 * 60 * 1000;

    return events.filter((ev) => {
      const t = Date.parse(ev.startIso);
      if (isNaN(t)) return true;
      if (agendaTab === "today") {
        return t >= todayStart && t < tomorrowStart;
      }
      if (agendaTab === "tomorrow") {
        return t >= tomorrowStart && t < dayAfterTomorrow;
      }
      return true;
    });
  }, [events, agendaTab, mounted]);

  const filteredTasks = useMemo(() => {
    if (domainFilter === "all") return tasks;
    return tasks.filter((t) => t.domain === domainFilter);
  }, [tasks, domainFilter]);

  // Only open the Live Class Check-In prompt once a class is at least 30 minutes in (or has ended today without being marked)
  const pendingClassCheckIn = useMemo(() => {
    if (!mounted) return null;
    const now = Date.now();
    const thirtyMinsMs = 30 * 60 * 1000;

    const eligibleClasses = filteredAgendaEvents.filter((ev) => {
      if (ev.type !== "class") return false;
      if (ev.attendanceMarked || dismissedCheckInIds.includes(ev.id)) {
        return false;
      }
      const startMs = Date.parse(ev.startIso);
      if (isNaN(startMs)) return false;
      // Must be at least 30 minutes after class start time
      return now >= startMs + thirtyMinsMs;
    });

    // Prefer a class currently in session (30m+ in), otherwise the most recent ended class today
    const currentlyInSession = eligibleClasses.find((ev) => {
      const endMs = Date.parse(ev.endIso);
      return now <= endMs;
    });

    return (
      currentlyInSession ||
      eligibleClasses[eligibleClasses.length - 1] ||
      null
    );
  }, [filteredAgendaEvents, dismissedCheckInIds, mounted]);

  const isPaper = theme === "paper";
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        isPaper
          ? "bg-[#F6F5F0] text-[#141413] selection:bg-orange-500/20"
          : "bg-[#0A0A0C] text-[#F3F3F1] selection:bg-orange-500/30"
      }`}
    >
      {/* MINIMAL ARCHITECTURAL HEADER */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors ${
          isPaper
            ? "border-[#E4E2DA] bg-[#F6F5F0]/85"
            : "border-white/[0.08] bg-[#0A0A0C]/85"
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
          {/* Left Brand & Date */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EA580C]" />
              <span className="font-serif-display text-xl tracking-tight">
                DysAI
              </span>
            </div>
            <span
              className={`h-4 w-[1px] ${
                isPaper ? "bg-[#DCD9CE]" : "bg-white/10"
              }`}
            />
            <span
              className={`text-xs font-medium ${
                isPaper ? "text-[#6E6D68]" : "text-zinc-400"
              }`}
            >
              {mounted
                ? new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })
                : "Academic & Founder OS"}
            </span>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={syncFromGoogleCalendar}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                isPaper
                  ? "border-[#DCD9CE] bg-white hover:bg-[#EFECE4] text-[#141413]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-zinc-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  gcalConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <RefreshCw
                className={`w-3 h-3 ${isSyncingGcal ? "animate-spin" : ""}`}
              />
              <span>
                {gcalConnected
                  ? `demiladepc1 · ${events.length} synced`
                  : "Sync Calendar"}
              </span>
            </button>

            <button
              onClick={() => setShowHandbookModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                isPaper
                  ? "border-[#EA580C]/30 bg-[#EA580C]/10 hover:bg-[#EA580C]/15 text-[#EA580C]"
                  : "border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/15 text-orange-400"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Babcock Handbook</span>
            </button>

            <button
              onClick={() => setShowKeyModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                isPaper
                  ? "border-[#DCD9CE] bg-white hover:bg-[#EFECE4] text-[#4A4945]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-zinc-300"
              }`}
            >
              <KeyRound className="w-3 h-3" />
              <span className="hidden sm:inline">API Key</span>
            </button>

            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                isPaper
                  ? "border-[#DCD9CE] bg-white hover:bg-[#EFECE4] text-[#141413]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-zinc-200"
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-[#EA580C] text-white text-[10px] font-semibold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={toggleTheme}
              title="Switch Theme (Paper / Obsidian)"
              className={`p-2 rounded-full border transition cursor-pointer ${
                isPaper
                  ? "border-[#DCD9CE] bg-white hover:bg-[#EFECE4] text-[#141413]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-zinc-200"
              }`}
            >
              {isPaper ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* NOTIFICATION POPOVER */}
      {showNotifications && (
        <div
          className={`fixed right-6 top-16 z-40 w-80 rounded-2xl border p-4 shadow-xl space-y-2.5 ${
            isPaper
              ? "border-[#DCD9CE] bg-white text-[#141413]"
              : "border-white/10 bg-[#121216] text-white"
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-current/10">
            <span className="text-xs font-semibold">Proactive Nudges</span>
            <span className="text-[11px] opacity-50">Live Crons</span>
          </div>
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() =>
                setNotifications((prev) =>
                  prev.map((item) =>
                    item.id === n.id ? { ...item, read: true } : item
                  )
                )
              }
              className={`p-3 rounded-xl text-xs space-y-1 cursor-pointer transition ${
                isPaper ? "bg-[#F6F5F0]" : "bg-white/[0.04]"
              } ${n.read ? "opacity-50" : ""}`}
            >
              <p className="font-semibold">{n.title}</p>
              <p className="opacity-70 leading-relaxed">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* API KEY MODAL */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isPaper
                ? "border-[#DCD9CE] bg-white text-[#141413]"
                : "border-white/10 bg-[#121216] text-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Gemini 2.5 Flash Key</h3>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
              >
                Close
              </button>
            </div>
            <p className="text-xs opacity-70 leading-relaxed">
              Your Gemini key is already active in <code>.env.local</code>. You
              can optionally set a custom key below.
            </p>
            <input
              type="password"
              value={apiKeyOverride}
              onChange={(e) => setApiKeyOverride(e.target.value)}
              placeholder="Using server .env.local key..."
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${
                isPaper
                  ? "border-[#DCD9CE] bg-[#F6F5F0]"
                  : "border-white/10 bg-black/40"
              }`}
            />
            <div className="flex justify-end">
              <button
                onClick={() => {
                  window.localStorage.setItem(
                    "dysai_gemini_key",
                    apiKeyOverride.trim()
                  );
                  setShowKeyModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-[#EA580C] text-white text-xs font-medium cursor-pointer"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
        {/* SLEEK FLOATING COMMAND OMNIBAR */}
        <section className="space-y-2.5">
          <form
            onSubmit={handleBrainDumpSubmit}
            className={`relative flex items-center rounded-2xl border transition-all ${
              isPaper
                ? "border-[#D8D5C8] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-within:border-[#141413]"
                : "border-white/[0.1] bg-[#121216] shadow-2xl focus-within:border-white/30"
            }`}
          >
            <div className="pl-4 pr-2 flex items-center">
              <span className="px-2 py-0.5 rounded-md bg-[#EA580C]/10 text-[#EA580C] font-mono-code text-[11px] font-medium">
                ⌘K
              </span>
            </div>

            <input
              ref={inputRef}
              type="text"
              value={dumpInput}
              onChange={(e) => setDumpInput(e.target.value)}
              placeholder="Brain dump anything — e.g. 'COS 201 test Friday 10am at New Horizon Rm 2, study Discrete Structures tonight, ship onboarding tomorrow'..."
              className="w-full py-4 px-2 text-sm bg-transparent focus:outline-none placeholder:opacity-45"
            />

            <div className="pr-3 flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={isProcessing || !dumpInput.trim()}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-35 ${
                  isPaper
                    ? "bg-[#141413] text-white hover:bg-[#2a2a28]"
                    : "bg-white text-[#0A0A0C] hover:bg-zinc-200"
                }`}
              >
                <span>{isProcessing ? "Parsing..." : "Capture"}</span>
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>

          {/* Compact Single-Line Quick Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] opacity-50 mr-1">Quick test:</span>
              {QUICK_DUMPS.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setDumpInput(item.prompt)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                    isPaper
                      ? "border-[#E2DFD5] bg-[#EFECE4]/60 hover:bg-[#E6E2D6] text-[#4A4945]"
                      : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06] text-zinc-400"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {errorMsg && (
              <span className="text-xs text-rose-500 font-medium">
                {errorMsg}
              </span>
            )}
          </div>

          {/* LIVE ACTION RECEIPT + BABCOCK AI TEACHER BRIEF */}
          {activeReceipt && (
            <div className="space-y-2.5">
              <div
                className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-4 py-2.5 text-xs ${
                  isPaper
                    ? "border-emerald-600/25 bg-emerald-500/10 text-[#141413]"
                    : "border-emerald-500/25 bg-emerald-500/10 text-zinc-100"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {activeReceipt.undone ? "Undone" : "Receipt"}
                  </span>
                  <span className="font-mono-code text-[11px] opacity-75">
                    +{activeReceipt.counts.events} Events · +
                    {activeReceipt.counts.tasks} Tasks · +
                    {activeReceipt.counts.studyTopics} Topics
                  </span>
                  <span className="opacity-80">— {activeReceipt.summary}</span>
                </div>

                {!activeReceipt.undone && (
                  <button
                    onClick={() => handleUndoDump(activeReceipt.id)}
                    className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Undo
                  </button>
                )}
              </div>

              {!activeReceipt.undone && activeReceipt.coaching && (
                <div
                  className={`rounded-xl border p-4 text-xs space-y-3 ${
                    isPaper
                      ? "border-[#E2DFD5] bg-white shadow-xs"
                      : "border-white/[0.08] bg-[#121216]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-[#EA580C]" />
                      <span className="font-semibold">
                        Babcock AI Teacher &amp; Agent Brief
                      </span>
                    </div>
                    <button
                      onClick={() => setShowHandbookModal(true)}
                      className="text-[11px] font-medium text-[#EA580C] hover:underline cursor-pointer"
                    >
                      Ask Handbook Agent →
                    </button>
                  </div>

                  <p className="leading-relaxed opacity-85">
                    {activeReceipt.coaching.teacherNote}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {activeReceipt.coaching.attendanceWarning && (
                      <div
                        className={`rounded-lg border p-2.5 space-y-1 ${
                          isPaper
                            ? "border-rose-500/30 bg-rose-500/[0.07] text-rose-900"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          75% Attendance Alert
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90">
                          {activeReceipt.coaching.attendanceWarning}
                        </p>
                      </div>
                    )}

                    {activeReceipt.coaching.testPrediction && (
                      <div
                        className={`rounded-lg border p-2.5 space-y-1 ${
                          isPaper
                            ? "border-amber-500/30 bg-amber-500/[0.08] text-amber-950"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          Lecturer Test Predictor
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90">
                          {activeReceipt.coaching.testPrediction}
                        </p>
                      </div>
                    )}

                    {activeReceipt.coaching.textbookRecommendation && (
                      <div
                        className={`rounded-lg border p-2.5 space-y-1 ${
                          isPaper
                            ? "border-blue-500/30 bg-blue-500/[0.06] text-blue-950"
                            : "border-blue-500/30 bg-blue-500/10 text-blue-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                          <BookMarked className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          Textbook &amp; Chapter
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90">
                          {activeReceipt.coaching.textbookRecommendation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LIVE CLASS ATTENDANCE CHECK-IN PROMPT (MOBILE + WEB SYNC) */}
          {pendingClassCheckIn && (
            <div
              className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-4 py-3 transition-all ${
                isPaper
                  ? "border-[#EA580C]/30 bg-[#FFF7ED] text-[#141413] shadow-xs"
                  : "border-[#EA580C]/35 bg-[#EA580C]/[0.08] text-white"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EA580C] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#EA580C]" />
                </span>
                <div className="text-xs min-w-0">
                  <span className="font-mono-code text-[10px] uppercase tracking-wider text-[#EA580C] font-semibold mr-2">
                    Live Class Check-In
                  </span>
                  <span className="font-semibold">
                    Are you in{" "}
                    {pendingClassCheckIn.courseCode ||
                      pendingClassCheckIn.title}
                    {pendingClassCheckIn.location
                      ? ` (${pendingClassCheckIn.location})`
                      : ""}
                    ?
                  </span>
                  <span className="opacity-65 hidden md:inline ml-2">
                    — Confirm to auto-sync your 75% Attendance Guard &amp;
                    Convex DB.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() =>
                    recordAttendance(
                      pendingClassCheckIn.courseCode ||
                        pendingClassCheckIn.title,
                      true,
                      pendingClassCheckIn.id,
                      pendingClassCheckIn.title
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  Yes, I&apos;m in class
                </button>
                <button
                  onClick={() =>
                    recordAttendance(
                      pendingClassCheckIn.courseCode ||
                        pendingClassCheckIn.title,
                      false,
                      pendingClassCheckIn.id,
                      pendingClassCheckIn.title
                    )
                  }
                  className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                    isPaper
                      ? "border-[#E2DFD5] bg-white hover:bg-rose-500/10 hover:text-rose-600"
                      : "border-white/10 bg-white/[0.04] hover:bg-rose-500/20 hover:text-rose-300"
                  }`}
                >
                  Missed
                </button>
              </div>
            </div>
          )}

          {/* ATTENDANCE SYNC CONFIRMATION TOAST */}
          {checkInToast && (
            <div
              className={`rounded-xl border px-4 py-2.5 text-xs font-medium flex items-center justify-between ${
                isPaper
                  ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-900"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
              }`}
            >
              <span>{checkInToast}</span>
            </div>
          )}
        </section>

        {/* ARCHITECTURAL 3-COLUMN WORKSPACE */}
        <section
          className={`grid grid-cols-1 lg:grid-cols-12 rounded-2xl border overflow-hidden ${
            isPaper
              ? "border-[#E2DFD5] bg-white shadow-[0_12px_40px_rgb(0,0,0,0.03)] divide-y lg:divide-y-0 lg:divide-x divide-[#E8E6DF]"
              : "border-white/[0.08] bg-[#101014] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.07]"
          }`}
        >
          {/* COLUMN 1 (4 cols): AMIE / NOTION STYLE TIMELINE */}
          <div className="lg:col-span-4 p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif-display text-2xl tracking-tight">
                    Schedule
                  </h2>
                  <p className="text-xs opacity-50">
                    2-way synced with Google Calendar
                  </p>
                </div>

                {/* Clean Segmented Switcher */}
                <div
                  className={`flex items-center rounded-lg p-0.5 text-xs ${
                    isPaper ? "bg-[#F2F0E8]" : "bg-white/[0.05]"
                  }`}
                >
                  {(
                    [
                      { id: "today", label: "Today" },
                      { id: "tomorrow", label: "Tomorrow" },
                      { id: "week", label: "7d" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setAgendaTab(tab.id)}
                      className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        agendaTab === tab.id
                          ? isPaper
                            ? "bg-white text-[#141413] shadow-2xs"
                            : "bg-white/15 text-white"
                          : "opacity-55 hover:opacity-100"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time-Axis Event List */}
              <div className="space-y-1 max-h-[470px] overflow-y-auto pr-1">
                {!mounted || filteredAgendaEvents.length === 0 ? (
                  <div className="py-12 text-center text-xs opacity-50">
                    No events in this window.
                  </div>
                ) : (
                  filteredAgendaEvents.map((ev, idx) => {
                    const start = new Date(ev.startIso);
                    const end = new Date(ev.endIso);
                    const startMs = start.getTime();
                    const endMs = end.getTime();

                    const isPassed = nowMs > 0 && endMs < nowMs;
                    const isActiveNow =
                      nowMs > 0 && nowMs >= startMs && nowMs <= endMs;

                    // Determine if the live time tracker line should render right BEFORE this event
                    const prevEndMs =
                      idx > 0
                        ? new Date(
                            filteredAgendaEvents[idx - 1].endIso
                          ).getTime()
                        : 0;
                    const showLineBefore =
                      agendaTab === "today" &&
                      nowMs > 0 &&
                      nowMs < startMs &&
                      (idx === 0 || nowMs > prevEndMs);

                    // Determine if the live time tracker line should render right AFTER the last event
                    const showLineAfter =
                      agendaTab === "today" &&
                      nowMs > 0 &&
                      idx === filteredAgendaEvents.length - 1 &&
                      nowMs > endMs;

                    // Progress percentage inside an active event (0% to 100%)
                    const activeProgressPct = isActiveNow
                      ? Math.min(
                          100,
                          Math.max(
                            0,
                            Math.round(
                              ((nowMs - startMs) /
                                Math.max(1, endMs - startMs)) *
                                100
                            )
                          )
                        )
                      : 0;

                    const nowTimeLabel =
                      nowMs > 0
                        ? new Date(nowMs).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })
                        : "";

                    const typeAccent: Record<EventType, string> = {
                      class: "bg-blue-600",
                      study: "bg-violet-600",
                      founder: "bg-[#EA580C]",
                      exam: "bg-rose-600",
                    };

                    const typeTint: Record<EventType, string> = isPaper
                      ? {
                          class: "bg-blue-500/[0.06] hover:bg-blue-500/[0.1]",
                          study:
                            "bg-violet-500/[0.06] hover:bg-violet-500/[0.1]",
                          founder:
                            "bg-orange-500/[0.06] hover:bg-orange-500/[0.1]",
                          exam: "bg-rose-500/[0.08] hover:bg-rose-500/[0.12]",
                        }
                      : {
                          class: "bg-blue-500/[0.08] hover:bg-blue-500/[0.12]",
                          study:
                            "bg-violet-500/[0.08] hover:bg-violet-500/[0.12]",
                          founder:
                            "bg-orange-500/[0.08] hover:bg-orange-500/[0.12]",
                          exam: "bg-rose-500/[0.1] hover:bg-rose-500/[0.15]",
                        };

                    const passedTint = isPaper
                      ? "bg-[#EFECE4]/55 text-[#7A7872]"
                      : "bg-white/[0.02] text-zinc-500";

                    return (
                      <React.Fragment key={ev.id}>
                        {/* Live Time-Tracking Line when current time falls in a gap before this event */}
                        {showLineBefore && (
                          <div className="grid grid-cols-[62px_1fr] gap-2 items-center py-1.5">
                            <div className="text-right pr-2">
                              <span className="inline-block px-1.5 py-0.5 rounded bg-[#EA580C] text-white font-mono-code text-[10px] font-semibold leading-none shadow-xs">
                                {nowTimeLabel}
                              </span>
                            </div>
                            <div className="relative flex items-center">
                              <span className="h-2.5 w-2.5 rounded-full bg-[#EA580C] -ml-1 shrink-0 shadow-[0_0_8px_#EA580C]" />
                              <div className="h-[1.5px] w-full bg-[#EA580C]" />
                            </div>
                          </div>
                        )}

                        <div
                          className={`grid grid-cols-[62px_1fr] gap-2 items-stretch py-1 transition-opacity ${
                            isPassed ? "opacity-50" : ""
                          }`}
                        >
                          {/* Left Time Gutter */}
                          <div className="pt-2 text-right pr-2 font-mono-code text-[11px] leading-tight">
                            <div
                              className={
                                isActiveNow
                                  ? "text-[#EA580C] font-bold"
                                  : "opacity-50"
                              }
                            >
                              {start.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })}
                            </div>
                            {agendaTab === "week" && (
                              <div className="text-[10px] opacity-60">
                                {start.toLocaleDateString("en-US", {
                                  weekday: "short",
                                })}
                              </div>
                            )}
                          </div>

                          {/* Event Pill */}
                          <div
                            className={`relative rounded-xl px-3.5 py-2.5 transition flex items-start gap-3 overflow-hidden ${
                              isPassed
                                ? passedTint
                                : typeTint[ev.type] || typeTint.founder
                            } ${
                              isActiveNow
                                ? "ring-1 ring-[#EA580C]/60 shadow-xs"
                                : ""
                            }`}
                          >
                            {/* Live Time Line cutting across an active event */}
                            {isActiveNow && agendaTab === "today" && (
                              <div
                                className="pointer-events-none absolute left-0 right-0 flex items-center z-10"
                                style={{ top: `${activeProgressPct}%` }}
                              >
                                <span className="h-2 w-2 rounded-full bg-[#EA580C] shadow-[0_0_8px_#EA580C]" />
                                <div className="h-[1.5px] w-full bg-[#EA580C]/80" />
                              </div>
                            )}

                            <span
                              className={`w-1 self-stretch rounded-full shrink-0 ${
                                isPassed
                                  ? isPaper
                                    ? "bg-[#C8C4B8]"
                                    : "bg-zinc-700"
                                  : typeAccent[ev.type] || typeAccent.founder
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p
                                    className={`text-xs font-semibold truncate ${
                                      isPassed ? "line-through opacity-75" : ""
                                    }`}
                                  >
                                    {ev.title}
                                  </p>
                                  {isActiveNow && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EA580C] text-white font-mono-code text-[9px] font-semibold uppercase shrink-0">
                                      Now · {nowTimeLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {ev.courseCode && (
                                    <span className="font-mono-code text-[10px] px-1.5 py-0.5 rounded bg-current/10">
                                      {ev.courseCode}
                                    </span>
                                  )}
                                  {ev.type === "class" && (
                                    <>
                                      {ev.attendanceMarked === "present" ? (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                          ✓ In Class
                                        </span>
                                      ) : ev.attendanceMarked === "absent" ? (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400">
                                          ✕ Missed
                                        </span>
                                      ) : nowMs >=
                                        startMs + 30 * 60 * 1000 ? (
                                        <button
                                          onClick={() =>
                                            recordAttendance(
                                              ev.courseCode || ev.title,
                                              true,
                                              ev.id,
                                              ev.title
                                            )
                                          }
                                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition cursor-pointer"
                                          title="Confirm you are in class (30m+ in)"
                                        >
                                          Check-In ✓
                                        </button>
                                      ) : (
                                        <span className="font-mono-code text-[10px] opacity-45">
                                          Opens +30m
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[11px] opacity-65">
                                <span className="font-mono-code">
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
                                {ev.location && (
                                  <span className="inline-flex items-center gap-1 truncate">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    {ev.location}
                                  </span>
                                )}
                                {isPassed && (
                                  <span className="font-mono-code text-[10px] uppercase ml-auto">
                                    Passed
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Live Time-Tracking Line after the final event of the day */}
                        {showLineAfter && (
                          <div className="grid grid-cols-[62px_1fr] gap-2 items-center py-1.5">
                            <div className="text-right pr-2">
                              <span className="inline-block px-1.5 py-0.5 rounded bg-[#EA580C] text-white font-mono-code text-[10px] font-semibold leading-none shadow-xs">
                                {nowTimeLabel}
                              </span>
                            </div>
                            <div className="relative flex items-center">
                              <span className="h-2.5 w-2.5 rounded-full bg-[#EA580C] -ml-1 shrink-0 shadow-[0_0_8px_#EA580C]" />
                              <div className="h-[1.5px] w-full bg-[#EA580C]" />
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom Gap Nudge Strip */}
            <div
              className={`rounded-xl p-3.5 text-xs flex items-center justify-between gap-3 ${
                isPaper
                  ? "bg-[#F6F5F0] border border-[#E5E2D9]"
                  : "bg-white/[0.03] border border-white/[0.06]"
              }`}
            >
              <div className="space-y-0.5">
                <span className="font-mono-code text-[10px] uppercase tracking-wider text-[#EA580C] font-semibold">
                  Gemini Gap Nudge
                </span>
                <p className="opacity-80">
                  90m open window after <strong>Maths (A008)</strong> — execute
                  CSC 203 proof set.
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4 opacity-40 shrink-0" />
            </div>
          </div>

          {/* COLUMN 2 (5 cols): LINEAR-STYLE EXECUTION QUEUE & STUDY TRIAGE */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between space-y-6">
            {/* Tasks Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif-display text-2xl tracking-tight">
                    Execution Queue
                  </h2>
                  <p className="text-xs opacity-50">
                    Auto-decomposed into micro-subtasks
                  </p>
                </div>

                <div
                  className={`flex items-center rounded-lg p-0.5 text-xs ${
                    isPaper ? "bg-[#F2F0E8]" : "bg-white/[0.05]"
                  }`}
                >
                  {(["all", "school", "founder"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setDomainFilter(tab)}
                      className={`px-2.5 py-1 rounded-md font-medium capitalize transition cursor-pointer ${
                        domainFilter === tab
                          ? isPaper
                            ? "bg-white text-[#141413] shadow-2xs"
                            : "bg-white/15 text-white"
                          : "opacity-55 hover:opacity-100"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clean Divider List */}
              <div
                className={`divide-y border-y ${
                  isPaper
                    ? "divide-[#ECEAE2] border-[#ECEAE2]"
                    : "divide-white/[0.06] border-white/[0.06]"
                }`}
              >
                {filteredTasks.map((task) => {
                  const completedCount = task.subtasks.filter(
                    (s) => s.completed
                  ).length;
                  const isExpanded = expandedTaskId === task.id;

                  return (
                    <div key={task.id} className="py-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <button
                            onClick={() => toggleTask(task.id)}
                            className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center transition cursor-pointer shrink-0 ${
                              task.status === "done"
                                ? "bg-emerald-600 border-emerald-600 text-white"
                                : isPaper
                                  ? "border-[#B8B4A6] hover:border-[#141413]"
                                  : "border-zinc-600 hover:border-white"
                            }`}
                          >
                            {task.status === "done" && (
                              <Check className="w-2.5 h-2.5" />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              setExpandedTaskId(isExpanded ? null : task.id)
                            }
                            className="text-left min-w-0 cursor-pointer"
                          >
                            <p
                              className={`text-sm font-medium leading-snug ${
                                task.status === "done"
                                  ? "line-through opacity-45"
                                  : ""
                              }`}
                            >
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-[11px] opacity-55">
                              <span className="capitalize">{task.domain}</span>
                              {task.dueLabel && <span>· {task.dueLabel}</span>}
                              {task.subtasks.length > 0 && (
                                <span className="font-mono-code">
                                  · {completedCount}/{task.subtasks.length}{" "}
                                  steps
                                </span>
                              )}
                            </div>
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {task.courseCode && (
                            <span
                              className={`font-mono-code text-[10px] px-2 py-0.5 rounded-md ${
                                isPaper
                                  ? "bg-[#F2F0E8] text-[#141413]"
                                  : "bg-white/[0.07] text-zinc-200"
                              }`}
                            >
                              {task.courseCode}
                            </span>
                          )}
                          {task.priority === "high" && (
                            <span className="h-2 w-2 rounded-full bg-[#EA580C]" />
                          )}
                        </div>
                      </div>

                      {/* Expandable Subtasks */}
                      {isExpanded && task.subtasks.length > 0 && (
                        <div className="pl-7 space-y-1.5 pt-0.5">
                          {task.subtasks.map((st, idx) => (
                            <button
                              key={idx}
                              onClick={() => toggleSubtask(task.id, idx)}
                              className="flex items-center gap-2.5 text-xs opacity-75 hover:opacity-100 transition w-full text-left cursor-pointer"
                            >
                              <span
                                className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                                  st.completed
                                    ? "bg-emerald-600 border-emerald-600 text-white"
                                    : isPaper
                                      ? "border-[#C8C4B6]"
                                      : "border-zinc-700"
                                }`}
                              >
                                {st.completed && (
                                  <Check className="w-2.5 h-2.5" />
                                )}
                              </span>
                              <span
                                className={
                                  st.completed ? "line-through opacity-50" : ""
                                }
                              >
                                {st.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Study Triage Matrix */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-serif-display text-xl tracking-tight">
                    Syllabus Triage
                  </h3>
                  <span className="text-[11px] opacity-50">
                    Tap badge for mastery · Click Teach &amp; Quiz for AI Tutor
                  </span>
                </div>
                <button
                  onClick={() => setShowAddTopic(!showAddTopic)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                    isPaper
                      ? "border-[#DCD9CE] bg-[#FAF9F5] hover:bg-[#EFECE4]"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  Add Topic
                </button>
              </div>

              {showAddTopic && (
                <form
                  onSubmit={handleAddTopic}
                  className={`rounded-xl border p-3 flex flex-wrap items-center gap-2 text-xs ${
                    isPaper
                      ? "border-[#E2DFD5] bg-[#FAF9F5]"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <select
                    value={newTopicCourse}
                    onChange={(e) => setNewTopicCourse(e.target.value)}
                    className={`rounded-lg border px-2 py-1.5 text-xs focus:outline-none ${
                      isPaper
                        ? "border-[#DCD9CE] bg-white"
                        : "border-white/10 bg-[#121216]"
                    }`}
                  >
                    {courses.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newTopicTitle}
                    onChange={(e) => setNewTopicTitle(e.target.value)}
                    placeholder="Topic name (e.g. Karnaugh Maps)"
                    className={`flex-1 min-w-[150px] rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none ${
                      isPaper
                        ? "border-[#DCD9CE] bg-white"
                        : "border-white/10 bg-[#121216]"
                    }`}
                  />
                  <select
                    value={newTopicConfidence}
                    onChange={(e) =>
                      setNewTopicConfidence(e.target.value as Confidence)
                    }
                    className={`rounded-lg border px-2 py-1.5 text-xs focus:outline-none ${
                      isPaper
                        ? "border-[#DCD9CE] bg-white"
                        : "border-white/10 bg-[#121216]"
                    }`}
                  >
                    <option value="weak">Weak</option>
                    <option value="review">Review</option>
                    <option value="solid">Solid</option>
                  </select>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-[#EA580C] text-white font-medium cursor-pointer"
                  >
                    Save
                  </button>
                </form>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {studyTopics.map((topic) => {
                  const statusDot: Record<Confidence, string> = {
                    weak: "bg-rose-500 text-rose-600 dark:text-rose-400",
                    review: "bg-amber-500 text-amber-600 dark:text-amber-400",
                    solid:
                      "bg-emerald-500 text-emerald-600 dark:text-emerald-400",
                  };

                  return (
                    <div
                      key={topic.id}
                      className={`rounded-xl p-3 border transition flex flex-col justify-between gap-2.5 ${
                        isPaper
                          ? "border-[#E6E3D8] bg-[#FAF9F5]"
                          : "border-white/[0.07] bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono-code text-[10px] opacity-60">
                          {topic.courseCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => cycleConfidence(topic.id)}
                          title="Click to cycle mastery level"
                          className={`inline-flex items-center gap-1.5 text-[11px] font-medium capitalize px-2 py-0.5 rounded-full border cursor-pointer transition ${
                            isPaper
                              ? "border-[#E2DFD5] bg-white hover:bg-[#EFECE4]"
                              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              statusDot[topic.confidence].split(" ")[0]
                            }`}
                          />
                          {topic.confidence}
                        </button>
                      </div>
                      <p className="text-xs font-medium line-clamp-2 leading-snug">
                        {topic.topic}
                      </p>
                      <button
                        type="button"
                        onClick={() => openTopicTutor(topic)}
                        className={`w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                          isPaper
                            ? "bg-[#141413] text-white hover:bg-[#2a2a28]"
                            : "bg-white/10 text-white hover:bg-white/20"
                        }`}
                      >
                        <GraduationCap className="w-3.5 h-3.5 text-[#EA580C]" />
                        Teach &amp; Quiz Me
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* COLUMN 3 (3 cols): COMPACT 75% ATTENDANCE GUARD & DUMP AUDIT */}
          <div className="lg:col-span-3 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-serif-display text-2xl tracking-tight">
                    Attendance &amp; Courses
                  </h2>
                  <p className="text-xs opacity-50">
                    Babcock 75% rule · Lecturers &amp; Books
                  </p>
                </div>
                <button
                  onClick={openNewCourseModal}
                  className="inline-flex items-center gap-1 font-mono-code text-[11px] px-2.5 py-1 rounded-full bg-[#EA580C]/10 hover:bg-[#EA580C]/20 text-[#EA580C] font-medium transition cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  Course
                </button>
              </div>

              {/* Clean Compact Course Rows */}
              <div
                className={`divide-y border-y ${
                  isPaper
                    ? "divide-[#ECEAE2] border-[#ECEAE2]"
                    : "divide-white/[0.06] border-white/[0.06]"
                }`}
              >
                {courses.map((course) => {
                  const {
                    percentage: pct,
                    isAtRisk,
                    classesNeededToRecover: classesNeeded,
                    safeSkipsAvailable: safeSkips,
                  } = computeAttendanceStatus(course);

                  return (
                    <div key={course.code} className="py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono-code text-xs font-semibold">
                              {course.code}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                isAtRisk
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              }`}
                            >
                              {isAtRisk
                                ? `Need +${classesNeeded}`
                                : `${safeSkips} skip buffer`}
                            </span>
                          </div>
                          <p className="text-[11px] opacity-60 truncate">
                            {course.title}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right font-mono-code">
                            <div
                              className={`text-sm font-bold ${
                                isAtRisk
                                  ? "text-rose-600 dark:text-rose-400"
                                  : ""
                              }`}
                            >
                              {pct}%
                            </div>
                            <div className="text-[10px] opacity-45">
                              {course.attendedClasses}/{course.totalClassesHeld}
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() =>
                                recordAttendance(course.code, true)
                              }
                              title="Log Present"
                              className={`p-1 rounded border text-[10px] transition cursor-pointer ${
                                isPaper
                                  ? "border-[#DCD9CE] hover:bg-emerald-500/15"
                                  : "border-white/10 hover:bg-emerald-500/20"
                              }`}
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                            <button
                              onClick={() =>
                                recordAttendance(course.code, false)
                              }
                              title="Log Missed"
                              className={`p-1 rounded border text-[10px] transition cursor-pointer ${
                                isPaper
                                  ? "border-[#DCD9CE] hover:bg-rose-500/15"
                                  : "border-white/10 hover:bg-rose-500/20"
                              }`}
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Hairline Progress Bar */}
                      <div
                        className={`h-1 w-full rounded-full overflow-hidden ${
                          isPaper ? "bg-[#ECEAE2]" : "bg-white/[0.07]"
                        }`}
                      >
                        <div
                          className={`h-full transition-all duration-300 ${
                            isAtRisk ? "bg-rose-500" : "bg-emerald-600"
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>

                      {/* Lecturer & Textbook Intelligence Preview */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="min-w-0 text-[10px] opacity-65 space-y-0.5">
                          <p className="truncate">
                            <span className="font-semibold">Lecturer:</span>{" "}
                            {course.lecturerName || "Tap edit to add"}
                          </p>
                          {course.recommendedTextbooks && (
                            <p className="truncate">
                              <span className="font-semibold">Book:</span>{" "}
                              {course.recommendedTextbooks}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => openEditCourseModal(course)}
                          title="Edit Lecturer, Test Pattern & Textbooks"
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium shrink-0 transition cursor-pointer ${
                            isPaper
                              ? "border-[#DCD9CE] bg-[#FAF9F5] hover:bg-[#EFECE4]"
                              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"
                          }`}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Brain Dump History Footer */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider opacity-50">
                  Brain Dump Log ({dumps.length})
                </h3>
              </div>
              {dumps.length === 0 ? (
                <p className="text-xs opacity-45 leading-relaxed">
                  Type in the command bar above to log events, tasks, and topics
                  with 1-click Undo.
                </p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {dumps.map((d) => (
                    <div
                      key={d.id}
                      className={`rounded-xl p-2.5 text-xs flex items-center justify-between gap-2 ${
                        isPaper ? "bg-[#F6F5F0]" : "bg-white/[0.03]"
                      } ${d.undone ? "opacity-40 line-through" : ""}`}
                    >
                      <span className="truncate">{d.rawText}</span>
                      {!d.undone && (
                        <button
                          onClick={() => handleUndoDump(d.id)}
                          className="text-rose-500 font-medium shrink-0 hover:underline cursor-pointer"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 1. AI TEACHER & EXAM PREP STUDIO MODAL */}
      {activeTutorTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isPaper
                ? "border-[#DCD9CE] bg-white text-[#141413]"
                : "border-white/10 bg-[#121216] text-white"
            }`}
          >
            {/* Modal Header */}
            <div
              className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${
                isPaper ? "border-[#E8E6DF]" : "border-white/10"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono-code text-[11px] px-2 py-0.5 rounded bg-[#EA580C]/10 text-[#EA580C] font-semibold">
                    {activeTutorTopic.courseCode}
                  </span>
                  <span className="text-[11px] capitalize opacity-60">
                    Mastery: {activeTutorTopic.confidence}
                  </span>
                </div>
                <h3 className="font-serif-display text-xl tracking-tight truncate mt-0.5">
                  {activeTutorTopic.topic}
                </h3>
              </div>

              <button
                onClick={() => setActiveTutorTopic(null)}
                className="p-1.5 rounded-lg opacity-60 hover:opacity-100 cursor-pointer"
                aria-label="Close Tutor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {tutorLoading && (
                <div className="py-12 text-center space-y-2">
                  <Sparkles className="w-5 h-5 text-[#EA580C] mx-auto animate-pulse" />
                  <p className="font-medium">
                    Preparing your Babcock lecture breakdown, textbook chapter &amp;
                    practice quiz...
                  </p>
                </div>
              )}

              {tutorError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500">
                  {tutorError}
                </div>
              )}

              {tutorLesson && (
                <>
                  {/* Concept Explanation */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-sm">
                      <GraduationCap className="w-4 h-4 text-[#EA580C]" />
                      Concept Breakdown
                    </div>
                    <p className="leading-relaxed whitespace-pre-line opacity-90">
                      {tutorLesson.explanation}
                    </p>
                    {tutorLesson.keyTakeaways?.length > 0 && (
                      <ul
                        className={`rounded-xl p-3 space-y-1.5 border ${
                          isPaper
                            ? "border-[#E6E3D8] bg-[#FAF9F5]"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        {tutorLesson.keyTakeaways.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-[#EA580C] font-bold">•</span>
                            <span className="opacity-85 leading-relaxed">
                              {point}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Lecturer Tip & Textbook Finder */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      className={`rounded-xl border p-3.5 space-y-1 ${
                        isPaper
                          ? "border-amber-500/30 bg-amber-500/[0.06]"
                          : "border-amber-500/25 bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Lecturer Exam &amp; Quiz Style
                      </div>
                      <p className="opacity-85 leading-relaxed">
                        {tutorLesson.lecturerExamTip}
                      </p>
                    </div>

                    <div
                      className={`rounded-xl border p-3.5 space-y-1 ${
                        isPaper
                          ? "border-blue-500/30 bg-blue-500/[0.05]"
                          : "border-blue-500/25 bg-blue-500/10"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <BookMarked className="w-3.5 h-3.5 text-blue-500" />
                        Textbook &amp; Chapter to Read
                      </div>
                      <p className="opacity-85 leading-relaxed">
                        {tutorLesson.textbookGuide}
                      </p>
                    </div>
                  </div>

                  {/* Interactive Practice Quiz */}
                  {tutorLesson.quiz && (
                    <div
                      className={`rounded-xl border p-4 space-y-3 ${
                        isPaper
                          ? "border-[#E2DFD5] bg-[#FAF9F5]"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-[#EA580C]" />
                          Quick Lecturer-Style Practice Check
                        </span>
                        {selectedQuizOption !== null &&
                          selectedQuizOption ===
                            tutorLesson.quiz.correctIndex &&
                          activeTutorTopic.confidence !== "solid" && (
                            <button
                              type="button"
                              onClick={() =>
                                updateTopicConfidence(
                                  activeTutorTopic.id,
                                  activeTutorTopic.confidence === "weak"
                                    ? "review"
                                    : "solid"
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Upgrade Mastery →{" "}
                              {activeTutorTopic.confidence === "weak"
                                ? "Review"
                                : "Solid"}
                            </button>
                          )}
                      </div>

                      <p className="font-medium leading-relaxed">
                        {tutorLesson.quiz.question}
                      </p>

                      <div className="space-y-1.5">
                        {tutorLesson.quiz.options.map((opt, idx) => {
                          const isSelected = selectedQuizOption === idx;
                          const isCorrect =
                            idx === tutorLesson.quiz.correctIndex;
                          const answered = selectedQuizOption !== null;

                          let btnStyle = isPaper
                            ? "border-[#DCD9CE] bg-white hover:bg-[#EFECE4]"
                            : "border-white/10 bg-black/30 hover:bg-white/[0.06]";
                          if (answered && isCorrect) {
                            btnStyle =
                              "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-semibold";
                          } else if (answered && isSelected && !isCorrect) {
                            btnStyle =
                              "border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300";
                          }

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedQuizOption(idx)}
                              className={`w-full text-left rounded-lg border px-3 py-2 transition cursor-pointer ${btnStyle}`}
                            >
                              <span className="font-mono-code mr-2 opacity-60">
                                {String.fromCharCode(65 + idx)}.
                              </span>
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      {selectedQuizOption !== null && (
                        <div
                          className={`rounded-lg p-3 border text-[11px] leading-relaxed ${
                            selectedQuizOption === tutorLesson.quiz.correctIndex
                              ? "border-emerald-500/30 bg-emerald-500/10"
                              : "border-amber-500/30 bg-amber-500/10"
                          }`}
                        >
                          <p className="font-semibold mb-1">
                            {selectedQuizOption ===
                            tutorLesson.quiz.correctIndex
                              ? "✓ Spot on!"
                              : `Not quite — Option ${String.fromCharCode(
                                  65 + tutorLesson.quiz.correctIndex
                                )} is correct.`}
                          </p>
                          <p className="opacity-90">
                            {tutorLesson.quiz.workedSolution}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Follow-up Chat Thread */}
                  {tutorChat.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-current/10">
                      <p className="font-semibold opacity-70">
                        Follow-up Q&amp;A
                      </p>
                      {tutorChat.map((turn, idx) => (
                        <div
                          key={idx}
                          className={`rounded-xl p-3 leading-relaxed whitespace-pre-line ${
                            turn.role === "user"
                              ? isPaper
                                ? "bg-[#141413] text-white ml-8"
                                : "bg-white/15 ml-8"
                              : isPaper
                                ? "bg-[#F6F5F0] mr-8"
                                : "bg-white/[0.04] mr-8"
                          }`}
                        >
                          {turn.text}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Follow-up Question Input */}
            <form
              onSubmit={sendTutorFollowUp}
              className={`px-6 py-3.5 border-t flex items-center gap-2 ${
                isPaper ? "border-[#E8E6DF]" : "border-white/10"
              }`}
            >
              <input
                type="text"
                value={tutorFollowUpInput}
                onChange={(e) => setTutorFollowUpInput(e.target.value)}
                placeholder="Ask a follow-up (e.g. 'Give me an easier analogy' or 'Show another example')..."
                className={`flex-1 rounded-xl border px-3.5 py-2 text-xs focus:outline-none ${
                  isPaper
                    ? "border-[#DCD9CE] bg-[#FAF9F5]"
                    : "border-white/10 bg-black/40"
                }`}
              />
              <button
                type="submit"
                disabled={
                  tutorLoading ||
                  tutorFollowUpLoading ||
                  !tutorFollowUpInput.trim()
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EA580C] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {tutorFollowUpLoading ? "..." : "Ask"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. COURSE, LECTURER & TEXTBOOK EDITOR MODAL */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <form
            onSubmit={saveCourseProfile}
            className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-4 text-xs ${
              isPaper
                ? "border-[#DCD9CE] bg-white text-[#141413]"
                : "border-white/10 bg-[#121216] text-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif-display text-xl tracking-tight">
                {isNewCourse
                  ? "Add Babcock Course & Lecturer"
                  : `Teach DysAI About ${editingCourse.code}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-semibold opacity-75">Course Code</span>
                <input
                  required
                  type="text"
                  value={courseForm.code}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, code: e.target.value })
                  }
                  placeholder="e.g. COSC 205"
                  className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                    isPaper
                      ? "border-[#DCD9CE] bg-[#FAF9F5]"
                      : "border-white/10 bg-black/40"
                  }`}
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold opacity-75">Course Title</span>
                <input
                  required
                  type="text"
                  value={courseForm.title}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, title: e.target.value })
                  }
                  placeholder="e.g. Operating Systems"
                  className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                    isPaper
                      ? "border-[#DCD9CE] bg-[#FAF9F5]"
                      : "border-white/10 bg-black/40"
                  }`}
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold opacity-75">
                  Classes Attended
                </span>
                <input
                  type="number"
                  min={0}
                  value={courseForm.attendedClasses}
                  onChange={(e) =>
                    setCourseForm({
                      ...courseForm,
                      attendedClasses: Number(e.target.value),
                    })
                  }
                  className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                    isPaper
                      ? "border-[#DCD9CE] bg-[#FAF9F5]"
                      : "border-white/10 bg-black/40"
                  }`}
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold opacity-75">
                  Total Classes Held
                </span>
                <input
                  type="number"
                  min={0}
                  value={courseForm.totalClassesHeld}
                  onChange={(e) =>
                    setCourseForm({
                      ...courseForm,
                      totalClassesHeld: Number(e.target.value),
                    })
                  }
                  className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                    isPaper
                      ? "border-[#DCD9CE] bg-[#FAF9F5]"
                      : "border-white/10 bg-black/40"
                  }`}
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="font-semibold opacity-75">
                Who is teaching you? (Lecturer Name)
              </span>
              <input
                type="text"
                value={courseForm.lecturerName || ""}
                onChange={(e) =>
                  setCourseForm({
                    ...courseForm,
                    lecturerName: e.target.value,
                  })
                }
                placeholder="e.g. Dr. Adeyemi"
                className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                  isPaper
                    ? "border-[#DCD9CE] bg-[#FAF9F5]"
                    : "border-white/10 bg-black/40"
                }`}
              />
            </label>

            <label className="block space-y-1">
              <span className="font-semibold opacity-75">
                How are they? (Teaching Style &amp; Strictness)
              </span>
              <textarea
                rows={2}
                value={courseForm.teachingStyle || ""}
                onChange={(e) =>
                  setCourseForm({
                    ...courseForm,
                    teachingStyle: e.target.value,
                  })
                }
                placeholder="e.g. Strict on attendance, asks practical tracing & diagram questions rather than MCQs"
                className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                  isPaper
                    ? "border-[#DCD9CE] bg-[#FAF9F5]"
                    : "border-white/10 bg-black/40"
                }`}
              />
            </label>

            <label className="block space-y-1">
              <span className="font-semibold opacity-75">
                When could they add a test? (Quiz &amp; Test Pattern)
              </span>
              <textarea
                rows={2}
                value={courseForm.testPattern || ""}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, testPattern: e.target.value })
                }
                placeholder="e.g. Loves surprise 10-min quizzes right after finishing a topic or at the start of Thursday classes"
                className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                  isPaper
                    ? "border-[#DCD9CE] bg-[#FAF9F5]"
                    : "border-white/10 bg-black/40"
                }`}
              />
            </label>

            <label className="block space-y-1">
              <span className="font-semibold opacity-75">
                Recommended Textbooks &amp; Manuals
              </span>
              <input
                type="text"
                value={courseForm.recommendedTextbooks || ""}
                onChange={(e) =>
                  setCourseForm({
                    ...courseForm,
                    recommendedTextbooks: e.target.value,
                  })
                }
                placeholder="e.g. M. Morris Mano — Digital Design, Babcock Lab Manual"
                className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                  isPaper
                    ? "border-[#DCD9CE] bg-[#FAF9F5]"
                    : "border-white/10 bg-black/40"
                }`}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className={`px-4 py-2 rounded-xl border font-medium cursor-pointer ${
                  isPaper ? "border-[#DCD9CE]" : "border-white/10"
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#EA580C] text-white font-semibold cursor-pointer"
              >
                Save Course Intelligence
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. BABCOCK HANDBOOK & ACADEMIC AGENT HUB MODAL */}
      {showHandbookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isPaper
                ? "border-[#DCD9CE] bg-white text-[#141413]"
                : "border-white/10 bg-[#121216] text-white"
            }`}
          >
            {/* Header */}
            <div
              className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${
                isPaper ? "border-[#E8E6DF]" : "border-white/10"
              }`}
            >
              <div>
                <h3 className="font-serif-display text-xl tracking-tight">
                  Babcock University Handbook &amp; Academic Agent
                </h3>
                <p className="text-[11px] opacity-60">
                  Upload your Student Handbook / Syllabus PDF, customize rules,
                  or ask anything
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center rounded-lg p-0.5 text-xs ${
                    isPaper ? "bg-[#F2F0E8]" : "bg-white/[0.06]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setHandbookTab("agent")}
                    className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                      handbookTab === "agent"
                        ? isPaper
                          ? "bg-white shadow-2xs"
                          : "bg-white/15"
                        : "opacity-60"
                    }`}
                  >
                    Ask &amp; Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setHandbookTab("rules")}
                    className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                      handbookTab === "rules"
                        ? isPaper
                          ? "bg-white shadow-2xs"
                          : "bg-white/15"
                        : "opacity-60"
                    }`}
                  >
                    Built-in Rules
                  </button>
                </div>
                <button
                  onClick={() => setShowHandbookModal(false)}
                  className="p-1.5 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {handbookTab === "rules" ? (
                <div className="space-y-3">
                  <p className="opacity-75 leading-relaxed">
                    These Babcock University rules are automatically injected
                    into Gemini on every Brain Dump, Tutor lesson, and Agent
                    check:
                  </p>
                  <pre
                    className={`whitespace-pre-wrap font-sans text-xs leading-relaxed rounded-xl border p-4 ${
                      isPaper
                        ? "border-[#E2DFD5] bg-[#FAF9F5]"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    {BABCOCK_UNIVERSITY_HANDBOOK_RULES}
                  </pre>
                </div>
              ) : (
                <>
                  {/* Upload PDF/TXT + Custom Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      className={`rounded-xl border p-4 space-y-2.5 ${
                        isPaper
                          ? "border-[#E2DFD5] bg-[#FAF9F5]"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-[#EA580C]" />
                          Upload Handbook or Syllabus
                        </span>
                        {handbookFile && (
                          <button
                            type="button"
                            onClick={() => setHandbookFile(null)}
                            className="text-[11px] text-rose-500 hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] opacity-65 leading-relaxed">
                        Upload a <code>.pdf</code>, <code>.txt</code>, or{" "}
                        <code>.md</code> handbook/course outline so the AI can
                        read and cite it directly.
                      </p>
                      <label
                        className={`flex items-center justify-center gap-2 rounded-xl border border-dashed py-3 px-4 cursor-pointer transition ${
                          isPaper
                            ? "border-[#C8C4B6] hover:bg-white"
                            : "border-white/20 hover:bg-white/[0.04]"
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5 text-[#EA580C]" />
                        <span className="font-medium">
                          {handbookFile
                            ? `Loaded: ${handbookFile.name}`
                            : "Choose PDF or Text File"}
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                          onChange={handleHandbookFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div
                      className={`rounded-xl border p-4 space-y-2 ${
                        isPaper
                          ? "border-[#E2DFD5] bg-[#FAF9F5]"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <span className="font-semibold block">
                        Saved Handbook / Department Notes
                      </span>
                      <textarea
                        rows={4}
                        value={customHandbookText}
                        onChange={(e) => setCustomHandbookText(e.target.value)}
                        placeholder="Paste extra Babcock department rules, hall curfew times, chapel days, or course outlines here (auto-saved)..."
                        className={`w-full rounded-lg border p-2.5 text-[11px] focus:outline-none ${
                          isPaper
                            ? "border-[#DCD9CE] bg-white"
                            : "border-white/10 bg-black/40"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Quick Agent Prompts */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Which courses am I at risk of failing the 75% attendance rule?",
                      "Who is likely to drop a surprise quiz or test soon?",
                      "What textbooks should I read for my weak topics?",
                      "Explain Babcock's 40/60 CA and 5.0 GPA scale",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => askHandbookAgent(undefined, preset)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                          isPaper
                            ? "border-[#E2DFD5] bg-[#FAF9F5] hover:bg-[#EFECE4]"
                            : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  {handbookError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500">
                      {handbookError}
                    </div>
                  )}

                  {/* Agent Q&A History */}
                  <div className="space-y-3">
                    {handbookChat.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl border p-4 space-y-2.5 ${
                          isPaper
                            ? "border-[#E2DFD5] bg-[#FAF9F5]"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <p className="font-semibold text-[#EA580C]">
                          Q: {item.question}
                        </p>
                        <p className="leading-relaxed whitespace-pre-line opacity-90">
                          {item.reply.answer}
                        </p>
                        {item.reply.citationsOrRules?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.reply.citationsOrRules.map((rule, rIdx) => (
                              <span
                                key={rIdx}
                                className={`text-[10px] px-2 py-0.5 rounded-md border ${
                                  isPaper
                                    ? "border-[#DCD9CE] bg-white"
                                    : "border-white/10 bg-black/30"
                                }`}
                              >
                                {rule}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.reply.suggestedAction && (
                          <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            Next step: {item.reply.suggestedAction}
                          </p>
                        )}
                      </div>
                    ))}

                    {handbookLoading && (
                      <div className="py-4 text-center opacity-70">
                        Reading Babcock rules, lecturer profiles &amp; uploaded
                        docs...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer Question Form */}
            {handbookTab === "agent" && (
              <form
                onSubmit={(e) => askHandbookAgent(e)}
                className={`px-6 py-3.5 border-t flex items-center gap-2 ${
                  isPaper ? "border-[#E8E6DF]" : "border-white/10"
                }`}
              >
                <input
                  type="text"
                  value={handbookQuestion}
                  onChange={(e) => setHandbookQuestion(e.target.value)}
                  placeholder="Ask about Babcock rules, your uploaded handbook PDF, lecturers, or textbooks..."
                  className={`flex-1 rounded-xl border px-3.5 py-2 text-xs focus:outline-none ${
                    isPaper
                      ? "border-[#DCD9CE] bg-[#FAF9F5]"
                      : "border-white/10 bg-black/40"
                  }`}
                />
                <button
                  type="submit"
                  disabled={handbookLoading || !handbookQuestion.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EA580C] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Ask Agent
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
