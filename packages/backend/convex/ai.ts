"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI, Type } from "@google/genai";
import { internal } from "./_generated/api";
import {
  BABCOCK_UNIVERSITY_HANDBOOK_RULES,
  formatCourseIntelligenceForPrompt,
} from "./babcockKnowledge";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY in Convex environment variables. Run `npx convex env set GEMINI_API_KEY <your_key>`."
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Primary Brain Dump Node Action (`gemini-2.5-flash` with strict Structured Outputs)
 * Converts messy multi-intent user input into tasks, calendar events, and study topics,
 * then commits everything to Convex and returns the Action Receipt.
 */
export const processBrainDump = action({
  args: {
    rawText: v.string(),
    currentIsoTime: v.string(), // Passed from client for accurate relative date math
  },
  handler: async (ctx, args) => {
    const ai = getGeminiClient();

    // 1. Fetch existing course codes, attendance, lecturer styles, and textbooks
    const courses = await ctx.runQuery(internal.courses.listCodes);
    const courseIntelligence = formatCourseIntelligenceForPrompt(courses);

    // 2. Call Gemini 2.5 Flash (with automatic fallback to gemini-flash-latest) with strict JSON schema
    const promptContents = `
Current Date/Time: ${args.currentIsoTime}

${BABCOCK_UNIVERSITY_HANDBOOK_RULES}

LIVE STUDENT COURSES, ATTENDANCE GUARD & LECTURER INTELLIGENCE:
${courseIntelligence}

User Brain Dump: "${args.rawText}"
      `;

    const generationConfig = {
      systemInstruction: `You are DysAI, an executive academic & founder operating system, Babcock University advisor, and expert teacher.
Decompose the user's raw brain dump into structured calendar events, actionable tasks (with 2-3 micro-subtasks), syllabus study topics, AND a proactive coaching brief.
Rules:
1. Calculate exact ISO 8601 timestamps based on Current Date/Time.
2. Respect Babcock University campus conventions (New Horizon, SAT, E102, Hostel curfew ~9:30 PM, and Sabbath hours Friday sundown to Saturday sundown).
3. In "coaching":
   - "teacherNote": Explain any weak/mentioned academic concept simply with a clear mental model or step-by-step study plan.
   - "attendanceWarning": If a referenced course is below 75% attendance or has <= 1 safe skip left, warn the student about Babcock's 75% exam eligibility rule and state exact classes needed; otherwise null.
   - "testPrediction": Based on the course lecturer's teachingStyle & testPattern, warn if an impromptu quiz or test is likely soon and how the lecturer asks questions; otherwise null.
   - "textbookRecommendation": Name the exact textbook (and best chapter/topic section) for the coursework mentioned; otherwise null.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                domain: {
                  type: Type.STRING,
                  enum: ["school", "founder", "personal"],
                },
                courseCode: { type: Type.STRING, nullable: true },
                priority: {
                  type: Type.STRING,
                  enum: ["high", "medium", "low"],
                },
                dueIso: { type: Type.STRING, nullable: true },
                subtasks: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["title", "domain", "priority", "subtasks"],
            },
          },
          events: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                type: {
                  type: Type.STRING,
                  enum: ["class", "study", "founder", "exam"],
                },
                courseCode: { type: Type.STRING, nullable: true },
                location: { type: Type.STRING, nullable: true },
                startIso: { type: Type.STRING },
                endIso: { type: Type.STRING },
              },
              required: ["title", "type", "startIso", "endIso"],
            },
          },
          studyTopics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                courseCode: { type: Type.STRING },
                topic: { type: Type.STRING },
                confidence: {
                  type: Type.STRING,
                  enum: ["weak", "review", "solid"],
                },
              },
              required: ["courseCode", "topic", "confidence"],
            },
          },
          coaching: {
            type: Type.OBJECT,
            properties: {
              teacherNote: { type: Type.STRING },
              attendanceWarning: { type: Type.STRING, nullable: true },
              testPrediction: { type: Type.STRING, nullable: true },
              textbookRecommendation: { type: Type.STRING, nullable: true },
            },
            required: ["teacherNote"],
          },
        },
        required: ["summary", "tasks", "events", "studyTopics", "coaching"],
      },
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: promptContents,
        config: generationConfig,
      });
    } catch {
      response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: promptContents,
        config: generationConfig,
      });
    }

    const parsed = JSON.parse(response.text!);

    // 3. Commit everything to Convex DB & trigger Google Calendar sync
    const receipt = await ctx.runMutation(
      internal.brainDump.commitParsedDump,
      {
        rawText: args.rawText,
        parsed,
      }
    );

    return {
      ...parsed,
      brainDumpId: receipt.brainDumpId,
      counts: receipt.counts,
    };
  },
});

/**
 * Scheduled Gemini Daily Brief & Gap Nudge Action
 * Scans today's schedule, high-priority tasks, and weak study topics,
 * then dispatches a proactive nudge notification telling the user what to execute next.
 */
export const generateDailyBriefAndGapNudge = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    const ai = new GoogleGenAI({ apiKey });
    const [snapshot, courses] = await Promise.all([
      ctx.runQuery(internal.notifications.getExecutionSnapshot),
      ctx.runQuery(internal.courses.listCodes),
    ]);
    const courseIntelligence = formatCourseIntelligenceForPrompt(courses);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
        Current ISO Time: ${new Date().toISOString()}
        ${BABCOCK_UNIVERSITY_HANDBOOK_RULES}
        Courses & Attendance Guard:
        ${courseIntelligence}
        Upcoming Events (next 24h): ${JSON.stringify(snapshot.upcomingEvents)}
        Open High-Priority Tasks: ${JSON.stringify(snapshot.highPriorityTasks)}
        Weak Study Topics: ${JSON.stringify(snapshot.weakTopics)}
      `,
      config: {
        systemInstruction: `You are DysAI's proactive Babcock University academic & founder nudge engine.
        Check for any course under Babcock's 75% attendance threshold, upcoming lecturer surprise quiz risks, or open free blocks, and produce a concise, high-agency notification (under 180 characters) telling the user exactly what to execute right now.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            body: { type: Type.STRING },
            category: {
              type: Type.STRING,
              enum: ["daily_brief", "gap_nudge"],
            },
          },
          required: ["title", "body", "category"],
        },
      },
    });

    const nudge = JSON.parse(response.text!);
    await ctx.runMutation(internal.notifications.createInternalNotification, {
      title: nudge.title,
      body: nudge.body,
      category: nudge.category,
    });
  },
});
