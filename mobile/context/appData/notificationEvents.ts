// Notification event emitter (fallback if native notifications not available)
export type AppNotification = {
  id: string;
  title: string;
  body?: string | null;
  scenarioId?: string | null;
  conversationId?: string | null;
  data?: Record<string, any> | null;
};

type NotificationHandler = (n: AppNotification) => void;
const notificationHandlers = new Set<NotificationHandler>();

export function subscribeToNotifications(handler: NotificationHandler) {
  notificationHandlers.add(handler);
  return () => notificationHandlers.delete(handler);
}

export async function presentNotification(n: AppNotification) {
  try {
    // Try native notifications if available (expo-notifications or similar)
    // Use a dynamic require so we don't crash when dependency isn't installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications");
    if (Notifications && typeof Notifications.scheduleNotificationAsync === "function") {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: n.title,
          body: n.body ?? undefined,
          data: { scenarioId: n.scenarioId, conversationId: n.conversationId, ...n.data },
        },
        trigger: null,
      });
      return;
    }
  } catch {
    // ignore - fallback to in-app handlers
  }

  // Fallback: notify any in-app listeners
  for (const h of notificationHandlers) {
    try {
      h(n);
    } catch {}
  }
}
