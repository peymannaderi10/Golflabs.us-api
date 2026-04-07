import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { marketingController } from './marketing.controller';
import { authenticateEmployee, enforceLocationScope, resolveResourceLocation } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';

const AUDIENCE_TYPES = ['all_customers', 'active_members', 'inactive_30d', 'all_users', 'no_bookings', 'non_members', 'high_spenders'] as const;

const router = Router();

// Front door: every marketing route authenticates. Tenant scope is
// enforced per-route — either via `enforceLocationScope` (fail-closed, reads
// from params/body/query) or via `scopeCampaign` / `scopeTemplate` for
// resource-param routes.
router.use(authenticateEmployee);

const scopeCampaign = [resolveResourceLocation('marketing_campaigns', 'id'), enforceLocationScope];
const scopeTemplate = [resolveResourceLocation('email_templates', 'id'), enforceLocationScope];

router.get('/campaigns', enforceLocationScope,
  query('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.getCampaigns(req, res));

router.post('/campaigns', enforceLocationScope,
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('subject').notEmpty().withMessage('subject is required').isLength({ max: 200 }).withMessage('subject must be at most 200 characters'),
  body('body').notEmpty().withMessage('body is required').isLength({ max: 50000 }).withMessage('body must be at most 50000 characters'),
  body('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'),
  body('action').optional().isIn(['draft', 'schedule', 'send']).withMessage('action must be draft, schedule, or send'),
  handleValidationErrors,
  (req, res) => marketingController.createCampaign(req, res));

router.get('/campaigns/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  ...scopeCampaign,
  (req, res) => marketingController.getCampaignDetail(req, res));

router.put('/campaigns/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  body('subject').notEmpty().withMessage('subject is required').isLength({ max: 200 }).withMessage('subject must be at most 200 characters'),
  body('body').notEmpty().withMessage('body is required').isLength({ max: 50000 }).withMessage('body must be at most 50000 characters'),
  body('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'),
  handleValidationErrors,
  ...scopeCampaign,
  (req, res) => marketingController.updateCampaign(req, res));

router.post('/campaigns/:id/send',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  ...scopeCampaign,
  (req, res) => marketingController.sendCampaign(req, res));

router.delete('/campaigns/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  ...scopeCampaign,
  (req, res) => marketingController.deleteCampaign(req, res));

router.get('/audience-preview', enforceLocationScope,
  query('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  query('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'),
  handleValidationErrors,
  (req, res) => marketingController.getAudiencePreview(req, res));

router.get('/templates', enforceLocationScope,
  query('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.getTemplates(req, res));

router.get('/templates/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  ...scopeTemplate,
  (req, res) => marketingController.getTemplate(req, res));

router.post('/templates', enforceLocationScope,
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('name').notEmpty().withMessage('name is required'),
  body('htmlTemplate').notEmpty().withMessage('htmlTemplate is required'),
  handleValidationErrors,
  (req, res) => marketingController.createTemplate(req, res));

router.put('/templates/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  body('name').notEmpty().withMessage('name is required'),
  body('htmlTemplate').notEmpty().withMessage('htmlTemplate is required'),
  handleValidationErrors,
  ...scopeTemplate,
  (req, res) => marketingController.updateTemplate(req, res));

router.delete('/templates/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  ...scopeTemplate,
  (req, res) => marketingController.deleteTemplate(req, res));

export const marketingRoutes = router;
