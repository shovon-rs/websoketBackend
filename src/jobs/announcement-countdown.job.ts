import { processDueAnnouncements } from '../modules/announcements/announcements.service';
import { logger } from '../utils/logger';

const CHECK_INTERVAL_MS = 15_000;

export function startAnnouncementCountdownJob(): NodeJS.Timeout {
  const run = () => {
    processDueAnnouncements().catch((err) => logger.error({ err }, 'Announcement countdown sweep failed'));
  };

  run();
  return setInterval(run, CHECK_INTERVAL_MS);
}
