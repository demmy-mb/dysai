export interface ConvexCourseIntel {
  code: string;
  title: string;
  attendedClasses: number;
  totalClassesHeld: number;
  targetAttendanceRatio: number;
  lecturerName?: string;
  teachingStyle?: string;
  testPattern?: string;
  recommendedTextbooks?: string;
  syllabusModules?: string[];
}

export const BABCOCK_UNIVERSITY_HANDBOOK_RULES = `
BABCOCK UNIVERSITY ACADEMIC & CAMPUS HANDBOOK KNOWLEDGE BASE:
1. 75% ATTENDANCE RULE (STRICT EXAM ELIGIBILITY):
   - Students MUST maintain at least 75% attendance in lectures and labs for every course to sit for the Final Examination.
   - Falling below 75% results in automatic disqualification ("Barred from Exam") unless covered by an approved medical excuse from BUTH (Babcock University Teaching Hospital).
   - Warn the student immediately whenever a referenced course is below 75% or has 0 safe skips remaining.

2. GRADING, CONTINUOUS ASSESSMENT (CA) & 5.00 GPA SCALE:
   - Standard course grade breakdown: 40% Continuous Assessment (10% attendance/participation, 15% quizzes/assignments/labs, 15% mid-semester test) + 60% Final Examination.
   - 5.00 GPA Scale: A (80-100 = 5.0), B (60-79 = 4.0), C (50-59 = 3.0), D (45-49 = 2.0), E (40-44 = 1.0), F (0-39 = 0.0).

3. CAMPUS LOCATIONS & ABBREVIATIONS:
   - New Horizon (Rm 1, Rm 2, Studio), SAT (e.g., E102, SAT Hall), EAH, BBS, BUTH, Amphitheatre, University Library, Hostels (Winslow, Bethel, Gideon Troopers, Samuel Akande, Nelson Mandela, Welch, Crystal, Platinum, Havilah, etc.).

4. SCHEDULE, WORSHIP & CURFEW CONSTRAINTS:
   - Mid-week Chapel & Friday Vespers: Mandatory worship times.
   - Sabbath Hours: Friday sundown (~6:00 PM) through Saturday sundown (~6:30 PM) — do not schedule academic study sprints or secular meetings during Sabbath hours unless explicitly asked.
   - Hostel Curfew: 9:30 PM - 10:00 PM check-in.
`.trim();

export function formatCourseIntelligenceForPrompt(
  courses: ConvexCourseIntel[]
): string {
  if (!courses || courses.length === 0) {
    return "No courses registered yet.";
  }

  return courses
    .map((c) => {
      const ratio =
        c.totalClassesHeld > 0 ? c.attendedClasses / c.totalClassesHeld : 1;
      const pct = Math.round(ratio * 100);
      const target = c.targetAttendanceRatio || 0.75;
      const isAtRisk = ratio < target;

      let attendanceSummary = `SAFE (${pct}%: ${c.attendedClasses}/${c.totalClassesHeld})`;
      if (isAtRisk) {
        const needed = Math.ceil(
          (target * c.totalClassesHeld - c.attendedClasses) / (1 - target)
        );
        attendanceSummary = `AT RISK (${pct}%: ${c.attendedClasses}/${c.totalClassesHeld} — attend next ${needed} class(es) to reach 75%)`;
      } else if (c.totalClassesHeld > 0) {
        const safeSkips = Math.max(
          0,
          Math.floor(c.attendedClasses / target - c.totalClassesHeld)
        );
        attendanceSummary = `SAFE (${pct}%: ${c.attendedClasses}/${c.totalClassesHeld} — ${safeSkips} safe skip(s) left)`;
      }

      const syllabusText =
        c.syllabusModules && c.syllabusModules.length > 0
          ? c.syllabusModules.map((m) => `    * ${m}`).join("\n")
          : "    * Not specified";

      return [
        `- ${c.code}: ${c.title}`,
        `  Attendance: ${attendanceSummary}`,
        `  Lecturer: ${c.lecturerName || "Not specified"}`,
        `  Teaching Style: ${c.teachingStyle || "Not specified"}`,
        `  Test / Quiz Pattern: ${c.testPattern || "Not specified"}`,
        `  Recommended Textbooks: ${c.recommendedTextbooks || "Standard university texts"}`,
        `  Official Syllabus Modules:\n${syllabusText}`,
      ].join("\n");
    })
    .join("\n");
}
