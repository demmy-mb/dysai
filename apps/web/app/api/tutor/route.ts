import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import {
  BABCOCK_UNIVERSITY_HANDBOOK_RULES,
  CourseProfile,
  formatCourseIntelligenceForPrompt,
} from "../../lib/babcockKnowledge";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

interface TutorRequestBody {
  mode: "teach_topic" | "ask_handbook_or_agent";
  courseCode?: string;
  topic?: string;
  confidence?: "weak" | "review" | "solid";
  userMessage?: string;
  question?: string;
  chatHistory?: ChatTurn[];
  courses?: CourseProfile[];
  customHandbookText?: string;
  fileData?: string;
  fileMimeType?: string;
  fileName?: string;
  apiKeyOverride?: string;
}

async function generateWithFallback(
  ai: GoogleGenAI,
  contents: unknown,
  config: Record<string, unknown>
) {
  try {
    return await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents as Parameters<
        GoogleGenAI["models"]["generateContent"]
      >[0]["contents"],
      config,
    });
  } catch {
    return await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: contents as Parameters<
        GoogleGenAI["models"]["generateContent"]
      >[0]["contents"],
      config,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TutorRequestBody;
    const {
      mode,
      courses = [],
      customHandbookText = "",
      apiKeyOverride,
    } = body;

    const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Missing GEMINI_API_KEY. Paste your Gemini API key into .env.local or the top-right AI Key modal.",
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const courseIntelligence = formatCourseIntelligenceForPrompt(courses);
    const customRulesSection = customHandbookText?.trim()
      ? `\nUSER-UPLOADED BABCOCK HANDBOOK / SYLLABUS NOTES:\n${customHandbookText.trim().slice(0, 24000)}`
      : "";

    if (mode === "teach_topic") {
      const courseCode = (body.courseCode || "").toUpperCase();
      const topic = body.topic || "Course Topic";
      const confidence = body.confidence || "weak";
      const matchedCourse = courses.find(
        (c) => c.code.toUpperCase() === courseCode
      );
      const historyText = (body.chatHistory || [])
        .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.text}`)
        .join("\n");

      // Follow-up question inside the AI Tutor modal
      if (body.userMessage && body.userMessage.trim().length > 0) {
        const followUpPrompt = `
${BABCOCK_UNIVERSITY_HANDBOOK_RULES}
${customRulesSection}

COURSE PROFILE:
${matchedCourse ? formatCourseIntelligenceForPrompt([matchedCourse]) : `Course: ${courseCode}`}

TOPIC BEING STUDIED: "${topic}" (Current Student Confidence: ${confidence})
PREVIOUS TUTOR CONVERSATION:
${historyText || "None"}

STUDENT FOLLOW-UP QUESTION:
"${body.userMessage.trim()}"
        `;

        const response = await generateWithFallback(ai, followUpPrompt, {
          systemInstruction: `You are a patient, crystal-clear Babcock University professor and personal study coach.
Answer the student's follow-up question directly with simple intuitive analogies, worked examples, and exact textbook chapter pointers if helpful. Keep formatting clean and readable.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
            },
            required: ["reply"],
          },
        });

        return NextResponse.json(JSON.parse(response.text!));
      }

      // Initial Teach & Quiz generation for a Study Topic
      const teachPrompt = `
${BABCOCK_UNIVERSITY_HANDBOOK_RULES}
${customRulesSection}

LIVE COURSE & LECTURER CONTEXT:
${matchedCourse ? formatCourseIntelligenceForPrompt([matchedCourse]) : courseIntelligence}

TARGET COURSE: ${courseCode}
TARGET TOPIC: "${topic}"
CURRENT CONFIDENCE LEVEL: ${confidence}
      `;

      const response = await generateWithFallback(ai, teachPrompt, {
        systemInstruction: `You are an elite Babcock University lecturer and personal AI tutor.
Teach "${topic}" for ${courseCode} so the student actually understands it from first principles, knows which textbook chapter to open, knows how their lecturer sets tests/surprise quizzes on it, and can test themselves with a realistic practice question.
Requirements:
- "explanation": Clear, beginner-friendly step-by-step teaching with a concrete example or analogy tailored to the student's "${confidence}" confidence level.
- "keyTakeaways": Exactly 3 concise, high-yield exam takeaways.
- "textbookGuide": Recommend the exact textbook(s) from the course profile (or standard university textbooks if missing) plus the specific chapter/topic to read.
- "lecturerExamTip": Use the lecturer's teachingStyle and testPattern to explain how they usually ask questions on this topic and when a surprise quiz or mid-semester test could happen.
- "quiz": A realistic 4-option multiple-choice practice question written in the lecturer's style, with "correctIndex" (0-3) and a clear step-by-step "workedSolution".`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanation: { type: Type.STRING },
            keyTakeaways: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            textbookGuide: { type: Type.STRING },
            lecturerExamTip: { type: Type.STRING },
            quiz: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctIndex: { type: Type.INTEGER },
                workedSolution: { type: Type.STRING },
              },
              required: [
                "question",
                "options",
                "correctIndex",
                "workedSolution",
              ],
            },
          },
          required: [
            "explanation",
            "keyTakeaways",
            "textbookGuide",
            "lecturerExamTip",
            "quiz",
          ],
        },
      });

      return NextResponse.json(JSON.parse(response.text!));
    }

    // Mode: "ask_handbook_or_agent" (supports built-in rules, live courses, and uploaded PDF/TXT handbook)
    const question =
      body.question?.trim() ||
      "Summarize the key academic rules, attendance warnings, and textbook priorities I need right now.";
    const historyText = (body.chatHistory || [])
      .map((m) => `${m.role === "user" ? "Student" : "Agent"}: ${m.text}`)
      .join("\n");

    const textPrompt = `
Current Date/Time: ${new Date().toISOString()}

${BABCOCK_UNIVERSITY_HANDBOOK_RULES}
${customRulesSection}

LIVE STUDENT COURSES, 75% ATTENDANCE GUARD, LECTURER & TEXTBOOK INTELLIGENCE:
${courseIntelligence}

PREVIOUS Q&A CONTEXT:
${historyText || "None"}

${body.fileName ? `ATTACHED DOCUMENT NAME: ${body.fileName}` : ""}

STUDENT QUESTION:
"${question}"
    `;

    const parts: Array<Record<string, unknown>> = [];

    // Attach uploaded PDF natively so Gemini can read the actual Student Handbook / Syllabus PDF
    if (body.fileData && body.fileMimeType) {
      const cleanBase64 = body.fileData.includes(",")
        ? body.fileData.split(",")[1]
        : body.fileData;

      if (body.fileMimeType === "application/pdf") {
        parts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: cleanBase64,
          },
        });
      } else if (body.fileMimeType.startsWith("text/")) {
        const decodedText = Buffer.from(cleanBase64, "base64").toString(
          "utf-8"
        );
        parts.push({
          text: `ATTACHED FILE CONTENT (${body.fileName || "document"}):\n${decodedText.slice(0, 40000)}`,
        });
      }
    }

    parts.push({ text: textPrompt });

    const response = await generateWithFallback(ai, parts, {
      systemInstruction: `You are DysAI's Babcock University Academic Agent, Handbook Expert, and Personal Teacher.
Answer the student's question accurately using:
1. Any attached PDF/text Babcock Student Handbook or Course Syllabus (prioritize exact rules/policies from uploaded docs when present).
2. The built-in Babcock University Academic & Campus Rules (75% attendance rule, 40/60 CA & exam split, 5.00 GPA scale, campus venues, Sabbath & curfew rules).
3. The student's live attendance percentages, lecturer teaching styles, surprise test patterns, and textbooks.
Be honest: if a specific rule isn't in the built-in summary or uploaded file, say so clearly and tell the student what section of their official Babcock handbook/portal to verify.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          citationsOrRules: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          suggestedAction: { type: Type.STRING, nullable: true },
        },
        required: ["answer", "citationsOrRules"],
      },
    });

    return NextResponse.json(JSON.parse(response.text!));
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to run Babcock AI Tutor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
