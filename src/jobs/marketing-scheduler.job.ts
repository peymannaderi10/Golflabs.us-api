import { MarketingService } from '../modules/marketing/marketing.service';

export async function processScheduledCampaigns() {
  try {
    const sent = await MarketingService.sendDueScheduledCampaigns();
    if (sent > 0) {
      console.log(`Marketing scheduler: sent ${sent} scheduled campaign(s)`);
    }
  } catch (error) {
    console.error('Marketing scheduler error:', error);
  }
}
