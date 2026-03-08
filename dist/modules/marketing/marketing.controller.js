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
const error_utils_1 = require("../../shared/utils/error.utils");
const logger_1 = require("../../shared/utils/logger");
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
                logger_1.logger.error({ err: error }, 'Error fetching campaigns');
                return res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
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
                logger_1.logger.error({ err: error }, 'Error fetching campaign detail');
                return res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
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
                logger_1.logger.error({ err: error }, 'Error creating campaign');
                return res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
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
                logger_1.logger.error({ err: error }, 'Error updating campaign');
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
                logger_1.logger.error({ err: error }, 'Error sending campaign');
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
                logger_1.logger.error({ err: error }, 'Error deleting campaign');
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
                logger_1.logger.error({ err: error }, 'Error getting audience preview');
                return res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
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
                logger_1.logger.error({ err: error }, 'Error fetching templates');
                return res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
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
                logger_1.logger.error({ err: error }, 'Error fetching template');
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
                logger_1.logger.error({ err: error }, 'Error creating template');
                return res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
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
                logger_1.logger.error({ err: error }, 'Error updating template');
                return res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
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
                logger_1.logger.error({ err: error }, 'Error deleting template');
                return res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
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
                logger_1.logger.error({ err: error }, 'Unsubscribe error');
                return res.status(500).send(this.renderUnsubscribePage('Error', 'Something went wrong. Please try again later.'));
            }
        });
    }
    renderUnsubscribePage(title, message) {
        const isSuccess = title === 'Unsubscribed';
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Golf Labs</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
    .card { background: #fff; border-radius: 0.5rem; padding: 40px 32px; max-width: 420px; width: 100%; text-align: center; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .icon-success { background: rgba(0,163,108,0.1); color: #00A36C; }
    .icon-error { background: #fef2f2; color: #ef4444; }
    .icon svg { width: 28px; height: 28px; }
    h1 { color: #0a0a0a; font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    .message { color: #737373; font-size: 14px; line-height: 1.6; }
    .divider { height: 1px; background: #e5e7eb; margin: 24px 0; }
    .brand { color: #a3a3a3; font-size: 12px; font-weight: 500; letter-spacing: 0.025em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon ${isSuccess ? 'icon-success' : 'icon-error'}">
      ${isSuccess
            ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>'}
    </div>
    <h1>${title}</h1>
    <p class="message">${message}</p>
    <div class="divider"></div>
    <p class="brand">Golf Labs US</p>
  </div>
</body>
</html>`;
    }
}
exports.MarketingController = MarketingController;
exports.marketingController = new MarketingController();
