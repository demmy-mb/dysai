import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * DysAI Phase 1 MVP Database Schema
 * Powers the Core Loop:
 * Brain Dump -> Gemini 2.5 Flash -> Convex DB -> Google Calendar Sync -> Proactive Alerts
 */
export default defineSchema({
  // 1. Courses & 75% Attendance Guard + Lecturer & Textbook Intelligence
  courses: defineTable({
    code: v.string(), // e.g., "COSC205"
    title: v.string(), // e.g., "Operating Systems"
    attendedClasses: v.number(),
    totalClassesHeld: v.number(),
    targetAttendanceRatio: v.number(), // defaults to 0.75 (75%)
    color: v.optional(v.string()),
    lecturerName: v.optional(v.string()),
    teachingStyle: v.optional(v.string()),
    testPattern: v.optional(v.string()),
    recommendedTextbooks: v.optional(v.string()),
  }).index("by_code", ["code"]),

  // 2. Active Tasks & Assignments (School, Founder, Personal)
  tasks: defineTable({
    title: v.string(),
    domain: v.union(
      v.literal("school"),
      v.literal("founder"),
      v.literal("personal")
    ),
    courseCode: v.optional(v.string()),
    priority: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    dueIso: v.optional(v.string()),
    subtasks: v.array(
      v.object({
        title: v.string(),
        completed: v.boolean(),
      })
    ),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    brainDumpId: v.optional(v.id("brainDumps")),
    notified24h: v.optional(v.boolean()),
    notified3h: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_domain", ["domain"])
    .index("by_brain_dump", ["brainDumpId"]),

  // 3. Time-bound Events (2-way synced with Google Calendar)
  events: defineTable({
    title: v.string(),
    type: v.union(
      v.literal("class"),
      v.literal("study"),
      v.literal("founder"),
      v.literal("exam")
    ),
    courseCode: v.optional(v.string()),
    location: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
    gcalEventId: v.optional(v.string()),
    syncStatus: v.union(
      v.literal("pending_push"),
      v.literal("synced"),
      v.literal("external")
    ),
    brainDumpId: v.optional(v.id("brainDumps")),
    notified15m: v.optional(v.boolean()),
    attendancePromptSent: v.optional(v.boolean()),
    attendanceMarked: v.optional(
      v.union(v.literal("present"), v.literal("absent"))
    ),
    updatedAt: v.number(),
  })
    .index("by_start", ["startIso"])
    .index("by_gcal_id", ["gcalEventId"])
    .index("by_brain_dump", ["brainDumpId"]),

  // 4. Study Triage & Syllabus Topics
  studyTopics: defineTable({
    courseCode: v.string(),
    topic: v.string(),
    confidence: v.union(
      v.literal("weak"),
      v.literal("review"),
      v.literal("solid")
    ),
    lastStudiedIso: v.optional(v.string()),
    brainDumpId: v.optional(v.id("brainDumps")),
  })
    .index("by_course", ["courseCode"])
    .index("by_confidence", ["confidence"])
    .index("by_brain_dump", ["brainDumpId"]),

  // 5. Brain Dump History & Action Receipt Log (Supports 1-Click Undo)
  brainDumps: defineTable({
    rawText: v.string(),
    summary: v.string(),
    counts: v.object({
      tasks: v.number(),
      events: v.number(),
      studyTopics: v.number(),
    }),
    coaching: v.optional(
      v.object({
        teacherNote: v.string(),
        attendanceWarning: v.optional(v.nullable(v.string())),
        testPrediction: v.optional(v.nullable(v.string())),
        textbookRecommendation: v.optional(v.nullable(v.string())),
      })
    ),
    undone: v.boolean(),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),

  // 6. Proactive Notification & Nudge Dispatch Queue
  notifications: defineTable({
    title: v.string(),
    body: v.string(),
    category: v.union(
      v.literal("class_t15m"),
      v.literal("attendance_check"),
      v.literal("task_deadline"),
      v.literal("daily_brief"),
      v.literal("gap_nudge"),
      v.literal("system")
    ),
    eventId: v.optional(v.id("events")),
    courseCode: v.optional(v.string()),
    resolvedOutcome: v.optional(
      v.union(v.literal("present"), v.literal("absent"))
    ),
    actionUrl: v.optional(v.string()),
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_read", ["read"])
    .index("by_created_at", ["createdAt"]),

  // 7. Mobile Devices (Expo Push Tokens for Lock-Screen Interactive Check-Ins)
  devices: defineTable({
    expoPushToken: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
    updatedAt: v.number(),
  }).index("by_token", ["expoPushToken"]),

  // 7. Google Calendar Sync State (stores incremental syncToken or lastSyncedIso)
  syncState: defineTable({
    key: v.string(), // e.g., "gcal_primary"
    syncToken: v.optional(v.string()),
    lastSyncedIso: v.string(),
  }).index("by_key", ["key"]),
});
