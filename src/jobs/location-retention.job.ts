import { purgeOldLocationData } from '../modules/tracking/tracking.service';
import { logger } from '../utils/logger';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function startLocationRetentionJob(): NodeJS.Timeout {
  const run = () => {
    purgeOldLocationData().catch((err) => logger.error({ err }, 'Location retention sweep failed'));
  };

  run();
  return setInterval(run, TWENTY_FOUR_HOURS_MS);
}
