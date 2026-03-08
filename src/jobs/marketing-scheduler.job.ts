import { MarketingService } from '../modules/marketing/marketing.service';
import { logger } from '../shared/utils/logger';

export async function processScheduledCampaigns() {
  try {
    const sent = await MarketingService.sendDueScheduledCampaigns();
    if (sent > 0) {
      logger.info({ count: sent }, 'Sent scheduled campaigns');
    }
  } catch (error) {
    logger.error({ err: error }, 'Marketing scheduler error');
  }
}
