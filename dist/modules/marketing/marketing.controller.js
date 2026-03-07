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
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketingController = exports.MarketingController = void 0;
const marketing_service_1 = require("./marketing.service");
const VALID_AUDIENCE_TYPES = [
    'all_customers', 'active_members', 'inactive_30d',
    'all_users', 'no_bookings', 'non_members', 'high_spenders',
];
const VALID_ACTIONS = ['draft', 'schedule', 'send'];
class MarketingController {
    getCampaigns(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const campaigns = yield marketing_service_1.MarketingService.getCampaigns(locationId);
                return res.json(campaigns);
            }
            catch (error) {
                console.error('Error fetching campaigns:', error);
                return res.status(500).json({ error: error.message || 'Internal server error' });
            }
        });
    }
    getCampaignDetail(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const detail = yield marketing_service_1.MarketingService.getCampaignDetail(id);
                if (!detail) {
                    return res.status(404).json({ error: 'Campaign not found' });
                }
                return res.json(detail);
            }
            catch (error) {
                console.error('Error fetching campaign detail:', error);
                return res.status(500).json({ error: error.message || 'Internal server error' });
            }
        });
    }
    createCampaign(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
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
                const employeeId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!employeeId) {
                    return res.status(401).json({ error: 'Employee not authenticated' });
                }
                const campaign = yield marketing_service_1.MarketingService.createCampaign(locationId, employeeId, subject, body, audienceType, action, scheduledFor, templateId);
                return res.json(campaign);
            }
            catch (error) {
                console.error('Error creating campaign:', error);
                return res.status(500).json({ error: error.message || 'Failed to create campaign' });
            }
        });
    }
    updateCampaign(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { id } = req.params;
                const { subject, body, audienceType, templateId, scheduledFor } = req.body;
                if (!subject || !body || !audienceType) {
                    return res.status(400).json({ error: 'subject, body, and audienceType are required' });
                }
                if (!VALID_AUDIENCE_TYPES.includes(audienceType)) {
                    return res.status(400).json({ error: `Invalid audienceType. Must be one of: ${VALID_AUDIENCE_TYPES.join(', ')}` });
                }
                const campaign = yield marketing_service_1.MarketingService.updateDraft(id, subject, body, audienceType, templateId, scheduledFor);
                return res.json(campaign);
            }
            catch (error) {
                console.error('Error updating campaign:', error);
                const status = ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Only draft')) ? 400 : 500;
                return res.status(status).json({ error: error.message || 'Failed to update campaign' });
            }
        });
    }
    sendCampaign(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { id } = req.params;
                const campaign = yield marketing_service_1.MarketingService.sendCampaign(id);
                return res.json(campaign);
            }
            catch (error) {
                console.error('Error sending campaign:', error);
                const status = ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Cannot send')) ? 400 : 500;
                return res.status(status).json({ error: error.message || 'Failed to send campaign' });
            }
        });
    }
    deleteCampaign(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { id } = req.params;
                yield marketing_service_1.MarketingService.deleteCampaign(id);
                return res.json({ success: true });
            }
            catch (error) {
                console.error('Error deleting campaign:', error);
                const status = ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Only draft')) ? 400 : 500;
                return res.status(status).json({ error: error.message || 'Failed to delete campaign' });
            }
        });
    }
    getAudiencePreview(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, audienceType, includeList } = req.query;
                if (!locationId || !audienceType) {
                    return res.status(400).json({ error: 'locationId and audienceType are required' });
                }
                if (!VALID_AUDIENCE_TYPES.includes(audienceType)) {
                    return res.status(400).json({ error: `Invalid audienceType. Must be one of: ${VALID_AUDIENCE_TYPES.join(', ')}` });
                }
                if (includeList === 'true') {
                    const { count, recipients } = yield marketing_service_1.MarketingService.getAudienceRecipients(locationId, audienceType);
                    return res.json({ count, recipients });
                }
                const count = yield marketing_service_1.MarketingService.getAudiencePreview(locationId, audienceType);
                return res.json({ count });
            }
            catch (error) {
                console.error('Error getting audience preview:', error);
                return res.status(500).json({ error: error.message || 'Internal server error' });
            }
        });
    }
    // ------------------------------------------------------------------
    // Marketing template CRUD endpoints
    // ------------------------------------------------------------------
    getTemplates(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const templates = yield marketing_service_1.MarketingService.getMarketingTemplates(locationId);
                return res.json(templates);
            }
            catch (error) {
                console.error('Error fetching templates:', error);
                return res.status(500).json({ error: error.message || 'Internal server error' });
            }
        });
    }
    getTemplate(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { id } = req.params;
                const template = yield marketing_service_1.MarketingService.getMarketingTemplate(id);
                return res.json(template);
            }
            catch (error) {
                console.error('Error fetching template:', error);
                const status = ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) ? 404 : 500;
                return res.status(status).json({ error: error.message || 'Internal server error' });
            }
        });
    }
    createTemplate(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, name, htmlTemplate } = req.body;
                if (!locationId || !name || !htmlTemplate) {
                    return res.status(400).json({ error: 'locationId, name, and htmlTemplate are required' });
                }
                const template = yield marketing_service_1.MarketingService.createMarketingTemplate(locationId, name, htmlTemplate);
                return res.json(template);
            }
            catch (error) {
                console.error('Error creating template:', error);
                return res.status(500).json({ error: error.message || 'Failed to create template' });
            }
        });
    }
    updateTemplate(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const { name, htmlTemplate } = req.body;
                if (!name || !htmlTemplate) {
                    return res.status(400).json({ error: 'name and htmlTemplate are required' });
                }
                const template = yield marketing_service_1.MarketingService.updateMarketingTemplate(id, name, htmlTemplate);
                return res.json(template);
            }
            catch (error) {
                console.error('Error updating template:', error);
                return res.status(500).json({ error: error.message || 'Failed to update template' });
            }
        });
    }
    deleteTemplate(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                yield marketing_service_1.MarketingService.deleteMarketingTemplate(id);
                return res.json({ success: true });
            }
            catch (error) {
                console.error('Error deleting template:', error);
                return res.status(500).json({ error: error.message || 'Failed to delete template' });
            }
        });
    }
    unsubscribe(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const { uid, sig } = req.query;
            if (!uid || !sig) {
                return res.status(400).send(this.renderUnsubscribePage('Invalid Link', 'This unsubscribe link is invalid or incomplete.'));
            }
            try {
                const valid = marketing_service_1.MarketingService.verifyUnsubscribeSignature(uid, sig);
                if (!valid) {
                    return res.status(400).send(this.renderUnsubscribePage('Invalid Link', 'This unsubscribe link is invalid or has expired.'));
                }
                yield marketing_service_1.MarketingService.unsubscribe(uid);
                return res.send(this.renderUnsubscribePage('Unsubscribed', 'You have been successfully unsubscribed from marketing emails. You will still receive transactional emails (booking confirmations, reminders, etc.).'));
            }
            catch (error) {
                console.error('Unsubscribe error:', error);
                return res.status(500).send(this.renderUnsubscribePage('Error', 'Something went wrong. Please try again later.'));
            }
        });
    }
    renderUnsubscribePage(title, message) {
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
exports.MarketingController = MarketingController;
exports.marketingController = new MarketingController();
