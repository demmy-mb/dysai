import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

/**
 * POST /api/attendance
 * Syncs a class check-in ("Yes, I'm in class", "Missed", or "Class Cancelled")
 * directly to Convex DB (`notifications:respondToAttendanceCheck`).
 */
export async function POST(req: NextRequest) {
  try {
    const { courseCode, present, cancelled, eventId, notificationId } =
      await req.json();
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

    if (convexUrl) {
      try {
        const convex = new ConvexHttpClient(convexUrl);
        await convex.mutation(anyApi.notifications.respondToAttendanceCheck, {
          courseCode,
          present: Boolean(present),
          cancelled: Boolean(cancelled),
          eventId: eventId?.startsWith("gcal-") ? undefined : eventId,
          notificationId,
        });
        return NextResponse.json({
          synced: true,
          courseCode,
          present,
          cancelled: Boolean(cancelled),
        });
      } catch {
        // Fallback if Convex schema isn't pushed yet
      }
    }

    return NextResponse.json({
      synced: false,
      courseCode,
      present,
      cancelled: Boolean(cancelled),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to sync attendance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
