import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import {
  BABCOCK_UNIVERSITY_HANDBOOK_RULES,
  CourseProfile,
  formatCourseIntelligenceForPrompt,
} from "../../lib/babcockKnowledge";

/**
 * Next.js Server Route that mirrors `packages/backend/convex/ai.ts` (`processBrainDump`).
 * Injects Babcock University rules, live 75% attendance status, lecturer profiles,
 * textbook intelligence, and any custom handbook notes uploaded by the user.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      rawText,
      currentIsoTime,
      courses = [],
      customHandbookText = "",
      apiKeyOverride,
    } = body as {
      rawText: string;
      currentIsoTime: string;
      courses?: CourseProfile[];
      customHandbookText?: string;
      apiKeyOverride?: string;
    };

    const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Missing GEMINI_API_KEY. Paste your Gemini API key into .env.local or the top-right Key modal.",
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const courseIntelligence = formatCourseIntelligenceForPrompt(courses);
    const customRulesSection = customHandbookText?.trim()
      ? `\nUSER-UPLOADED BABCOCK HANDBOOK / SYLLABUS NOTES:\n${customHandbookText.trim().slice(0, 18000)}`
      : "";

    const promptContents = `
Current Date/Time: ${currentIsoTime}

${BABCOCK_UNIVERSITY_HANDBOOK_RULES}
${customRulesSection}

LIVE STUDENT COURSES, 75% ATTENDANCE GUARD, LECTURER & TEXTBOOK INTELLIGENCE:
${courseIntelligence}

User Brain Dump: "${rawText}"
      `;

    const generationConfig = {
      systemInstruction: `You are DysAI, an executive academic & founder operating system, Babcock University advisor, and expert teacher.
Decompose the user's raw brain dump into structured calendar events, actionable tasks (with 2-3 micro-subtasks), syllabus study topics, AND a proactive coaching brief.
Rules:
1. Calculate exact ISO 8601 timestamps based on Current Date/Time.
2. Respect Babcock University campus conventions (New Horizon, SAT, E102, Hostel curfew ~9:30 PM, and Sabbath hours Friday sundown to Saturday sundown unless the user explicitly overrides).
3. In "coaching":
   - "teacherNote": Explain any weak/mentioned academic concept simply with a clear mental model or concrete study strategy.
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

    // Automatically commit to the live Convex Cloud deployment if functions are deployed
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    let convexReceipt = null;
    if (convexUrl) {
      try {
        const convex = new ConvexHttpClient(convexUrl);
        convexReceipt = await convex.mutation(
          anyApi.brainDump.saveParsedDumpPublic,
          {
            rawText,
            parsed,
          }
        );
      } catch (convexErr) {
        console.warn(
          "Convex cloud schema not pushed yet (run `npx convex dev` in packages/backend):",
          convexErr
        );
      }
    }

    return NextResponse.json({
      ...parsed,
      convexSynced: Boolean(convexReceipt),
      convexBrainDumpId: convexReceipt?.brainDumpId ?? null,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to parse Brain Dump";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
