import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

function getGCalClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  if (!clientEmail || !privateKey) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return {
    calendar: google.calendar({ version: "v3", auth }),
    calendarId,
  };
}

/**
 * Smart classifier for external Google Calendar events so your real schedule
 * ("Study Block: CSC 203", "Founder Block: ...", "COS 201", "SEN 201", etc.)
 * gets proper types and course badges automatically.
 */
function classifyGCalEvent(summary: string): {
  type: "class" | "study" | "founder" | "exam";
  courseCode: string | null;
} {
  const text = summary.trim();
  const upper = text.toUpperCase();

  // Extract course code like COS 201, SEN 201, IFT 211, ENT 211, CSC 203, BU COS 209
  const codeMatch = upper.match(
    /\b(BU\s+COS\s*\d{3}|COSC?\s*\d{3}|SEN\s*\d{3}|IFT\s*\d{3}|ENT\s*\d{3}|CSC\s*\d{3}|MATHS)\b/
  );
  const courseCode = codeMatch ? codeMatch[1].replace(/\s+/g, " ") : null;

  if (
    upper.includes("EXAM") ||
    upper.includes("TEST") ||
    upper.includes("QUIZ") ||
    upper.includes("MID-SEM")
  ) {
    return { type: "exam", courseCode };
  }
  if (upper.includes("STUDY BLOCK") || upper.startsWith("STUDY:")) {
    return { type: "study", courseCode };
  }
  if (
    upper.includes("FOUNDER") ||
    upper.includes("SPRINT") ||
    upper.includes("ADMIN & PREP") ||
    upper.includes("MARKET") ||
    upper.includes("SHIPPING")
  ) {
    return { type: "founder", courseCode: null };
  }
  if (
    courseCode ||
    upper.includes("ADVENTIST HERITAGE") ||
    upper.includes("AGRICULTURE") ||
    upper.includes("CHAPEL")
  ) {
    return { type: "class", courseCode };
  }

  return { type: "founder", courseCode };
}

export async function GET() {
  const client = getGCalClient();
  if (!client) {
    return NextResponse.json({
      configured: false,
      events: [],
      message:
        "Google Calendar credentials not set yet in apps/web/.env.local",
    });
  }

  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysLater = new Date(
      startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000
    );

    const res = await client.calendar.events.list({
      calendarId: client.calendarId,
      timeMin: startOfToday.toISOString(),
      timeMax: sevenDaysLater.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    const events = (res.data.items || [])
      .filter((item) => item.id && (item.start?.dateTime || item.start?.date))
      .map((item) => {
        const title = item.summary || "Calendar Event";
        const { type, courseCode } = classifyGCalEvent(title);
        return {
          id: `gcal-${item.id}`,
          gcalEventId: item.id!,
          title,
          type,
          courseCode,
          location: item.location || null,
          startIso: item.start?.dateTime || `${item.start?.date}T09:00:00.000Z`,
          endIso: item.end?.dateTime || `${item.end?.date}T10:00:00.000Z`,
          syncStatus: "synced" as const,
        };
      });

    return NextResponse.json({ configured: true, events });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch Google Calendar";
    return NextResponse.json(
      { configured: true, error: message, events: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const client = getGCalClient();
  if (!client) {
    return NextResponse.json({ configured: false, pushed: [] });
  }

  try {
    const { events } = await req.json();
    const pushed: Array<{ localId: string; gcalEventId: string }> = [];

    for (const ev of events || []) {
      const res = await client.calendar.events.insert({
        calendarId: client.calendarId,
        requestBody: {
          summary: ev.courseCode ? `[${ev.courseCode}] ${ev.title}` : ev.title,
          location: ev.location || undefined,
          description: `Created by DysAI Brain Dump (${ev.type.toUpperCase()})`,
          start: { dateTime: ev.startIso },
          end: { dateTime: ev.endIso },
        },
      });
      if (res.data.id) {
        pushed.push({ localId: ev.id, gcalEventId: res.data.id });
      }
    }

    return NextResponse.json({ configured: true, pushed });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to push to Google Calendar";
    return NextResponse.json(
      { configured: true, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const client = getGCalClient();
  if (!client) {
    return NextResponse.json({ configured: false });
  }

  try {
    const { gcalEventIds } = await req.json();
    for (const eventId of gcalEventIds || []) {
      try {
        await client.calendar.events.delete({
          calendarId: client.calendarId,
          eventId,
        });
      } catch {
        // Ignore if already deleted externally
      }
    }
    return NextResponse.json({ configured: true, deleted: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to delete from Google Calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
