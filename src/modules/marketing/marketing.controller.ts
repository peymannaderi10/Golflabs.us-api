import { Request, Response } from 'express';
import { MarketingService, AudienceType, CampaignAction } from './marketing.service';
import { AuthenticatedRequest } from '../auth/auth.middleware';

const VALID_AUDIENCE_TYPES: AudienceType[] = [
  'all_customers', 'active_members', 'inactive_30d',
  'all_users', 'no_bookings', 'non_members', 'high_spenders',
];
const VALID_ACTIONS: CampaignAction[] = ['draft', 'schedule', 'send'];

export class MarketingController {

  async getCampaigns(req: AuthenticatedRequest, res: Response) {
    try {
      const { locationId } = req.query;

      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }

      const campaigns = await MarketingService.getCampaigns(locationId as string);
      return res.json(campaigns);
    } catch (error: any) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  async getCampaignDetail(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const detail = await MarketingService.getCampaignDetail(id);

      if (!detail) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      return res.json(detail);
    } catch (error: any) {
      console.error('Error fetching campaign detail:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  async createCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { locationId, subject, body, audienceType, action = 'draft', scheduledFor, templateId } = req.body;

      if (!locationId || !subject || !body || !audienceType) {
        return res.status(400).json({ error: 'locationId, subject, body, and audienceType are required' });
      }

      if (!VALID_AUDIENCE_TYPES.includes(audienceType)) {
        return res.status(400).json({ error: `Invalid audienceType. Must be one of: ${VALID_AUDIENCE_TYPES.join(', ')}` });
      }

      if (!VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` });
      }

      if (action === 'schedule' && !scheduledFor) {
        return res.status(400).json({ error: 'scheduledFor is required when action is "schedule"' });
      }

      const employeeId = req.user?.id;
      if (!employeeId) {
        return res.status(401).json({ error: 'Employee not authenticated' });
      }

      const campaign = await MarketingService.createCampaign(
        locationId,
        employeeId,
        subject,
        body,
        audienceType,
        action,
        scheduledFor,
        templateId
      );

      return res.json(campaign);
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      return res.status(500).json({ error: error.message || 'Failed to create campaign' });
    }
  }

  async updateCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { subject, body, audienceType, templateId, scheduledFor } = req.body;

      if (!subject || !body || !audienceType) {
        return res.status(400).json({ error: 'subject, body, and audienceType are required' });
      }

      if (!VALID_AUDIENCE_TYPES.includes(audienceType)) {
        return res.status(400).json({ error: `Invalid audienceType. Must be one of: ${VALID_AUDIENCE_TYPES.join(', ')}` });
      }

      const campaign = await MarketingService.updateDraft(id, subject, body, audienceType, templateId, scheduledFor);
      return res.json(campaign);
    } catch (error: any) {
      console.error('Error updating campaign:', error);
      const status = error.message?.includes('Only draft') ? 400 : 500;
      return res.status(status).json({ error: error.message || 'Failed to update campaign' });
    }
  }

  async sendCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const campaign = await MarketingService.sendCampaign(id);
      return res.json(campaign);
    } catch (error: any) {
      console.error('Error sending campaign:', error);
      const status = error.message?.includes('Cannot send') ? 400 : 500;
      return res.status(status).json({ error: error.message || 'Failed to send campaign' });
    }
  }

  async deleteCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      await MarketingService.deleteCampaign(id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting campaign:', error);
      const status = error.message?.includes('Only draft') ? 400 : 500;
      return res.status(status).json({ error: error.message || 'Failed to delete campaign' });
    }
  }

  async getAudiencePreview(req: AuthenticatedRequest, res: Response) {
    try {
      const { locationId, audienceType, includeList } = req.query;

      if (!locationId || !audienceType) {
        return res.status(400).json({ error: 'locationId and audienceType are required' });
      }

      if (!VALID_AUDIENCE_TYPES.includes(audienceType as AudienceType)) {
        return res.status(400).json({ error: `Invalid audienceType. Must be one of: ${VALID_AUDIENCE_TYPES.join(', ')}` });
      }

      if (includeList === 'true') {
        const { count, recipients } = await MarketingService.getAudienceRecipients(
          locationId as string,
          audienceType as AudienceType
        );
        return res.json({ count, recipients });
      }

      const count = await MarketingService.getAudiencePreview(
        locationId as string,
        audienceType as AudienceType
      );

      return res.json({ count });
    } catch (error: any) {
      console.error('Error getting audience preview:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  // ------------------------------------------------------------------
  // Marketing template CRUD endpoints
  // ------------------------------------------------------------------

  async getTemplates(req: AuthenticatedRequest, res: Response) {
    try {
      const { locationId } = req.query;
      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }
      const templates = await MarketingService.getMarketingTemplates(locationId as string);
      return res.json(templates);
    } catch (error: any) {
      console.error('Error fetching templates:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  async getTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const template = await MarketingService.getMarketingTemplate(id);
      return res.json(template);
    } catch (error: any) {
      console.error('Error fetching template:', error);
      const status = error.message?.includes('not found') ? 404 : 500;
      return res.status(status).json({ error: error.message || 'Internal server error' });
    }
  }

  async createTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const { locationId, name, htmlTemplate } = req.body;
      if (!locationId || !name || !htmlTemplate) {
        return res.status(400).json({ error: 'locationId, name, and htmlTemplate are required' });
      }
      const template = await MarketingService.createMarketingTemplate(locationId, name, htmlTemplate);
      return res.json(template);
    } catch (error: any) {
      console.error('Error creating template:', error);
      return res.status(500).json({ error: error.message || 'Failed to create template' });
    }
  }

  async updateTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, htmlTemplate } = req.body;
      if (!name || !htmlTemplate) {
        return res.status(400).json({ error: 'name and htmlTemplate are required' });
      }
      const template = await MarketingService.updateMarketingTemplate(id, name, htmlTemplate);
      return res.json(template);
    } catch (error: any) {
      console.error('Error updating template:', error);
      return res.status(500).json({ error: error.message || 'Failed to update template' });
    }
  }

  async deleteTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      await MarketingService.deleteMarketingTemplate(id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting template:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete template' });
    }
  }

  async unsubscribe(req: Request, res: Response) {
    const { uid, sig } = req.query;

    if (!uid || !sig) {
      return res.status(400).send(this.renderUnsubscribePage(
        'Invalid Link',
        'This unsubscribe link is invalid or incomplete.'
      ));
    }

    try {
      const valid = MarketingService.verifyUnsubscribeSignature(uid as string, sig as string);
      if (!valid) {
        return res.status(400).send(this.renderUnsubscribePage(
          'Invalid Link',
          'This unsubscribe link is invalid or has expired.'
        ));
      }

      await MarketingService.unsubscribe(uid as string);

      return res.send(this.renderUnsubscribePage(
        'Unsubscribed',
        'You have been successfully unsubscribed from marketing emails. You will still receive transactional emails (booking confirmations, reminders, etc.).'
      ));
    } catch (error: any) {
      console.error('Unsubscribe error:', error);
      return res.status(500).send(this.renderUnsubscribePage(
        'Error',
        'Something went wrong. Please try again later.'
      ));
    }
  }

  private renderUnsubscribePage(title: string, message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Golf Labs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f7fa; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .icon { width: 64px; height: 64px; background: #e8f5e8; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 28px; }
    h1 { color: #2c5530; font-size: 24px; margin-bottom: 12px; }
    p { color: #666; font-size: 16px; line-height: 1.6; }
    .brand { margin-top: 32px; color: #999; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${title === 'Unsubscribed' ? '&#10003;' : '&#9888;'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="brand">Golf Labs US</p>
  </div>
</body>
</html>`;
  }
}

export const marketingController = new MarketingController();
