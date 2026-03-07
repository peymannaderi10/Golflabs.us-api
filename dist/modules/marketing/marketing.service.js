"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketingService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const handlebars_1 = __importDefault(require("handlebars"));
const database_1 = require("../../config/database");
const resend_1 = require("../../config/resend");
const email_template_defaults_1 = require("../email/email-template.defaults");
const BATCH_SIZE = 100;
const UNSUBSCRIBE_SECRET = process.env.RESEND_WEBHOOK_SECRET || 'marketing-unsubscribe-fallback-secret';
class MarketingService {
    // ------------------------------------------------------------------
    // Marketing template CRUD
    // ------------------------------------------------------------------
    static getMarketingTemplates(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('email_templates')
                .select('id, name, html_template, variables, created_at, updated_at')
                .eq('location_id', locationId)
                .eq('template_type', 'marketing_campaign')
                .eq('is_active', true)
                .order('created_at', { ascending: false });
            if (error)
                throw new Error(`Failed to fetch templates: ${error.message}`);
            return data || [];
        });
    }
    static getMarketingTemplate(templateId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('email_templates')
                .select('*')
                .eq('id', templateId)
                .eq('template_type', 'marketing_campaign')
                .single();
            if (error || !data)
                throw new Error('Template not found');
            return data;
        });
    }
    static createMarketingTemplate(locationId, name, htmlTemplate) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
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
            if (error || !data)
                throw new Error(`Failed to create template: ${error === null || error === void 0 ? void 0 : error.message}`);
            return data;
        });
    }
    static updateMarketingTemplate(templateId, name, htmlTemplate) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('email_templates')
                .update({ name, html_template: htmlTemplate, updated_at: new Date().toISOString() })
                .eq('id', templateId)
                .eq('template_type', 'marketing_campaign')
                .select('*')
                .single();
            if (error || !data)
                throw new Error(`Failed to update template: ${error === null || error === void 0 ? void 0 : error.message}`);
            return data;
        });
    }
    static deleteMarketingTemplate(templateId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('email_templates')
                .delete()
                .eq('id', templateId)
                .eq('template_type', 'marketing_campaign');
            if (error)
                throw new Error(`Failed to delete template: ${error.message}`);
        });
    }
    // ------------------------------------------------------------------
    // Audience resolution (unchanged from V1)
    // ------------------------------------------------------------------
    static getAudienceRecipients(locationId, audienceType) {
        return __awaiter(this, void 0, void 0, function* () {
            let userIds = [];
            switch (audienceType) {
                case 'all_customers':
                    userIds = yield this.getCustomerUserIds(locationId);
                    break;
                case 'active_members':
                    userIds = yield this.getActiveMemberUserIds(locationId);
                    break;
                case 'inactive_30d':
                    userIds = yield this.getInactiveUserIds(locationId);
                    break;
                case 'all_users':
                    userIds = yield this.getAllUserIds(locationId);
                    break;
                case 'no_bookings':
                    userIds = yield this.getNoBookingUserIds(locationId);
                    break;
                case 'non_members':
                    userIds = yield this.getNonMemberUserIds(locationId);
                    break;
                case 'high_spenders':
                    userIds = yield this.getHighSpenderUserIds(locationId);
                    break;
            }
            if (userIds.length === 0) {
                return { count: 0, recipients: [] };
            }
            const optedOutIds = yield this.getOptedOutUserIds(userIds);
            const filteredIds = userIds.filter(id => !optedOutIds.has(id));
            if (filteredIds.length === 0) {
                return { count: 0, recipients: [] };
            }
            const { data: profiles } = yield database_1.supabase
                .from('user_profiles')
                .select('id, email, full_name')
                .in('id', filteredIds);
            const recipients = (profiles || []).map(p => ({
                id: p.id,
                email: p.email,
                fullName: p.full_name || 'Valued Customer',
            }));
            return { count: recipients.length, recipients };
        });
    }
    static getAudiencePreview(locationId, audienceType) {
        return __awaiter(this, void 0, void 0, function* () {
            const { count } = yield this.getAudienceRecipients(locationId, audienceType);
            return count;
        });
    }
    static getCustomerUserIds(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield database_1.supabase
                .from('bookings')
                .select('user_id')
                .eq('location_id', locationId)
                .eq('status', 'confirmed')
                .not('user_id', 'is', null);
            const unique = new Set((data || []).map(b => b.user_id));
            return Array.from(unique);
        });
    }
    static getActiveMemberUserIds(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield database_1.supabase
                .from('memberships')
                .select('user_id')
                .eq('location_id', locationId)
                .eq('status', 'active');
            return (data || []).map(m => m.user_id);
        });
    }
    static getInactiveUserIds(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const allCustomerIds = yield this.getCustomerUserIds(locationId);
            if (allCustomerIds.length === 0)
                return [];
            const { data: recentBookings } = yield database_1.supabase
                .from('bookings')
                .select('user_id')
                .eq('location_id', locationId)
                .eq('status', 'confirmed')
                .gte('start_time', thirtyDaysAgo.toISOString())
                .not('user_id', 'is', null);
            const recentIds = new Set((recentBookings || []).map(b => b.user_id));
            return allCustomerIds.filter(id => !recentIds.has(id));
        });
    }
    static getOptedOutUserIds(userIds) {
        return __awaiter(this, void 0, void 0, function* () {
            if (userIds.length === 0)
                return new Set();
            const { data } = yield database_1.supabase
                .from('marketing_preferences')
                .select('user_id')
                .in('user_id', userIds)
                .eq('email_opted_out', true);
            return new Set((data || []).map(p => p.user_id));
        });
    }
    static getAllUserIds(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield database_1.supabase
                .from('user_profiles')
                .select('id')
                .eq('location_id', locationId)
                .eq('role', 'customer');
            return (data || []).map(u => u.id);
        });
    }
    static getNoBookingUserIds(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [allIds, customerIds] = yield Promise.all([
                this.getAllUserIds(locationId),
                this.getCustomerUserIds(locationId),
            ]);
            const customerSet = new Set(customerIds);
            return allIds.filter(id => !customerSet.has(id));
        });
    }
    static getNonMemberUserIds(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [allIds, memberIds] = yield Promise.all([
                this.getAllUserIds(locationId),
                this.getActiveMemberUserIds(locationId),
            ]);
            const memberSet = new Set(memberIds);
            return allIds.filter(id => !memberSet.has(id));
        });
    }
    static getHighSpenderUserIds(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield database_1.supabase
                .from('bookings')
                .select('user_id, total_amount')
                .eq('location_id', locationId)
                .eq('status', 'confirmed')
                .not('user_id', 'is', null);
            if (!data || data.length === 0)
                return [];
            const spendByUser = new Map();
            for (const row of data) {
                const uid = row.user_id;
                spendByUser.set(uid, (spendByUser.get(uid) || 0) + Number(row.total_amount || 0));
            }
            const sorted = Array.from(spendByUser.entries()).sort((a, b) => b[1] - a[1]);
            const topCount = Math.ceil(sorted.length * 0.25);
            return sorted.slice(0, topCount).map(([uid]) => uid);
        });
    }
    // ------------------------------------------------------------------
    // Campaign CRUD
    // ------------------------------------------------------------------
    static getCampaigns(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('marketing_campaigns')
                .select('*')
                .eq('location_id', locationId)
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Error fetching campaigns:', error);
                return [];
            }
            return (data || []);
        });
    }
    static getCampaignDetail(campaignId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: campaign, error } = yield database_1.supabase
                .from('marketing_campaigns')
                .select('*')
                .eq('id', campaignId)
                .single();
            if (error || !campaign) {
                console.error('Error fetching campaign detail:', error);
                return null;
            }
            const { data: recipients } = yield database_1.supabase
                .from('campaign_recipients')
                .select('*')
                .eq('campaign_id', campaignId)
                .order('created_at', { ascending: true });
            return Object.assign(Object.assign({}, campaign), { recipients: (recipients || []) });
        });
    }
    // ------------------------------------------------------------------
    // Campaign create (draft / schedule / send)
    // ------------------------------------------------------------------
    static createCampaign(locationId, employeeId, subject, body, audienceType, action, scheduledFor, templateId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (action === 'draft') {
                return this.createDraft(locationId, employeeId, subject, body, audienceType, templateId);
            }
            const { recipients } = yield this.getAudienceRecipients(locationId, audienceType);
            if (recipients.length === 0) {
                throw new Error('No recipients found for the selected audience');
            }
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('name')
                .eq('id', locationId)
                .single();
            const locationName = (location === null || location === void 0 ? void 0 : location.name) || 'Golf Labs US';
            const apiUrl = process.env.API_URL || 'http://localhost:4242';
            const htmlBody = yield this.renderMarketingHtml(subject, body, locationName, templateId);
            const status = action === 'schedule' ? 'scheduled' : 'sending';
            const { data: campaign, error: insertError } = yield database_1.supabase
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
                throw new Error(`Failed to create campaign: ${insertError === null || insertError === void 0 ? void 0 : insertError.message}`);
            }
            yield this.insertRecipientRows(campaign.id, recipients);
            if (action === 'send') {
                return this.executeSend(campaign, recipients, htmlBody, subject, apiUrl);
            }
            return campaign;
        });
    }
    static createDraft(locationId, employeeId, subject, body, audienceType, templateId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
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
                throw new Error(`Failed to create draft: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return data;
        });
    }
    static updateDraft(campaignId, subject, body, audienceType, templateId, scheduledFor) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: existing } = yield database_1.supabase
                .from('marketing_campaigns')
                .select('status')
                .eq('id', campaignId)
                .single();
            if (!existing || existing.status !== 'draft') {
                throw new Error('Only draft campaigns can be edited');
            }
            const updatePayload = {
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
            const { data, error } = yield database_1.supabase
                .from('marketing_campaigns')
                .update(updatePayload)
                .eq('id', campaignId)
                .select('*')
                .single();
            if (error || !data) {
                throw new Error(`Failed to update draft: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return data;
        });
    }
    static deleteCampaign(campaignId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: existing } = yield database_1.supabase
                .from('marketing_campaigns')
                .select('status')
                .eq('id', campaignId)
                .single();
            if (!existing || (existing.status !== 'draft' && existing.status !== 'scheduled')) {
                throw new Error('Only draft or scheduled campaigns can be deleted');
            }
            const { error } = yield database_1.supabase
                .from('marketing_campaigns')
                .delete()
                .eq('id', campaignId);
            if (error) {
                throw new Error(`Failed to delete campaign: ${error.message}`);
            }
        });
    }
    // ------------------------------------------------------------------
    // Send a draft or scheduled campaign
    // ------------------------------------------------------------------
    static sendCampaign(campaignId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: campaign, error } = yield database_1.supabase
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
            const { recipients } = yield this.getAudienceRecipients(locationId, campaign.audience_type);
            if (recipients.length === 0) {
                throw new Error('No recipients found for the selected audience');
            }
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('name')
                .eq('id', locationId)
                .single();
            const locationName = (location === null || location === void 0 ? void 0 : location.name) || 'Golf Labs US';
            const apiUrl = process.env.API_URL || 'http://localhost:4242';
            const htmlBody = yield this.renderMarketingHtml(campaign.subject, campaign.text_body || '', locationName, campaign.template_id);
            yield database_1.supabase
                .from('marketing_campaigns')
                .update({ status: 'sending', html_body: htmlBody, total_recipients: recipients.length })
                .eq('id', campaignId);
            yield database_1.supabase.from('campaign_recipients').delete().eq('campaign_id', campaignId);
            yield this.insertRecipientRows(campaignId, recipients);
            const updatedCampaign = Object.assign(Object.assign({}, campaign), { status: 'sending', html_body: htmlBody, total_recipients: recipients.length });
            return this.executeSend(updatedCampaign, recipients, htmlBody, campaign.subject, apiUrl);
        });
    }
    // ------------------------------------------------------------------
    // Core send logic with per-recipient message ID tracking
    // ------------------------------------------------------------------
    static executeSend(campaign, recipients, htmlBody, subject, apiUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            let sentCount = 0;
            let failedCount = 0;
            for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
                const batch = recipients.slice(i, i + BATCH_SIZE);
                const emails = batch.map(r => {
                    const unsubLink = this.generateUnsubscribeLink(r.id, apiUrl);
                    const personalizedHtml = htmlBody.replace(/\{\{unsubscribeLink\}\}/g, unsubLink);
                    return {
                        from: resend_1.resendConfig.fromEmail,
                        to: [r.email],
                        subject,
                        html: personalizedHtml,
                    };
                });
                try {
                    const result = yield resend_1.resend.batch.send(emails);
                    if (result.error) {
                        console.error('Resend batch error:', result.error);
                        failedCount += batch.length;
                        yield this.updateRecipientStatuses(campaign.id, batch, 'failed');
                    }
                    else {
                        sentCount += batch.length;
                        console.log('Resend batch.send result.data:', JSON.stringify(result.data));
                        const rawData = result.data;
                        const messageIds = Array.isArray(rawData)
                            ? rawData
                            : Array.isArray(rawData === null || rawData === void 0 ? void 0 : rawData.data)
                                ? rawData.data
                                : [];
                        console.log(`Batch send returned ${messageIds.length} message IDs for ${batch.length} recipients`);
                        yield this.storeMessageIds(campaign.id, batch, messageIds);
                    }
                }
                catch (err) {
                    console.error('Resend batch exception:', err);
                    failedCount += batch.length;
                    yield this.updateRecipientStatuses(campaign.id, batch, 'failed');
                }
                if (i + BATCH_SIZE < recipients.length) {
                    yield new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            const finalStatus = failedCount === recipients.length ? 'failed' : 'sent';
            const { data: updated } = yield database_1.supabase
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
            console.log(`Campaign ${campaign.id} complete: ${sentCount} sent, ${failedCount} failed`);
            return (updated || campaign);
        });
    }
    static insertRecipientRows(campaignId, recipients) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = recipients.map(r => ({
                campaign_id: campaignId,
                user_id: r.id,
                email: r.email,
                status: 'pending',
            }));
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const { error } = yield database_1.supabase.from('campaign_recipients').insert(batch);
                if (error) {
                    console.error('Error inserting recipient rows:', error);
                }
            }
        });
    }
    static storeMessageIds(campaignId, batch, messageIds) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            for (let j = 0; j < batch.length; j++) {
                const msgId = (_a = messageIds[j]) === null || _a === void 0 ? void 0 : _a.id;
                if (!msgId)
                    continue;
                yield database_1.supabase
                    .from('campaign_recipients')
                    .update({ resend_message_id: msgId, status: 'sent' })
                    .eq('campaign_id', campaignId)
                    .eq('user_id', batch[j].id);
            }
        });
    }
    static updateRecipientStatuses(campaignId, batch, status) {
        return __awaiter(this, void 0, void 0, function* () {
            const userIds = batch.map(r => r.id);
            yield database_1.supabase
                .from('campaign_recipients')
                .update({ status })
                .eq('campaign_id', campaignId)
                .in('user_id', userIds);
        });
    }
    // ------------------------------------------------------------------
    // Webhook tracking (opened / clicked / delivered / bounced)
    // ------------------------------------------------------------------
    static processTrackingWebhook(messageId, eventType) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: recipient } = yield database_1.supabase
                .from('campaign_recipients')
                .select('id, campaign_id, opened_at, clicked_at')
                .eq('resend_message_id', messageId)
                .maybeSingle();
            if (!recipient)
                return;
            const now = new Date().toISOString();
            switch (eventType) {
                case 'email.delivered':
                    yield database_1.supabase
                        .from('campaign_recipients')
                        .update({ status: 'delivered' })
                        .eq('id', recipient.id);
                    break;
                case 'email.bounced':
                    yield database_1.supabase
                        .from('campaign_recipients')
                        .update({ status: 'bounced' })
                        .eq('id', recipient.id);
                    break;
                case 'email.opened':
                    if (!recipient.opened_at) {
                        yield database_1.supabase
                            .from('campaign_recipients')
                            .update({ opened_at: now })
                            .eq('id', recipient.id);
                        yield database_1.supabase.rpc('increment_campaign_counter', {
                            p_campaign_id: recipient.campaign_id,
                            p_column: 'open_count',
                        }).then(({ error }) => {
                            if (error) {
                                // Fallback: manual increment if RPC doesn't exist
                                database_1.supabase
                                    .from('marketing_campaigns')
                                    .select('open_count')
                                    .eq('id', recipient.campaign_id)
                                    .single()
                                    .then(({ data }) => {
                                    if (data) {
                                        database_1.supabase
                                            .from('marketing_campaigns')
                                            .update({ open_count: (data.open_count || 0) + 1 })
                                            .eq('id', recipient.campaign_id)
                                            .then(() => { });
                                    }
                                });
                            }
                        });
                    }
                    break;
                case 'email.clicked':
                    if (!recipient.clicked_at) {
                        yield database_1.supabase
                            .from('campaign_recipients')
                            .update({ clicked_at: now })
                            .eq('id', recipient.id);
                        yield database_1.supabase.rpc('increment_campaign_counter', {
                            p_campaign_id: recipient.campaign_id,
                            p_column: 'click_count',
                        }).then(({ error }) => {
                            if (error) {
                                database_1.supabase
                                    .from('marketing_campaigns')
                                    .select('click_count')
                                    .eq('id', recipient.campaign_id)
                                    .single()
                                    .then(({ data }) => {
                                    if (data) {
                                        database_1.supabase
                                            .from('marketing_campaigns')
                                            .update({ click_count: (data.click_count || 0) + 1 })
                                            .eq('id', recipient.campaign_id)
                                            .then(() => { });
                                    }
                                });
                            }
                        });
                    }
                    break;
            }
        });
    }
    // ------------------------------------------------------------------
    // Scheduler: find and send due campaigns
    // ------------------------------------------------------------------
    static sendDueScheduledCampaigns() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date().toISOString();
            // Atomically claim due campaigns by flipping status to 'sending'
            const { data: claimed } = yield database_1.supabase
                .from('marketing_campaigns')
                .update({ status: 'sending' })
                .eq('status', 'scheduled')
                .lte('scheduled_for', now)
                .select('id');
            if (!claimed || claimed.length === 0)
                return 0;
            let sent = 0;
            for (const c of claimed) {
                try {
                    // sendCampaign checks for draft/scheduled status, but we already
                    // moved to 'sending'. Call the internal send flow directly.
                    const { data: campaign } = yield database_1.supabase
                        .from('marketing_campaigns')
                        .select('*')
                        .eq('id', c.id)
                        .single();
                    if (!campaign)
                        continue;
                    const { recipients } = yield this.getAudienceRecipients(campaign.location_id, campaign.audience_type);
                    if (recipients.length === 0) {
                        yield database_1.supabase
                            .from('marketing_campaigns')
                            .update({ status: 'failed' })
                            .eq('id', c.id);
                        continue;
                    }
                    const { data: location } = yield database_1.supabase
                        .from('locations')
                        .select('name')
                        .eq('id', campaign.location_id)
                        .single();
                    const locationName = (location === null || location === void 0 ? void 0 : location.name) || 'Golf Labs US';
                    const apiUrl = process.env.API_URL || 'http://localhost:4242';
                    const htmlBody = yield this.renderMarketingHtml(campaign.subject, campaign.text_body || '', locationName, campaign.template_id);
                    yield database_1.supabase
                        .from('marketing_campaigns')
                        .update({ html_body: htmlBody, total_recipients: recipients.length })
                        .eq('id', c.id);
                    yield database_1.supabase.from('campaign_recipients').delete().eq('campaign_id', c.id);
                    yield this.insertRecipientRows(c.id, recipients);
                    const updatedCampaign = Object.assign(Object.assign({}, campaign), { status: 'sending', html_body: htmlBody, total_recipients: recipients.length });
                    yield this.executeSend(updatedCampaign, recipients, htmlBody, campaign.subject, apiUrl);
                    sent++;
                }
                catch (err) {
                    console.error(`Failed to send scheduled campaign ${c.id}:`, err);
                    yield database_1.supabase
                        .from('marketing_campaigns')
                        .update({ status: 'failed' })
                        .eq('id', c.id);
                }
            }
            return sent;
        });
    }
    // ------------------------------------------------------------------
    // Unsubscribe (unchanged from V1)
    // ------------------------------------------------------------------
    static generateUnsubscribeSignature(userId) {
        return crypto_1.default
            .createHmac('sha256', UNSUBSCRIBE_SECRET)
            .update(userId)
            .digest('hex');
    }
    static generateUnsubscribeLink(userId, apiUrl) {
        const sig = this.generateUnsubscribeSignature(userId);
        return `${apiUrl}/marketing/unsubscribe?uid=${userId}&sig=${sig}`;
    }
    static verifyUnsubscribeSignature(userId, signature) {
        const expected = this.generateUnsubscribeSignature(userId);
        if (expected.length !== signature.length)
            return false;
        return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    }
    static unsubscribe(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('marketing_preferences')
                .upsert({
                user_id: userId,
                email_opted_out: true,
                email_opted_out_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
            if (error) {
                console.error('Error unsubscribing user:', error);
                throw new Error('Failed to process unsubscribe');
            }
            console.log(`User ${userId} unsubscribed from marketing emails`);
        });
    }
    // ------------------------------------------------------------------
    // HTML builder with template support
    // ------------------------------------------------------------------
    static renderMarketingHtml(subject, body, locationName, templateId) {
        return __awaiter(this, void 0, void 0, function* () {
            const bodyHtml = body
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => `<p class="text-tertiary" style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">${this.escapeHtml(line)}</p>`)
                .join('\n');
            let htmlTemplateSource;
            if (templateId) {
                try {
                    const template = yield this.getMarketingTemplate(templateId);
                    htmlTemplateSource = template.html_template;
                }
                catch (_a) {
                    htmlTemplateSource = email_template_defaults_1.DEFAULT_TEMPLATES.marketing_campaign.html;
                }
            }
            else {
                htmlTemplateSource = email_template_defaults_1.DEFAULT_TEMPLATES.marketing_campaign.html;
            }
            const compiled = handlebars_1.default.compile(htmlTemplateSource);
            return compiled({
                subject: this.escapeHtml(subject),
                body: new handlebars_1.default.SafeString(bodyHtml),
                textBody: body,
                locationName: this.escapeHtml(locationName),
                unsubscribeLink: '{{unsubscribeLink}}',
            });
        });
    }
    static escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
exports.MarketingService = MarketingService;
