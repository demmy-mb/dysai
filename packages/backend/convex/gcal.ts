"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { google } from "googleapis";
import { internal } from "./_generated/api";

/**
 * Helper to create an authenticated Google Calendar v3 client using a Service Account.
 * If credentials are not configured yet, returns null gracefully so local MVP development
 * works even before connecting a Google Cloud project.
 */
function getCalendarClient() {
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
 * Push a newly created Convex event to Google Calendar and store its `gcalEventId`.
 */
export const pushEventToGCal = internalAction({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const ev = await ctx.runQuery(internal.notifications.getEventById, {
      eventId: args.eventId,
    });
    if (!ev) return;

    const client = getCalendarClient();
    if (!client) {
      // Credentials not set yet; leave event in Convex without throwing
      return;
    }

    const res = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        summary: ev.courseCode ? `[${ev.courseCode}] ${ev.title}` : ev.title,
        location: ev.location,
        description: `DysAI ${ev.type.toUpperCase()} block`,
        start: { dateTime: ev.startIso },
        end: { dateTime: ev.endIso },
      },
    });

    if (res.data.id) {
      await ctx.runMutation(internal.notifications.markEventSynced, {
        eventId: args.eventId,
        gcalEventId: res.data.id,
      });
    }
  },
});

/**
 * Delete an event from Google Calendar when the user clicks 1-Click Undo on a Brain Dump.
 */
export const deleteEventFromGCal = internalAction({
  args: {
    gcalEventId: v.string(),
  },
  handler: async (_ctx, args) => {
    const client = getCalendarClient();
    if (!client) return;

    try {
      await client.calendar.events.delete({
        calendarId: client.calendarId,
        eventId: args.gcalEventId,
      });
    } catch (err) {
      console.warn("Google Calendar event already deleted or not found:", err);
    }
  },
});

/**
 * 15-Minute Background Cron Action:
 * Pulls external changes from Google Calendar for the next 14 days back into Convex.
 */
export const pullExternalChanges = internalAction({
  args: {},
  handler: async (ctx) => {
    const client = getCalendarClient();
    if (!client) return;

    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const res = await client.calendar.events.list({
      calendarId: client.calendarId,
      timeMin: now.toISOString(),
      timeMax: twoWeeksLater.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const items = res.data.items || [];
    for (const item of items) {
      if (!item.id || !item.start?.dateTime || !item.end?.dateTime) continue;

      await ctx.runMutation(internal.notifications.upsertExternalGCalEvent, {
        gcalEventId: item.id,
        title: item.summary || "Calendar Event",
        location: item.location ?? undefined,
        startIso: item.start.dateTime,
        endIso: item.end.dateTime,
      });
    }
  },
});
