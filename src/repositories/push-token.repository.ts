import { prisma } from '../config/database';

export type PushPlatform = 'fcm' | 'apns' | 'web';

export async function getByUser(userId: string) {
  return prisma.pushToken.findMany({ where: { userId } });
}

export async function upsertToken(params: {
  userId: string;
  platform: PushPlatform;
  token: string;
  subscription?: unknown;
}) {
  return prisma.pushToken.upsert({
    where: { token: params.token },
    update: { userId: params.userId, platform: params.platform, subscription: params.subscription as any },
    create: {
      userId: params.userId,
      platform: params.platform,
      token: params.token,
      subscription: params.subscription as any,
    },
  });
}

export async function deleteToken(userId: string, token: string) {
  return prisma.pushToken.deleteMany({ where: { userId, token } });
}
