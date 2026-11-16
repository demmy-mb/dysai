export interface CourseProfile {
  code: string;
  title: string;
  attendedClasses: number;
  totalClassesHeld: number;
  targetAttendanceRatio: number;
  lecturerName?: string;
  teachingStyle?: string;
  testPattern?: string;
  recommendedTextbooks?: string;
}

export const BABCOCK_UNIVERSITY_HANDBOOK_RULES = `
BABCOCK UNIVERSITY ACADEMIC & CAMPUS HANDBOOK KNOWLEDGE BASE:
1. 75% ATTENDANCE RULE (STRICT EXAM ELIGIBILITY):
   - Students MUST maintain at least 75% attendance in lectures and labs for every course to be eligible to sit for the Final Examination.
   - Falling below 75% results in automatic disqualification ("Barred from Exam") unless covered by an officially approved medical excuse from BUTH (Babcock University Teaching Hospital) or formal university clearance.
   - Always calculate whether a student is currently below 75% or only 1 skip away from dropping below 75%, and issue a direct warning whenever a course in their Brain Dump is at risk.

2. GRADING, CONTINUOUS ASSESSMENT (CA) & 5.00 GPA SCALE:
   - Standard course grade breakdown: 40% Continuous Assessment (typically 10% attendance/participation, 15% quizzes/assignments/lab reports, 15% mid-semester test) + 60% Final Examination.
   - Babcock 5.00 GPA Scale:
     * A (80 - 100): 5.0 grade points
     * B (60 - 79): 4.0 grade points
     * C (50 - 59): 3.0 grade points
     * D (45 - 49): 2.0 grade points
     * E (40 - 44): 1.0 grade point
     * F (0 - 39): 0.0 grade points (Carryover / Repeat required)
   - Passing grade is D (45%) or higher; anything below 45% (40-44 is E in some regulations, or F < 40) severely damages CGPA. Aim for 80+ (A).

3. CAMPUS LOCATIONS & ABBREVIATIONS (ILISHAN-REMO CAMPUS):
   - New Horizon: Computing & ICT building (Rm 1, Rm 2, Computing Studio, Software Labs).
   - SAT: School of Science and Technology / Computing & Engineering Sciences classrooms (e.g., E102, SAT Hall).
   - EAH: Education and Humanities building.
   - BBS: Babcock Business School.
   - BUTH: Babcock University Teaching Hospital (clinic/medical excuses).
   - Amphitheatre / Pioneer Hall / University Library (Laz Otti Memorial Library).
   - Hostels: Winslow, Bethel, Gideon Troopers, Samuel Akande, Nelson Mandela, Welch, Crystal, Platinum, Havilah, Topaz, Emerald, Sapphire, Queen Esther, Nyberg, White, Fad.

4. SCHEDULE, WORSHIP & CURFEW CONSTRAINTS:
   - Mid-week Chapel & Friday Vespers: Mandatory spiritual worship blocks; avoid scheduling conflicting personal study blocks during Wednesday Chapel or Friday evening Vespers.
   - Sabbath Hours: Friday sundown (~6:00 PM) through Saturday sundown (~6:30 PM). Do NOT schedule academic study sprints, exams, or secular founder meetings during Sabbath worship hours unless the user explicitly overrides this.
   - Hostel Curfew & Security: Hostel check-in/curfew is typically 9:30 PM - 10:00 PM. Late-night study sessions after 9:30 PM should be labeled as taking place at the Hostel or Library (when extended hours apply), not walking across campus unnecessarily.
   - Dress Code & Exam Clearance: Corporate/formal wear is enforced on Mondays and Wednesdays and during exams; Student Financial/Course Registration clearance + Attendance clearance are required before entering exam halls.
`.trim();

export const DEFAULT_BABCOCK_COURSES: CourseProfile[] = [
  {
    code: "COS 201",
    title: "Computer Programming I",
    attendedClasses: 11,
    totalClassesHeld: 15, // 73% -> At Risk (<75%)
    targetAttendanceRatio: 0.75,
    lecturerName: "Dr. Adebayo (COS 201)",
    teachingStyle:
      "Emphasizes live code tracing, dry-running loops/arrays/functions on paper, and practical New Horizon lab debugging.",
    testPattern:
      "Often drops 10-mark surprise lab quizzes right after finishing control structures, arrays, or functions; mid-semester includes trace-the-output questions.",
    recommendedTextbooks:
      "Deitel & Deitel — How to Program (C++/Java/Python), plus New Horizon Practical Lab Manual",
  },
  {
    code: "SEN 201",
    title: "Software Engineering Principles",
    attendedClasses: 14,
    totalClassesHeld: 16, // 88% -> Safe
    targetAttendanceRatio: 0.75,
    lecturerName: "Dr. Ogunleye (SEN 201)",
    teachingStyle:
      "Scenario-driven lectures comparing SDLC models (Agile vs. Waterfall vs. Spiral), requirements elicitation, and UML modeling.",
    testPattern:
      "Mid-semester tests heavily feature case-study essays and drawing UML Use Case, Class, or Sequence diagrams; marks terminology precision strictly.",
    recommendedTextbooks:
      "Ian Sommerville — Software Engineering (10th Ed.), Roger S. Pressman — Software Engineering: A Practitioner's Approach",
  },
  {
    code: "CSC 203",
    title: "Discrete Structures",
    attendedClasses: 13,
    totalClassesHeld: 16, // 81% -> Safe
    targetAttendanceRatio: 0.75,
    lecturerName: "Prof. Mensah (CSC 203)",
    teachingStyle:
      "Strict on step-by-step formal mathematical proofs, base cases in Mathematical Induction, truth tables, and recurrence relations.",
    testPattern:
      "Known for unannounced 15-minute desk quizzes at the start of Thursday lectures immediately after covering a new proof technique.",
    recommendedTextbooks:
      "Kenneth H. Rosen — Discrete Mathematics and Its Applications (8th Ed.), Susanna S. Epp — Discrete Mathematics with Applications",
  },
  {
    code: "IFT 211",
    title: "Digital Logic & Design",
    attendedClasses: 10,
    totalClassesHeld: 14, // 71% -> At Risk (<75%)
    targetAttendanceRatio: 0.75,
    lecturerName: "Engr. Balogun (IFT 211)",
    teachingStyle:
      "Fast-paced chalkboard & circuit simulation derivations covering Boolean algebra, K-Maps, combinational circuits, and sequential flip-flops.",
    testPattern:
      "Tests 4-variable Karnaugh Map simplifications (especially don't-care conditions) and JK/D Flip-Flop excitation tables right after module wrap-up.",
    recommendedTextbooks:
      "M. Morris Mano — Digital Design (5th/6th Ed.), Thomas L. Floyd — Digital Fundamentals",
  },
  {
    code: "BU COS 209",
    title: "Computing Studio III",
    attendedClasses: 12,
    totalClassesHeld: 14, // 86% -> Safe
    targetAttendanceRatio: 0.75,
    lecturerName: "Mr. Adeyemi (BU COS 209)",
    teachingStyle:
      "Project-driven studio sessions focused on Git workflow, architecture reviews, sprint demos, and clean modular code.",
    testPattern:
      "Continuous milestone evaluations instead of traditional paper quizzes; expects live demos, commit history checks, and architecture defense.",
    recommendedTextbooks:
      "Robert C. Martin — Clean Code, Babcock Computing Studio III Project Guide",
  },
];

export interface CourseAttendanceStatus {
  percentage: number;
  isAtRisk: boolean;
  classesNeededToRecover: number;
  safeSkipsAvailable: number;
}

/**
 * Shared attendance math for both UI cards and AI prompts so numbers never drift.
 */
export function computeAttendanceStatus(
  course: Pick<
    CourseProfile,
    "attendedClasses" | "totalClassesHeld" | "targetAttendanceRatio"
  >
): CourseAttendanceStatus {
  const ratio =
    course.totalClassesHeld > 0
      ? course.attendedClasses / course.totalClassesHeld
      : 1;
  const percentage = Math.round(ratio * 100);
  const target = course.targetAttendanceRatio || 0.75;

  let classesNeededToRecover = 0;
  let safeSkipsAvailable = 0;

  if (ratio < target) {
    classesNeededToRecover = Math.ceil(
      (target * course.totalClassesHeld - course.attendedClasses) / (1 - target)
    );
  } else if (course.totalClassesHeld > 0) {
    safeSkipsAvailable = Math.max(
      0,
      Math.floor(course.attendedClasses / target - course.totalClassesHeld)
    );
  }

  return {
    percentage,
    isAtRisk: ratio < target,
    classesNeededToRecover,
    safeSkipsAvailable,
  };
}

/**
 * Formats live course attendance, lecturer profiles, and textbooks for Gemini prompts.
 */
export function formatCourseIntelligenceForPrompt(
  courses: CourseProfile[]
): string {
  if (!courses || courses.length === 0) {
    return "No courses registered yet.";
  }

  return courses
    .map((c) => {
      const status = computeAttendanceStatus(c);
      const attendanceLine = status.isAtRisk
        ? `AT RISK (${status.percentage}%: ${c.attendedClasses}/${c.totalClassesHeld} attended — MUST attend next ${status.classesNeededToRecover} class(es) consecutively to recover to 75%)`
        : `SAFE (${status.percentage}%: ${c.attendedClasses}/${c.totalClassesHeld} attended — ${status.safeSkipsAvailable} safe skip(s) available)`;

      return [
        `- ${c.code}: ${c.title}`,
        `  Attendance: ${attendanceLine}`,
        `  Lecturer: ${c.lecturerName || "Not specified"}`,
        `  Teaching Style: ${c.teachingStyle || "Not specified"}`,
        `  Test / Surprise Quiz Pattern: ${c.testPattern || "Not specified"}`,
        `  Recommended Textbooks: ${c.recommendedTextbooks || "Standard university texts"}`,
      ].join("\n");
    })
    .join("\n");
}
