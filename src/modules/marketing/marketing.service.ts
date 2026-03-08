import crypto from 'crypto';
import Handlebars from 'handlebars';
import { supabase } from '../../config/database';
import { resend, resendConfig } from '../../config/resend';
import { DEFAULT_TEMPLATES } from '../email/email-template.defaults';
import { logger } from '../../shared/utils/logger';

export type AudienceType =
  | 'all_customers' | 'active_members' | 'inactive_30d'
  | 'all_users' | 'no_bookings' | 'non_members' | 'high_spenders';
export type CampaignAction = 'draft' | 'schedule' | 'send';

interface Recipient {
  id: string;
  email: string;
  fullName: string;
}

export interface Campaign {
  id: string;
  location_id: string;
  created_by: string;
  subject: string;
  text_body: string | null;
  audience_type: AudienceType;
  status: string;
  scheduled_for: string | null;
  template_id: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  click_count: number;
  unsubscribe_count: number;
  created_at: string;
  sent_at: string | null;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  user_id: string;
  email: string;
  resend_message_id: string | null;
  status: string;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

export interface CampaignDetail extends Campaign {
  recipients: CampaignRecipient[];
}

const BATCH_SIZE = 100;
const UNSUBSCRIBE_SECRET = process.env.RESEND_WEBHOOK_SECRET || 'marketing-unsubscribe-fallback-secret';

export class MarketingService {

  // ------------------------------------------------------------------
  // Marketing template CRUD
  // ------------------------------------------------------------------

  static async getMarketingTemplates(locationId: string) {
    const { data, error } = await supabase
      .from('email_templates')
      .select('id, name, html_template, variables, created_at, updated_at')
      .eq('location_id', locationId)
      .eq('template_type', 'marketing_campaign')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch templates: ${error.message}`);
    return data || [];
  }

  static async getMarketingTemplate(templateId: string) {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .eq('template_type', 'marketing_campaign')
      .single();

    if (error || !data) throw new Error('Template not found');
    return data;
  }

  static async createMarketingTemplate(locationId: string, name: string, htmlTemplate: string) {
    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        location_id: locationId,
        template_type: 'marketing_campaign',
        name,
        subject_template: '{{subject}}',
        html_template: htmlTemplate,
        text_template: null,
        variables: ['subject', 'body', 'locationName', 'unsubscribeLink'],
        is_active: true,
        version: 1,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(`Failed to create template: ${error?.message}`);
    return data;
  }

  static async updateMarketingTemplate(templateId: string, name: string, htmlTemplate: string) {
    const { data, error } = await supabase
      .from('email_templates')
      .update({ name, html_template: htmlTemplate, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .eq('template_type', 'marketing_campaign')
      .select('*')
      .single();

    if (error || !data) throw new Error(`Failed to update template: ${error?.message}`);
    return data;
  }

  static async deleteMarketingTemplate(templateId: string) {
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', templateId)
      .eq('template_type', 'marketing_campaign');

    if (error) throw new Error(`Failed to delete template: ${error.message}`);
  }

  // ------------------------------------------------------------------
  // Audience resolution (unchanged from V1)
  // ------------------------------------------------------------------

  static async getAudienceRecipients(
    locationId: string,
    audienceType: AudienceType
  ): Promise<{ count: number; recipients: Recipient[] }> {
    let userIds: string[] = [];

    switch (audienceType) {
      case 'all_customers':
        userIds = await this.getCustomerUserIds(locationId);
        break;
      case 'active_members':
        userIds = await this.getActiveMemberUserIds(locationId);
        break;
      case 'inactive_30d':
        userIds = await this.getInactiveUserIds(locationId);
        break;
      case 'all_users':
        userIds = await this.getAllUserIds(locationId);
        break;
      case 'no_bookings':
        userIds = await this.getNoBookingUserIds(locationId);
        break;
      case 'non_members':
        userIds = await this.getNonMemberUserIds(locationId);
        break;
      case 'high_spenders':
        userIds = await this.getHighSpenderUserIds(locationId);
        break;
    }

    if (userIds.length === 0) {
      return { count: 0, recipients: [] };
    }

    const optedOutIds = await this.getOptedOutUserIds(userIds);
    const optedInIds = await this.getOptedInUserIds(userIds);
    const filteredIds = userIds.filter(id => !optedOutIds.has(id) && optedInIds.has(id));

    if (filteredIds.length === 0) {
      return { count: 0, recipients: [] };
    }

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .in('id', filteredIds);

    const recipients: Recipient[] = (profiles || []).map(p => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name || 'Valued Customer',
    }));

    return { count: recipients.length, recipients };
  }

  static async getAudiencePreview(
    locationId: string,
    audienceType: AudienceType
  ): Promise<number> {
    const { count } = await this.getAudienceRecipients(locationId, audienceType);
    return count;
  }

  private static async getCustomerUserIds(locationId: string): Promise<string[]> {
    const { data } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('location_id', locationId)
      .eq('status', 'confirmed')
      .not('user_id', 'is', null);

    const unique = new Set((data || []).map(b => b.user_id as string));
    return Array.from(unique);
  }

  private static async getActiveMemberUserIds(locationId: string): Promise<string[]> {
    const { data } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('location_id', locationId)
      .eq('status', 'active');

    return (data || []).map(m => m.user_id);
  }

  private static async getInactiveUserIds(locationId: string): Promise<string[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allCustomerIds = await this.getCustomerUserIds(locationId);
    if (allCustomerIds.length === 0) return [];

    const { data: recentBookings } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('location_id', locationId)
      .eq('status', 'confirmed')
      .gte('start_time', thirtyDaysAgo.toISOString())
      .not('user_id', 'is', null);

    const recentIds = new Set((recentBookings || []).map(b => b.user_id as string));
    return allCustomerIds.filter(id => !recentIds.has(id));
  }

  private static async getOptedOutUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const { data } = await supabase
      .from('marketing_preferences')
      .select('user_id')
      .in('user_id', userIds)
      .eq('email_opted_out', true);

    return new Set((data || []).map(p => p.user_id));
  }

  private static async getOptedInUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const { data } = await supabase
      .from('marketing_preferences')
      .select('user_id')
      .in('user_id', userIds)
      .eq('email_opted_in', true);

    return new Set((data || []).map(p => p.user_id));
  }

  private static async getAllUserIds(locationId: string): Promise<string[]> {
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('location_id', locationId)
      .eq('role', 'customer');

    return (data || []).map(u => u.id);
  }

  private static async getNoBookingUserIds(locationId: string): Promise<string[]> {
    const [allIds, customerIds] = await Promise.all([
      this.getAllUserIds(locationId),
      this.getCustomerUserIds(locationId),
    ]);

    const customerSet = new Set(customerIds);
    return allIds.filter(id => !customerSet.has(id));
  }

  private static async getNonMemberUserIds(locationId: string): Promise<string[]> {
    const [allIds, memberIds] = await Promise.all([
      this.getAllUserIds(locationId),
      this.getActiveMemberUserIds(locationId),
    ]);

    const memberSet = new Set(memberIds);
    return allIds.filter(id => !memberSet.has(id));
  }

  private static async getHighSpenderUserIds(locationId: string): Promise<string[]> {
    const { data } = await supabase
      .from('bookings')
      .select('user_id, total_amount')
      .eq('location_id', locationId)
      .eq('status', 'confirmed')
      .not('user_id', 'is', null);

    if (!data || data.length === 0) return [];

    const spendByUser = new Map<string, number>();
    for (const row of data) {
      const uid = row.user_id as string;
      spendByUser.set(uid, (spendByUser.get(uid) || 0) + Number(row.total_amount || 0));
    }

    const sorted = Array.from(spendByUser.entries()).sort((a, b) => b[1] - a[1]);
    const topCount = Math.ceil(sorted.length * 0.25);
    return sorted.slice(0, topCount).map(([uid]) => uid);
  }

  // ------------------------------------------------------------------
  // Campaign CRUD
  // ------------------------------------------------------------------

  static async getCampaigns(locationId: string): Promise<Campaign[]> {
    const { data, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'Error fetching campaigns');
      return [];
    }
    return (data || []) as Campaign[];
  }

  static async getCampaignDetail(campaignId: string): Promise<CampaignDetail | null> {
    const { data: campaign, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) {
      logger.error({ err: error }, 'Error fetching campaign detail');
      return null;
    }

    const { data: recipients } = await supabase
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    return {
      ...(campaign as Campaign),
      recipients: (recipients || []) as CampaignRecipient[],
    };
  }

  // ------------------------------------------------------------------
  // Campaign create (draft / schedule / send)
  // ------------------------------------------------------------------

  static async createCampaign(
    locationId: string,
    employeeId: string,
    subject: string,
    body: string,
    audienceType: AudienceType,
    action: CampaignAction,
    scheduledFor?: string,
    templateId?: string
  ): Promise<Campaign> {
    if (action === 'draft') {
      return this.createDraft(locationId, employeeId, subject, body, audienceType, templateId);
    }

    const { recipients } = await this.getAudienceRecipients(locationId, audienceType);
    if (recipients.length === 0) {
      throw new Error('No recipients found for the selected audience');
    }

    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single();

    const locationName = location?.name || 'Golf Labs US';
    const apiUrl = process.env.API_URL || 'http://localhost:4242';
    const htmlBody = await this.renderMarketingHtml(subject, body, locationName, templateId);

    const status = action === 'schedule' ? 'scheduled' : 'sending';

    const { data: campaign, error: insertError } = await supabase
      .from('marketing_campaigns')
      .insert({
        location_id: locationId,
        created_by: employeeId,
        subject,
        text_body: body,
        html_body: htmlBody,
        audience_type: audienceType,
        status,
        scheduled_for: action === 'schedule' ? scheduledFor : null,
        template_id: templateId || null,
        total_recipients: recipients.length,
      })
      .select('*')
      .single();

    if (insertError || !campaign) {
      throw new Error(`Failed to create campaign: ${insertError?.message}`);
    }

    await this.insertRecipientRows(campaign.id, recipients);

    if (action === 'send') {
      return this.executeSend(campaign as Campaign, recipients, htmlBody, subject, apiUrl);
    }

    return campaign as Campaign;
  }

  private static async createDraft(
    locationId: string,
    employeeId: string,
    subject: string,
    body: string,
    audienceType: AudienceType,
    templateId?: string
  ): Promise<Campaign> {
    const { data, error } = await supabase
      .from('marketing_campaigns')
      .insert({
        location_id: locationId,
        created_by: employeeId,
        subject,
        text_body: body,
        html_body: '',
        audience_type: audienceType,
        status: 'draft',
        template_id: templateId || null,
        total_recipients: 0,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create draft: ${error?.message}`);
    }
    return data as Campaign;
  }

  static async updateDraft(
    campaignId: string,
    subject: string,
    body: string,
    audienceType: AudienceType,
    templateId?: string,
    scheduledFor?: string
  ): Promise<Campaign> {
    const { data: existing } = await supabase
      .from('marketing_campaigns')
      .select('status')
      .eq('id', campaignId)
      .single();

    if (!existing || existing.status !== 'draft') {
      throw new Error('Only draft campaigns can be edited');
    }

    const updatePayload: Record<string, any> = {
      subject,
      text_body: body,
      audience_type: audienceType,
    };
    if (templateId !== undefined) {
      updatePayload.template_id = templateId || null;
    }
    if (scheduledFor) {
      updatePayload.status = 'scheduled';
      updatePayload.scheduled_for = scheduledFor;
    }

    const { data, error } = await supabase
      .from('marketing_campaigns')
      .update(updatePayload)
      .eq('id', campaignId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update draft: ${error?.message}`);
    }
    return data as Campaign;
  }

  static async deleteCampaign(campaignId: string): Promise<void> {
    const { data: existing } = await supabase
      .from('marketing_campaigns')
      .select('status')
      .eq('id', campaignId)
      .single();

    if (!existing || (existing.status !== 'draft' && existing.status !== 'scheduled')) {
      throw new Error('Only draft or scheduled campaigns can be deleted');
    }

    const { error } = await supabase
      .from('marketing_campaigns')
      .delete()
      .eq('id', campaignId);

    if (error) {
      throw new Error(`Failed to delete campaign: ${error.message}`);
    }
  }

  // ------------------------------------------------------------------
  // Send a draft or scheduled campaign
  // ------------------------------------------------------------------

  static async sendCampaign(campaignId: string): Promise<Campaign> {
    const { data: campaign, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new Error(`Cannot send a campaign with status "${campaign.status}"`);
    }

    const locationId = campaign.location_id;
    const { recipients } = await this.getAudienceRecipients(locationId, campaign.audience_type as AudienceType);

    if (recipients.length === 0) {
      throw new Error('No recipients found for the selected audience');
    }

    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single();

    const locationName = location?.name || 'Golf Labs US';
    const apiUrl = process.env.API_URL || 'http://localhost:4242';
    const htmlBody = await this.renderMarketingHtml(
      campaign.subject,
      campaign.text_body || '',
      locationName,
      campaign.template_id
    );

    await supabase
      .from('marketing_campaigns')
      .update({ status: 'sending', html_body: htmlBody, total_recipients: recipients.length })
      .eq('id', campaignId);

    await supabase.from('campaign_recipients').delete().eq('campaign_id', campaignId);
    await this.insertRecipientRows(campaignId, recipients);

    const updatedCampaign = { ...campaign, status: 'sending', html_body: htmlBody, total_recipients: recipients.length } as Campaign;
    return this.executeSend(updatedCampaign, recipients, htmlBody, campaign.subject, apiUrl);
  }

  // ------------------------------------------------------------------
  // Core send logic with per-recipient message ID tracking
  // ------------------------------------------------------------------

  private static async executeSend(
    campaign: Campaign,
    recipients: Recipient[],
    htmlBody: string,
    subject: string,
    apiUrl: string
  ): Promise<Campaign> {
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const emails = batch.map(r => {
        const unsubLink = this.generateUnsubscribeLink(r.id, apiUrl);
        const personalizedHtml = htmlBody.replace(/\{\{unsubscribeLink\}\}/g, unsubLink);

        return {
          from: resendConfig.fromEmail,
          to: [r.email],
          subject,
          html: personalizedHtml,
        };
      });

      try {
        const result = await resend.batch.send(emails);

        if (result.error) {
          logger.error({ err: result.error }, 'Resend batch error');
          failedCount += batch.length;
          await this.updateRecipientStatuses(campaign.id, batch, 'failed');
        } else {
          sentCount += batch.length;
          logger.info({ resultData: result.data }, 'Resend batch send result');
          const rawData = result.data as any;
          const messageIds: Array<{ id: string }> = Array.isArray(rawData)
            ? rawData
            : Array.isArray(rawData?.data)
              ? rawData.data
              : [];
          logger.info({ messageIdCount: messageIds.length, recipientCount: batch.length }, 'Batch send returned message IDs');
          await this.storeMessageIds(campaign.id, batch, messageIds);
        }
      } catch (err) {
        logger.error({ err }, 'Resend batch exception');
        failedCount += batch.length;
        await this.updateRecipientStatuses(campaign.id, batch, 'failed');
      }

      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const finalStatus = failedCount === recipients.length ? 'failed' : 'sent';

    const { data: updated } = await supabase
      .from('marketing_campaigns')
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        status: finalStatus,
        sent_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .select('*')
      .single();

    logger.info({ campaignId: campaign.id, sentCount, failedCount }, 'Campaign send complete');
    return (updated || campaign) as Campaign;
  }

  private static async insertRecipientRows(campaignId: string, recipients: Recipient[]): Promise<void> {
    const rows = recipients.map(r => ({
      campaign_id: campaignId,
      user_id: r.id,
      email: r.email,
      status: 'pending',
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('campaign_recipients').insert(batch);
      if (error) {
        logger.error({ err: error }, 'Error inserting recipient rows');
      }
    }
  }

  private static async storeMessageIds(
    campaignId: string,
    batch: Recipient[],
    messageIds: Array<{ id: string }>
  ): Promise<void> {
    for (let j = 0; j < batch.length; j++) {
      const msgId = messageIds[j]?.id;
      if (!msgId) continue;

      await supabase
        .from('campaign_recipients')
        .update({ resend_message_id: msgId, status: 'sent' })
        .eq('campaign_id', campaignId)
        .eq('user_id', batch[j].id);
    }
  }

  private static async updateRecipientStatuses(
    campaignId: string,
    batch: Recipient[],
    status: string
  ): Promise<void> {
    const userIds = batch.map(r => r.id);
    await supabase
      .from('campaign_recipients')
      .update({ status })
      .eq('campaign_id', campaignId)
      .in('user_id', userIds);
  }

  // ------------------------------------------------------------------
  // Webhook tracking (opened / clicked / delivered / bounced)
  // ------------------------------------------------------------------

  static async processTrackingWebhook(
    messageId: string,
    eventType: string
  ): Promise<void> {
    const { data: recipient } = await supabase
      .from('campaign_recipients')
      .select('id, campaign_id, opened_at, clicked_at')
      .eq('resend_message_id', messageId)
      .maybeSingle();

    if (!recipient) return;

    const now = new Date().toISOString();

    switch (eventType) {
      case 'email.delivered':
        await supabase
          .from('campaign_recipients')
          .update({ status: 'delivered' })
          .eq('id', recipient.id);
        break;

      case 'email.bounced':
        await supabase
          .from('campaign_recipients')
          .update({ status: 'bounced' })
          .eq('id', recipient.id);
        break;

      case 'email.opened':
        if (!recipient.opened_at) {
          await supabase
            .from('campaign_recipients')
            .update({ opened_at: now })
            .eq('id', recipient.id);

          await supabase.rpc('increment_campaign_counter', {
            p_campaign_id: recipient.campaign_id,
            p_column: 'open_count',
          }).then(({ error }) => {
            if (error) {
              // Fallback: manual increment if RPC doesn't exist
              supabase
                .from('marketing_campaigns')
                .select('open_count')
                .eq('id', recipient.campaign_id)
                .single()
                .then(({ data }) => {
                  if (data) {
                    supabase
                      .from('marketing_campaigns')
                      .update({ open_count: (data.open_count || 0) + 1 })
                      .eq('id', recipient.campaign_id)
                      .then(() => {});
                  }
                });
            }
          });
        }
        break;

      case 'email.clicked':
        if (!recipient.clicked_at) {
          await supabase
            .from('campaign_recipients')
            .update({ clicked_at: now })
            .eq('id', recipient.id);

          await supabase.rpc('increment_campaign_counter', {
            p_campaign_id: recipient.campaign_id,
            p_column: 'click_count',
          }).then(({ error }) => {
            if (error) {
              supabase
                .from('marketing_campaigns')
                .select('click_count')
                .eq('id', recipient.campaign_id)
                .single()
                .then(({ data }) => {
                  if (data) {
                    supabase
                      .from('marketing_campaigns')
                      .update({ click_count: (data.click_count || 0) + 1 })
                      .eq('id', recipient.campaign_id)
                      .then(() => {});
                  }
                });
            }
          });
        }
        break;
    }
  }

  // ------------------------------------------------------------------
  // Scheduler: find and send due campaigns
  // ------------------------------------------------------------------

  static async sendDueScheduledCampaigns(): Promise<number> {
    const now = new Date().toISOString();

    // Atomically claim due campaigns by flipping status to 'sending'
    const { data: claimed } = await supabase
      .from('marketing_campaigns')
      .update({ status: 'sending' })
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .select('id');

    if (!claimed || claimed.length === 0) return 0;

    let sent = 0;
    for (const c of claimed) {
      try {
        // sendCampaign checks for draft/scheduled status, but we already
        // moved to 'sending'. Call the internal send flow directly.
        const { data: campaign } = await supabase
          .from('marketing_campaigns')
          .select('*')
          .eq('id', c.id)
          .single();

        if (!campaign) continue;

        const { recipients } = await this.getAudienceRecipients(
          campaign.location_id,
          campaign.audience_type as AudienceType
        );

        if (recipients.length === 0) {
          await supabase
            .from('marketing_campaigns')
            .update({ status: 'failed' })
            .eq('id', c.id);
          continue;
        }

        const { data: location } = await supabase
          .from('locations')
          .select('name')
          .eq('id', campaign.location_id)
          .single();

        const locationName = location?.name || 'Golf Labs US';
        const apiUrl = process.env.API_URL || 'http://localhost:4242';
        const htmlBody = await this.renderMarketingHtml(
          campaign.subject,
          campaign.text_body || '',
          locationName,
          campaign.template_id
        );

        await supabase
          .from('marketing_campaigns')
          .update({ html_body: htmlBody, total_recipients: recipients.length })
          .eq('id', c.id);

        await supabase.from('campaign_recipients').delete().eq('campaign_id', c.id);
        await this.insertRecipientRows(c.id, recipients);

        const updatedCampaign = { ...campaign, status: 'sending', html_body: htmlBody, total_recipients: recipients.length } as Campaign;
        await this.executeSend(updatedCampaign, recipients, htmlBody, campaign.subject, apiUrl);
        sent++;
      } catch (err) {
        logger.error({ err, campaignId: c.id }, 'Failed to send scheduled campaign');
        await supabase
          .from('marketing_campaigns')
          .update({ status: 'failed' })
          .eq('id', c.id);
      }
    }
    return sent;
  }

  // ------------------------------------------------------------------
  // Unsubscribe (unchanged from V1)
  // ------------------------------------------------------------------

  static generateUnsubscribeSignature(userId: string): string {
    return crypto
      .createHmac('sha256', UNSUBSCRIBE_SECRET)
      .update(userId)
      .digest('hex');
  }

  static generateUnsubscribeLink(userId: string, apiUrl: string): string {
    const sig = this.generateUnsubscribeSignature(userId);
    return `${apiUrl}/marketing/unsubscribe?uid=${userId}&sig=${sig}`;
  }

  static verifyUnsubscribeSignature(userId: string, signature: string): boolean {
    const expected = this.generateUnsubscribeSignature(userId);
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  static async unsubscribe(userId: string): Promise<void> {
    const { error } = await supabase
      .from('marketing_preferences')
      .upsert(
        {
          user_id: userId,
          email_opted_out: true,
          email_opted_out_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      logger.error({ err: error }, 'Error unsubscribing user');
      throw new Error('Failed to process unsubscribe');
    }

    logger.info({ userId }, 'User unsubscribed from marketing emails');
  }

  // ------------------------------------------------------------------
  // HTML builder with template support
  // ------------------------------------------------------------------

  private static async renderMarketingHtml(
    subject: string,
    body: string,
    locationName: string,
    templateId?: string | null
  ): Promise<string> {
    const bodyHtml = body
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => `<p class="text-tertiary" style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">${this.escapeHtml(line)}</p>`)
      .join('\n');

    let htmlTemplateSource: string;

    if (templateId) {
      try {
        const template = await this.getMarketingTemplate(templateId);
        htmlTemplateSource = template.html_template;
      } catch {
        htmlTemplateSource = DEFAULT_TEMPLATES.marketing_campaign.html;
      }
    } else {
      htmlTemplateSource = DEFAULT_TEMPLATES.marketing_campaign.html;
    }

    const compiled = Handlebars.compile(htmlTemplateSource);
    return compiled({
      subject: this.escapeHtml(subject),
      body: new Handlebars.SafeString(bodyHtml),
      textBody: body,
      locationName: this.escapeHtml(locationName),
      unsubscribeLink: '{{unsubscribeLink}}',
    });
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
