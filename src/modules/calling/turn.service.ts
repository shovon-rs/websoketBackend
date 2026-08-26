import { env } from '../../config/env';

export interface RtcIceServer {
  urls: string;
  username?: string;
  credential?: string;
}

export function getIceServers(): RtcIceServer[] {
  const servers: RtcIceServer[] = [{ urls: env.STUN_URL }];

  if (env.TURN_URL && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({ urls: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }

  return servers;
}
