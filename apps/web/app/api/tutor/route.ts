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
  quizOnly?: boolean;
  previousQuestions?: string[];
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

const quizQuestionItemSchema = {
  type: Type.OBJECT,
  properties: {
    syllabusModule: { type: Type.STRING },
    question: { type: Type.STRING },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    correctIndex: { type: Type.INTEGER },
    workedSolution: { type: Type.STRING },
  },
  required: [
    "syllabusModule",
    "question",
    "options",
    "correctIndex",
    "workedSolution",
  ],
};

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

      // 1. Follow-up question inside the AI Tutor modal
      if (body.userMessage && body.userMessage.trim().length > 0) {
        const followUpPrompt = `
${BABCOCK_UNIVERSITY_HANDBOOK_RULES}
${customRulesSection}

COURSE PROFILE & OFFICIAL SYLLABUS:
${matchedCourse ? formatCourseIntelligenceForPrompt([matchedCourse]) : `Course: ${courseCode}`}

TOPIC BEING STUDIED: "${topic}" (Current Student Confidence: ${confidence})
PREVIOUS TUTOR CONVERSATION:
${historyText || "None"}

STUDENT FOLLOW-UP QUESTION:
"${body.userMessage.trim()}"
        `;

        const response = await generateWithFallback(ai, followUpPrompt, {
          systemInstruction: `You are a patient, crystal-clear Babcock University professor and personal study coach.
Answer the student's follow-up question directly with simple intuitive analogies, worked examples aligned with the official NUC CCMAS / Babcock syllabus, and exact textbook chapter pointers if helpful. Keep formatting clean and readable.`,
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

      // 2. Fresh 3-Question Syllabus Quiz generator (quizOnly mode)
      if (body.quizOnly) {
        const previousList =
          body.previousQuestions && body.previousQuestions.length > 0
            ? `\nDO NOT REPEAT THESE ALREADY-ASKED QUESTIONS:\n${body.previousQuestions
                .map((q, idx) => `${idx + 1}. ${q}`)
                .join("\n")}`
            : "";

        const quizOnlyPrompt = `
${customRulesSection}

LIVE COURSE, LECTURER & OFFICIAL BABCOCK SYLLABUS:
${matchedCourse ? formatCourseIntelligenceForPrompt([matchedCourse]) : courseIntelligence}

TARGET COURSE: ${courseCode}
TARGET TOPIC / SYLLABUS FOCUS: "${topic}"
${previousList}
        `;

        const response = await generateWithFallback(ai, quizOnlyPrompt, {
          systemInstruction: `You are a Babcock University examiner writing a brand-new 3-question multiple-choice practice quiz strictly grounded in the course's official NUC CCMAS / Babcock syllabus modules and the lecturer's test style.
Generate exactly 3 distinct questions in "quizQuestions":
- Question 1: Foundational concept/definition from the syllabus module.
- Question 2: Applied problem, code trace, circuit/proof, or scenario matching the lecturer's testPattern.
- Question 3: Higher-order exam-level edge case or calculation.
For each question, include "syllabusModule" (naming the matching module), 4 clear "options", "correctIndex" (0-3), and a step-by-step "workedSolution".`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              quizQuestions: {
                type: Type.ARRAY,
                items: quizQuestionItemSchema,
              },
            },
            required: ["quizQuestions"],
          },
        });

        const parsed = JSON.parse(response.text!);
        return NextResponse.json({
          ...parsed,
          quiz: parsed.quizQuestions?.[0] ?? null,
        });
      }

      // 3. Initial Teach & 3-Question Syllabus Quiz generation for a Study Topic / Syllabus Module
      const teachPrompt = `
${BABCOCK_UNIVERSITY_HANDBOOK_RULES}
${customRulesSection}

LIVE COURSE, LECTURER & OFFICIAL BABCOCK / NUC CCMAS SYLLABUS CONTEXT:
${matchedCourse ? formatCourseIntelligenceForPrompt([matchedCourse]) : courseIntelligence}

TARGET COURSE: ${courseCode}
TARGET TOPIC OR SYLLABUS MODULE: "${topic}"
CURRENT CONFIDENCE LEVEL: ${confidence}
      `;

      const response = await generateWithFallback(ai, teachPrompt, {
        systemInstruction: `You are an elite Babcock University lecturer and personal AI tutor.
Teach "${topic}" for ${courseCode} strictly aligned with the official Babcock / NUC CCMAS syllabus modules so the student understands it from first principles, knows which textbook chapter to open, knows how their lecturer sets tests/surprise quizzes on it, and can test themselves with a 3-question syllabus quiz.
Requirements:
- "explanation": Clear, beginner-friendly step-by-step teaching with a concrete example or analogy tailored to the student's "${confidence}" confidence level.
- "keyTakeaways": Exactly 3 concise, high-yield exam takeaways.
- "textbookGuide": Recommend the exact textbook(s) from the course profile (or standard university textbooks if missing) plus the specific chapter/topic to read.
- "lecturerExamTip": Use the lecturer's teachingStyle and testPattern to explain how they usually ask questions on this topic and when a surprise quiz or mid-semester test could happen.
- "quizQuestions": Exactly 3 realistic 4-option multiple-choice practice questions written in the lecturer's style and mapped to the official syllabus:
  1) Foundational definition/concept check
  2) Applied trace, circuit, proof, or scenario check
  3) Exam-grade edge case or calculation
  Each item must include "syllabusModule", "question", "options" (4 strings), "correctIndex" (0-3), and a step-by-step "workedSolution".`,
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
            quizQuestions: {
              type: Type.ARRAY,
              items: quizQuestionItemSchema,
            },
          },
          required: [
            "explanation",
            "keyTakeaways",
            "textbookGuide",
            "lecturerExamTip",
            "quizQuestions",
          ],
        },
      });

      const parsed = JSON.parse(response.text!);
      return NextResponse.json({
        ...parsed,
        quiz: parsed.quizQuestions?.[0] ?? null,
      });
    }

    // Mode: "ask_handbook_or_agent" (supports built-in rules, live courses, syllabus modules, and uploaded PDF/TXT handbook)
    const question =
      body.question?.trim() ||
      "Summarize the key academic rules, attendance warnings, syllabus modules, and textbook priorities I need right now.";
    const historyText = (body.chatHistory || [])
      .map((m) => `${m.role === "user" ? "Student" : "Agent"}: ${m.text}`)
      .join("\n");

    const textPrompt = `
Current Date/Time: ${new Date().toISOString()}

${BABCOCK_UNIVERSITY_HANDBOOK_RULES}
${customRulesSection}

LIVE STUDENT COURSES, 75% ATTENDANCE GUARD, LECTURER, TEXTBOOK & OFFICIAL SYLLABUS INTELLIGENCE:
${courseIntelligence}

PREVIOUS Q&A CONTEXT:
${historyText || "None"}

${body.fileName ? `ATTACHED DOCUMENT NAME: ${body.fileName}` : ""}

STUDENT QUESTION:
"${question}"
    `;

    const parts: Array<Record<string, unknown>> = [];

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
3. The student's live attendance percentages, official NUC CCMAS / Babcock course syllabus modules, lecturer teaching styles, surprise test patterns, and textbooks.
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
