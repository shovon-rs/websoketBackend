import admin from 'firebase-admin';
import webpush from 'web-push';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let fcmApp: admin.app.App | undefined;

function getFcmApp(): admin.app.App | undefined {
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) return undefined;

  if (!fcmApp) {
    fcmApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FCM_PROJECT_ID,
        clientEmail: env.FCM_CLIENT_EMAIL,
        privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }

  return fcmApp;
}

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(env.VAPID_EMAIL, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendFcm(token: string, payload: PushPayload): Promise<void> {
  const app = getFcmApp();
  if (!app) {
    logger.debug('FCM not configured — skipping push send');
    return;
  }

  await admin.messaging(app).send({
    token,
    notification: { title: payload.title, body: payload.body },
    data: payload.data as Record<string, string> | undefined,
  });
}

export async function sendWebPush(subscription: unknown, payload: PushPayload): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    logger.debug('Web Push not configured — skipping push send');
    return;
  }
  if (!subscription) return;

  await webpush.sendNotification(subscription as webpush.PushSubscription, JSON.stringify(payload));
}
