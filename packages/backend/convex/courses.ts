import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal query used by `convex/ai.ts` so Gemini knows valid course codes,
 * live attendance numbers, lecturer styles, test patterns, and textbooks
 * before parsing a messy brain dump.
 */
export const listCodes = internalQuery({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db.query("courses").collect();
    return courses.map((c) => ({
      code: c.code,
      title: c.title,
      attendedClasses: c.attendedClasses,
      totalClassesHeld: c.totalClassesHeld,
      targetAttendanceRatio: c.targetAttendanceRatio,
      lecturerName: c.lecturerName,
      teachingStyle: c.teachingStyle,
      testPattern: c.testPattern,
      recommendedTextbooks: c.recommendedTextbooks,
    }));
  },
});

/**
 * Public query for the Right Column: Course Attendance Guard (75% threshold tracker).
 * Calculates current percentage and how many classes you can safely skip (or must attend).
 */
export const listWithAttendanceGuard = query({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db.query("courses").collect();
    return courses.map((course) => {
      const ratio =
        course.totalClassesHeld > 0
          ? course.attendedClasses / course.totalClassesHeld
          : 1;
      const percentage = Math.round(ratio * 100);
      const target = course.targetAttendanceRatio || 0.75;

      // Calculate classes needed to recover to 75%, or safe skips available
      let classesNeededToRecover = 0;
      let safeSkipsAvailable = 0;

      if (ratio < target) {
        // (attended + x) / (total + x) >= target  =>  x >= (target*total - attended) / (1 - target)
        classesNeededToRecover = Math.ceil(
          (target * course.totalClassesHeld - course.attendedClasses) /
            (1 - target)
        );
      } else if (course.totalClassesHeld > 0) {
        // attended / (total + s) >= target  =>  s <= (attended / target) - total
        safeSkipsAvailable = Math.max(
          0,
          Math.floor(course.attendedClasses / target - course.totalClassesHeld)
        );
      }

      return {
        ...course,
        percentage,
        isAtRisk: ratio < target,
        classesNeededToRecover,
        safeSkipsAvailable,
      };
    });
  },
});

/**
 * Quick seed or add/update course mutation (including lecturer & textbook intelligence)
 */
export const upsertCourse = mutation({
  args: {
    code: v.string(),
    title: v.string(),
    attendedClasses: v.optional(v.number()),
    totalClassesHeld: v.optional(v.number()),
    color: v.optional(v.string()),
    lecturerName: v.optional(v.string()),
    teachingStyle: v.optional(v.string()),
    testPattern: v.optional(v.string()),
    recommendedTextbooks: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedCode = args.code.trim().toUpperCase();
    const existing = await ctx.db
      .query("courses")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        attendedClasses: args.attendedClasses ?? existing.attendedClasses,
        totalClassesHeld: args.totalClassesHeld ?? existing.totalClassesHeld,
        color: args.color ?? existing.color,
        lecturerName: args.lecturerName ?? existing.lecturerName,
        teachingStyle: args.teachingStyle ?? existing.teachingStyle,
        testPattern: args.testPattern ?? existing.testPattern,
        recommendedTextbooks:
          args.recommendedTextbooks ?? existing.recommendedTextbooks,
      });
      return existing._id;
    }

    return await ctx.db.insert("courses", {
      code: normalizedCode,
      title: args.title,
      attendedClasses: args.attendedClasses ?? 0,
      totalClassesHeld: args.totalClassesHeld ?? 0,
      targetAttendanceRatio: 0.75,
      color: args.color,
      lecturerName: args.lecturerName,
      teachingStyle: args.teachingStyle,
      testPattern: args.testPattern,
      recommendedTextbooks: args.recommendedTextbooks,
    });
  },
});

/**
 * Mark attendance for a class session and update the 75% tracker
 */
export const recordAttendance = mutation({
  args: {
    code: v.string(),
    present: v.boolean(),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .unique();

    if (!course) {
      throw new Error(`Course ${args.code} not found`);
    }

    await ctx.db.patch(course._id, {
      totalClassesHeld: course.totalClassesHeld + 1,
      attendedClasses: course.attendedClasses + (args.present ? 1 : 0),
    });
  },
});
