import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 1. Pull external Google Calendar changes every 15 minutes
crons.interval(
  "google-calendar-two-way-sync",
  { minutes: 15 },
  internal.gcal.pullExternalChanges
);

// 2. Deterministic T-15m Class & Exam alert check every 5 minutes
crons.interval(
  "t-15m-class-alerts",
  { minutes: 5 },
  internal.notifications.checkUpcomingClassAlerts
);

// 2B. Live During/Post-Class Attendance Check-In Prompt every 5 minutes
crons.interval(
  "live-class-attendance-check-in",
  { minutes: 5 },
  internal.notifications.checkLiveClassAttendancePrompts
);

// 3. Deterministic T-24h and T-3h high-priority task deadline check every 15 minutes
crons.interval(
  "task-deadline-alerts",
  { minutes: 15 },
  internal.notifications.checkTaskDeadlineAlerts
);

// 4. Gemini Daily Brief & Free-Block Gap Nudge (every 3 hours during active day)
crons.interval(
  "gemini-gap-nudge-and-brief",
  { hours: 3 },
  internal.ai.generateDailyBriefAndGapNudge
);

export default crons;
