import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";

/**
 * Deterministic Cron 1: T-15m Class & Exam Alerts
 * Runs every 5 minutes and checks if any class/exam starts within the next 20 minutes.
 */
export const checkUpcomingClassAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const in20Min = now + 20 * 60 * 1000;

    const events = await ctx.db.query("events").collect();
    for (const ev of events) {
      if (ev.notified15m) continue;
      const startMs = Date.parse(ev.startIso);
      if (isNaN(startMs)) continue;

      if (startMs >= now && startMs <= in20Min) {
        const minsLeft = Math.max(1, Math.round((startMs - now) / 60000));
        await ctx.db.insert("notifications", {
          title: `Upcoming ${ev.type.toUpperCase()} in ${minsLeft}m: ${ev.title}`,
          body: ev.location
            ? `Location: ${ev.location}. Head out now to keep your attendance above 75%.`
            : `Starting at ${new Date(ev.startIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
          category: "class_t15m",
          read: false,
          createdAt: now,
        });

        await ctx.db.patch(ev._id, { notified15m: true });
      }
    }
  },
});

/**
 * Deterministic Cron 1B: Live During/Post-Class Attendance Check-In Prompt
 * Fires when a class is 30+ minutes into the session (or just ended),
 * prompting the user on mobile/web: "Are you in [Course] right now?" with 1-tap Yes/No.
 */
export const checkLiveClassAttendancePrompts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const thirtyMinsInMs = 30 * 60 * 1000;
    const thirtyMinsAgo = now - thirtyMinsInMs;

    const events = await ctx.db.query("events").collect();
    for (const ev of events) {
      if (ev.type !== "class") continue;
      if (ev.attendancePromptSent || ev.attendanceMarked) continue;

      const startMs = Date.parse(ev.startIso);
      const endMs = Date.parse(ev.endIso);
      if (isNaN(startMs) || isNaN(endMs)) continue;

      // Trigger once we are at least 30 minutes into the class, up until 30 minutes after class ends
      const isThirtyMinsIntoClass =
        now >= startMs + thirtyMinsInMs && now <= endMs;
      const isJustAfterClass = now > endMs && endMs >= thirtyMinsAgo;

      if (isThirtyMinsIntoClass || isJustAfterClass) {
        const courseLabel = ev.courseCode || ev.title;
        await ctx.db.insert("notifications", {
          title: isThirtyMinsIntoClass
            ? `Live Check-In (30m): Are you in ${courseLabel}?`
            : `Class Ended: Did you attend ${courseLabel}?`,
          body: ev.location
            ? `Tap "Yes, in class" at ${ev.location} to auto-sync your 75% Attendance Guard.`
            : `Tap to confirm your attendance and update your 75% threshold tracker.`,
          category: "attendance_check",
          eventId: ev._id,
          courseCode: ev.courseCode ?? courseLabel,
          read: false,
          createdAt: now,
        });

        await ctx.db.patch(ev._id, { attendancePromptSent: true });
      }
    }
  },
});

/**
 * Atomic mutation triggered when the user taps "Yes, I'm in class", "Missed", or "Cancelled"
 * from the mobile lock-screen notification or web live banner.
 * When `cancelled` is true, the class is marked as cancelled and excluded from the 75% Attendance Guard.
 */
export const respondToAttendanceCheck = mutation({
  args: {
    notificationId: v.optional(v.id("notifications")),
    eventId: v.optional(v.id("events")),
    courseCode: v.string(),
    present: v.boolean(),
    cancelled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const outcome: "present" | "absent" | "cancelled" = args.cancelled
      ? "cancelled"
      : args.present
        ? "present"
        : "absent";

    // 1. Update event attendance status if eventId is provided
    if (args.eventId) {
      await ctx.db.patch(args.eventId, {
        attendanceMarked: outcome,
        updatedAt: Date.now(),
      });
    }

    // 2. Update the notification record so the prompt dismisses across all devices
    if (args.notificationId) {
      await ctx.db.patch(args.notificationId, {
        read: true,
        resolvedOutcome: outcome,
      });
    }

    const normalizedCode = args.courseCode.trim().toUpperCase();

    // 3. If the class was cancelled, do NOT increment totalClassesHeld or attendedClasses!
    if (args.cancelled) {
      return {
        courseCode: normalizedCode,
        outcome: "cancelled",
      };
    }

    // 4. Otherwise auto-increment the course's 75% Attendance Guard counters in Convex DB
    const course = await ctx.db
      .query("courses")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();

    if (course) {
      await ctx.db.patch(course._id, {
        totalClassesHeld: course.totalClassesHeld + 1,
        attendedClasses: course.attendedClasses + (args.present ? 1 : 0),
      });
    } else {
      await ctx.db.insert("courses", {
        code: normalizedCode,
        title: normalizedCode,
        attendedClasses: args.present ? 1 : 0,
        totalClassesHeld: 1,
        targetAttendanceRatio: 0.75,
      });
    }

    return {
      courseCode: normalizedCode,
      outcome,
    };
  },
});

/**
 * Deterministic Cron 2: T-24h and T-3h High-Priority Task Deadline Alerts
 */
export const checkTaskDeadlineAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const in3Hours = now + 3 * 60 * 60 * 1000;
    const in24Hours = now + 24 * 60 * 60 * 1000;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
      .collect();

    for (const task of tasks) {
      if (!task.dueIso) continue;
      const dueMs = Date.parse(task.dueIso);
      if (isNaN(dueMs) || dueMs < now) continue;

      // T-3h alert
      if (dueMs <= in3Hours && !task.notified3h) {
        await ctx.db.insert("notifications", {
          title: `Urgent (T-3h): ${task.title}`,
          body: `${task.domain.toUpperCase()} task due in under 3 hours.`,
          category: "task_deadline",
          read: false,
          createdAt: now,
        });
        await ctx.db.patch(task._id, { notified3h: true, notified24h: true });
      }
      // T-24h alert (for high priority tasks)
      else if (
        task.priority === "high" &&
        dueMs <= in24Hours &&
        !task.notified24h
      ) {
        await ctx.db.insert("notifications", {
          title: `24h Heads-Up: ${task.title}`,
          body: `High-priority ${task.domain} deliverable due tomorrow.`,
          category: "task_deadline",
          read: false,
          createdAt: now,
        });
        await ctx.db.patch(task._id, { notified24h: true });
      }
    }
  },
});

/**
 * Internal helpers for `ai.ts` and `gcal.ts`
 */
export const getExecutionSnapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const nowIso = new Date().toISOString();
    const events = await ctx.db
      .query("events")
      .withIndex("by_start", (q) => q.gte("startIso", nowIso))
      .take(8);

    const todoTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
      .collect();

    const highPriorityTasks = todoTasks
      .filter((t) => t.priority === "high")
      .slice(0, 5);

    const weakTopics = await ctx.db
      .query("studyTopics")
      .withIndex("by_confidence", (q) => q.eq("confidence", "weak"))
      .take(5);

    return {
      upcomingEvents: events,
      highPriorityTasks,
      weakTopics,
    };
  },
});

export const createInternalNotification = internalMutation({
  args: {
    title: v.string(),
    body: v.string(),
    category: v.union(
      v.literal("class_t15m"),
      v.literal("task_deadline"),
      v.literal("daily_brief"),
      v.literal("gap_nudge"),
      v.literal("system")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      ...args,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const getEventById = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId);
  },
});

export const markEventSynced = internalMutation({
  args: {
    eventId: v.id("events"),
    gcalEventId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      gcalEventId: args.gcalEventId,
      syncStatus: "synced",
      updatedAt: Date.now(),
    });
  },
});

export const upsertExternalGCalEvent = internalMutation({
  args: {
    gcalEventId: v.string(),
    title: v.string(),
    location: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_gcal_id", (q) => q.eq("gcalEventId", args.gcalEventId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        location: args.location,
        startIso: args.startIso,
        endIso: args.endIso,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("events", {
      title: args.title,
      type: "founder",
      location: args.location,
      startIso: args.startIso,
      endIso: args.endIso,
      gcalEventId: args.gcalEventId,
      syncStatus: "external",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Public Web Dashboard Notification Queries & Mutations
 */
export const listNotifications = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_created_at")
      .order("desc")
      .take(20);
  },
});

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, { read: true });
  },
});
