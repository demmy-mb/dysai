/**
 * Mobile Companion (Expo Notifications) — Interactive Lock-Screen Class Check-In
 *
 * Registers the `ATTENDANCE_CHECK` notification category on iOS & Android with
 * two interactive lock-screen buttons:
 *  1. "Yes, I'm in class" (`ATTENDANCE_YES`)
 *  2. "Missed class" (`ATTENDANCE_NO`)
 *
 * When tapped from the lock screen or notification banner during/after a class,
 * this listener automatically calls Convex (`notifications:respondToAttendanceCheck`)
 * to update the 75% Attendance Guard in real time.
 */

export const ATTENDANCE_CATEGORY_ID = "ATTENDANCE_CHECK";

export interface AttendanceNotificationPayload {
  notificationId?: string;
  eventId?: string;
  courseCode: string;
}

export async function registerAttendanceCheckInCategory(Notifications: {
  setNotificationCategoryAsync: (
    identifier: string,
    actions: Array<{
      identifier: string;
      buttonTitle: string;
      options?: { opensAppToForeground?: boolean; isDestructive?: boolean };
    }>
  ) => Promise<unknown>;
}) {
  await Notifications.setNotificationCategoryAsync(ATTENDANCE_CATEGORY_ID, [
    {
      identifier: "ATTENDANCE_YES",
      buttonTitle: "Yes, I'm in class ✓",
      options: {
        opensAppToForeground: false, // Syncs silently in background!
      },
    },
    {
      identifier: "ATTENDANCE_NO",
      buttonTitle: "No, missed it",
      options: {
        opensAppToForeground: false,
        isDestructive: true,
      },
    },
  ]);
}

export function attachAttendanceResponseListener(
  Notifications: {
    addNotificationResponseReceivedListener: (
      listener: (response: {
        actionIdentifier: string;
        notification: {
          request: {
            content: {
              data: AttendanceNotificationPayload;
            };
          };
        };
      }) => void
    ) => { remove: () => void };
  },
  onRespond: (args: {
    notificationId?: string;
    eventId?: string;
    courseCode: string;
    present: boolean;
  }) => Promise<unknown>
) {
  return Notifications.addNotificationResponseReceivedListener(
    async (response) => {
      const { actionIdentifier, notification } = response;
      const data = notification.request.content.data;
      if (!data?.courseCode) return;

      if (actionIdentifier === "ATTENDANCE_YES") {
        await onRespond({
          notificationId: data.notificationId,
          eventId: data.eventId,
          courseCode: data.courseCode,
          present: true,
        });
      } else if (actionIdentifier === "ATTENDANCE_NO") {
        await onRespond({
          notificationId: data.notificationId,
          eventId: data.eventId,
          courseCode: data.courseCode,
          present: false,
        });
      }
    }
  );
}
