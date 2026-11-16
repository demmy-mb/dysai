import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const parsedDumpValidator = v.object({
  summary: v.string(),
  tasks: v.array(
    v.object({
      title: v.string(),
      domain: v.union(
        v.literal("school"),
        v.literal("founder"),
        v.literal("personal")
      ),
      courseCode: v.optional(v.nullable(v.string())),
      priority: v.union(
        v.literal("high"),
        v.literal("medium"),
        v.literal("low")
      ),
      dueIso: v.optional(v.nullable(v.string())),
      subtasks: v.array(v.string()),
    })
  ),
  events: v.array(
    v.object({
      title: v.string(),
      type: v.union(
        v.literal("class"),
        v.literal("study"),
        v.literal("founder"),
        v.literal("exam")
      ),
      courseCode: v.optional(v.nullable(v.string())),
      location: v.optional(v.nullable(v.string())),
      startIso: v.string(),
      endIso: v.string(),
    })
  ),
  studyTopics: v.array(
    v.object({
      courseCode: v.string(),
      topic: v.string(),
      confidence: v.union(
        v.literal("weak"),
        v.literal("review"),
        v.literal("solid")
      ),
    })
  ),
  coaching: v.optional(
    v.object({
      teacherNote: v.string(),
      attendanceWarning: v.optional(v.nullable(v.string())),
      testPrediction: v.optional(v.nullable(v.string())),
      textbookRecommendation: v.optional(v.nullable(v.string())),
    })
  ),
});

/**
 * Atomic Convex mutation that saves Gemini's parsed output into:
 * - `brainDumps` (Action Receipt log)
 * - `tasks`
 * - `events` (and schedules immediate Google Calendar push)
 * - `studyTopics`
 * - `courses` (auto-creates unknown course codes if Gemini spotted a new course)
 */
export const commitParsedDump = internalMutation({
  args: {
    rawText: v.string(),
    parsed: parsedDumpValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Create the Brain Dump receipt record first
    const brainDumpId = await ctx.db.insert("brainDumps", {
      rawText: args.rawText,
      summary: args.parsed.summary,
      counts: {
        tasks: args.parsed.tasks.length,
        events: args.parsed.events.length,
        studyTopics: args.parsed.studyTopics.length,
      },
      coaching: args.parsed.coaching,
      undone: false,
      createdAt: now,
    });

    // Helper to ensure referenced course codes exist in `courses`
    const ensureCourseExists = async (code?: string | null) => {
      if (!code) return undefined;
      const normalized = code.trim().toUpperCase();
      const existing = await ctx.db
        .query("courses")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .unique();
      if (!existing) {
        await ctx.db.insert("courses", {
          code: normalized,
          title: normalized,
          attendedClasses: 0,
          totalClassesHeld: 0,
          targetAttendanceRatio: 0.75,
        });
      }
      return normalized;
    };

    // 2. Insert Tasks
    for (const task of args.parsed.tasks) {
      const courseCode = await ensureCourseExists(task.courseCode);
      await ctx.db.insert("tasks", {
        title: task.title,
        domain: task.domain,
        courseCode,
        priority: task.priority,
        dueIso: task.dueIso ?? undefined,
        subtasks: task.subtasks.map((st) => ({ title: st, completed: false })),
        status: "todo",
        brainDumpId,
        createdAt: now,
      });
    }

    // 3. Insert Events & schedule immediate Google Calendar push
    for (const ev of args.parsed.events) {
      const courseCode = await ensureCourseExists(ev.courseCode);
      const eventId = await ctx.db.insert("events", {
        title: ev.title,
        type: ev.type,
        courseCode,
        location: ev.location ?? undefined,
        startIso: ev.startIso,
        endIso: ev.endIso,
        syncStatus: "pending_push",
        brainDumpId,
        updatedAt: now,
      });

      // Schedule background push to Google Calendar via Service Account
      await ctx.scheduler.runAfter(0, internal.gcal.pushEventToGCal, {
        eventId,
      });
    }

    // 4. Insert Study Topics
    for (const topic of args.parsed.studyTopics) {
      const courseCode =
        (await ensureCourseExists(topic.courseCode)) ?? topic.courseCode;
      await ctx.db.insert("studyTopics", {
        courseCode,
        topic: topic.topic,
        confidence: topic.confidence,
        brainDumpId,
      });
    }

    return {
      brainDumpId,
      summary: args.parsed.summary,
      counts: {
        tasks: args.parsed.tasks.length,
        events: args.parsed.events.length,
        studyTopics: args.parsed.studyTopics.length,
      },
      coaching: args.parsed.coaching,
    };
  },
});

/**
 * 1-Click Undo button handler on the Action Receipt.
 * Removes all tasks, events (including from Google Calendar), and study topics
 * created by a specific Brain Dump.
 */
export const undoBrainDump = mutation({
  args: {
    brainDumpId: v.id("brainDumps"),
  },
  handler: async (ctx, args) => {
    const dump = await ctx.db.get(args.brainDumpId);
    if (!dump || dump.undone) {
      return { status: "already_undone" };
    }

    // Delete linked tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brain_dump", (q) => q.eq("brainDumpId", args.brainDumpId))
      .collect();
    for (const t of tasks) {
      await ctx.db.delete(t._id);
    }

    // Delete linked events & schedule GCal removal if already synced
    const events = await ctx.db
      .query("events")
      .withIndex("by_brain_dump", (q) => q.eq("brainDumpId", args.brainDumpId))
      .collect();
    for (const ev of events) {
      if (ev.gcalEventId) {
        await ctx.scheduler.runAfter(0, internal.gcal.deleteEventFromGCal, {
          gcalEventId: ev.gcalEventId,
        });
      }
      await ctx.db.delete(ev._id);
    }

    // Delete linked study topics
    const topics = await ctx.db
      .query("studyTopics")
      .withIndex("by_brain_dump", (q) => q.eq("brainDumpId", args.brainDumpId))
      .collect();
    for (const topic of topics) {
      await ctx.db.delete(topic._id);
    }

    await ctx.db.patch(args.brainDumpId, { undone: true });
    return { status: "undone" };
  },
});

/**
 * Queries for Dashboard Columns (Agenda, Tasks, Study Triage, Brain Dump History)
 */
export const listRecentDumps = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("brainDumps")
      .withIndex("by_created_at")
      .order("desc")
      .take(15);
  },
});

export const listDashboardData = query({
  args: {},
  handler: async (ctx) => {
    const [events, tasks, studyTopics] = await Promise.all([
      ctx.db.query("events").withIndex("by_start").order("asc").collect(),
      ctx.db.query("tasks").order("desc").collect(),
      ctx.db.query("studyTopics").collect(),
    ]);

    return {
      events,
      tasks,
      studyTopics,
    };
  },
});

export const toggleTaskStatus = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return;
    await ctx.db.patch(args.taskId, {
      status: task.status === "done" ? "todo" : "done",
    });
  },
});

export const toggleSubtask = mutation({
  args: {
    taskId: v.id("tasks"),
    subtaskIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return;
    const updated = task.subtasks.map((st, idx) =>
      idx === args.subtaskIndex ? { ...st, completed: !st.completed } : st
    );
    await ctx.db.patch(args.taskId, { subtasks: updated });
  },
});

export const cycleTopicConfidence = mutation({
  args: {
    topicId: v.id("studyTopics"),
  },
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) return;
    const order: Array<"weak" | "review" | "solid"> = [
      "weak",
      "review",
      "solid",
    ];
    const next = order[(order.indexOf(topic.confidence) + 1) % order.length];
    await ctx.db.patch(args.topicId, {
      confidence: next,
      lastStudiedIso: new Date().toISOString(),
    });
  },
});

/**
 * Public mutation wrapper so the Next.js API route or client can also commit
 * a parsed Brain Dump directly to Convex DB (`compassionate-warbler-659`).
 */
export const saveParsedDumpPublic = mutation({
  args: {
    rawText: v.string(),
    parsed: parsedDumpValidator,
  },
  handler: async (ctx, args): Promise<{
    brainDumpId: string;
    summary: string;
    counts: { tasks: number; events: number; studyTopics: number };
    coaching?: {
      teacherNote: string;
      attendanceWarning?: string | null;
      testPrediction?: string | null;
      textbookRecommendation?: string | null;
    };
  }> => {
    return await ctx.runMutation(internal.brainDump.commitParsedDump, args);
  },
});


