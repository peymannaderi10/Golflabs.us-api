"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketingRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const marketing_controller_1 = require("./marketing.controller");
const auth_1 = require("../auth");
const validation_1 = require("../../shared/middleware/validation");
const AUDIENCE_TYPES = ['all_customers', 'active_members', 'inactive_30d', 'all_users', 'no_bookings', 'non_members', 'high_spenders'];
const router = (0, express_1.Router)();
// Front door: every marketing route authenticates. Tenant scope is
// enforced per-route — either via `enforceLocationScope` (fail-closed, reads
// from params/body/query) or via `scopeCampaign` / `scopeTemplate` for
// resource-param routes.
router.use(auth_1.authenticateEmployee);
const scopeCampaign = [(0, auth_1.resolveResourceLocation)('marketing_campaigns', 'id'), auth_1.enforceLocationScope];
const scopeTemplate = [(0, auth_1.resolveResourceLocation)('email_templates', 'id'), auth_1.enforceLocationScope];
router.get('/campaigns', auth_1.enforceLocationScope, (0, express_validator_1.query)('locationId').isUUID().withMessage('locationId must be a valid UUID'), validation_1.handleValidationErrors, (req, res) => marketing_controller_1.marketingController.getCampaigns(req, res));
router.post('/campaigns', auth_1.enforceLocationScope, (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'), (0, express_validator_1.body)('subject').notEmpty().withMessage('subject is required').isLength({ max: 200 }).withMessage('subject must be at most 200 characters'), (0, express_validator_1.body)('body').notEmpty().withMessage('body is required').isLength({ max: 50000 }).withMessage('body must be at most 50000 characters'), (0, express_validator_1.body)('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'), (0, express_validator_1.body)('action').optional().isIn(['draft', 'schedule', 'send']).withMessage('action must be draft, schedule, or send'), validation_1.handleValidationErrors, (req, res) => marketing_controller_1.marketingController.createCampaign(req, res));
router.get('/campaigns/:id', (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'), validation_1.handleValidationErrors, ...scopeCampaign, (req, res) => marketing_controller_1.marketingController.getCampaignDetail(req, res));
router.put('/campaigns/:id', (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'), (0, express_validator_1.body)('subject').notEmpty().withMessage('subject is required').isLength({ max: 200 }).withMessage('subject must be at most 200 characters'), (0, express_validator_1.body)('body').notEmpty().withMessage('body is required').isLength({ max: 50000 }).withMessage('body must be at most 50000 characters'), (0, express_validator_1.body)('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'), validation_1.handleValidationErrors, ...scopeCampaign, (req, res) => marketing_controller_1.marketingController.updateCampaign(req, res));
router.post('/campaigns/:id/send', (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'), validation_1.handleValidationErrors, ...scopeCampaign, (req, res) => marketing_controller_1.marketingController.sendCampaign(req, res));
router.delete('/campaigns/:id', (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'), validation_1.handleValidationErrors, ...scopeCampaign, (req, res) => marketing_controller_1.marketingController.deleteCampaign(req, res));
router.get('/audience-preview', auth_1.enforceLocationScope, (0, express_validator_1.query)('locationId').isUUID().withMessage('locationId must be a valid UUID'), (0, express_validator_1.query)('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'), validation_1.handleValidationErrors, (req, res) => marketing_controller_1.marketingController.getAudiencePreview(req, res));
router.get('/templates', auth_1.enforceLocationScope, (0, express_validator_1.query)('locationId').isUUID().withMessage('locationId must be a valid UUID'), validation_1.handleValidationErrors, (req, res) => marketing_controller_1.marketingController.getTemplates(req, res));
router.get('/templates/:id', (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'), validation_1.handleValidationErrors, ...scopeTemplate, (req, res) => marketing_controller_1.marketingController.getTemplate(req, res));
router.post('/templates', auth_1.enforceLocationScope, (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'), (0, express_validator_1.body)('name').notEmpty().withMessage('name is required'), (0, express_validator_1.body)('htmlTemplate').notEmpty().withMessage('htmlTemplate is required'), validation_1.handleValidationErrors, (req, res) => marketing_controller_1.marketingController.createTemplate(req, res));
router.put('/templates/:id', (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'), (0, express_validator_1.body)('name').notEmpty().withMessage('name is required'), (0, express_validator_1.body)('htmlTemplate').notEmpty().withMessage('htmlTemplate is required'), validation_1.handleValidationErrors, ...scopeTemplate, (req, res) => marketing_controller_1.marketingController.updateTemplate(req, res));
router.delete('/templates/:id', (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'), validation_1.handleValidationErrors, ...scopeTemplate, (req, res) => marketing_controller_1.marketingController.deleteTemplate(req, res));
exports.marketingRoutes = router;
