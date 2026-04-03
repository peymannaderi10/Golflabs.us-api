import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { marketingController } from './marketing.controller';
import { authenticateEmployee, validateLocationAccess } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';

const AUDIENCE_TYPES = ['all_customers', 'active_members', 'inactive_30d', 'all_users', 'no_bookings', 'non_members', 'high_spenders'] as const;

const router = Router();

router.get('/campaigns', authenticateEmployee, validateLocationAccess('query'),
  query('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.getCampaigns(req, res));

router.post('/campaigns', authenticateEmployee, validateLocationAccess('body'),
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('subject').notEmpty().withMessage('subject is required').isLength({ max: 200 }).withMessage('subject must be at most 200 characters'),
  body('body').notEmpty().withMessage('body is required').isLength({ max: 50000 }).withMessage('body must be at most 50000 characters'),
  body('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'),
  body('action').optional().isIn(['draft', 'schedule', 'send']).withMessage('action must be draft, schedule, or send'),
  handleValidationErrors,
  (req, res) => marketingController.createCampaign(req, res));

router.get('/campaigns/:id', authenticateEmployee,
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.getCampaignDetail(req, res));

router.put('/campaigns/:id', authenticateEmployee,
  param('id').isUUID().withMessage('id must be a valid UUID'),
  body('subject').notEmpty().withMessage('subject is required').isLength({ max: 200 }).withMessage('subject must be at most 200 characters'),
  body('body').notEmpty().withMessage('body is required').isLength({ max: 50000 }).withMessage('body must be at most 50000 characters'),
  body('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'),
  handleValidationErrors,
  (req, res) => marketingController.updateCampaign(req, res));

router.post('/campaigns/:id/send', authenticateEmployee,
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.sendCampaign(req, res));

router.delete('/campaigns/:id', authenticateEmployee,
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.deleteCampaign(req, res));

router.get('/audience-preview', authenticateEmployee, validateLocationAccess('query'),
  query('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  query('audienceType').isIn([...AUDIENCE_TYPES]).withMessage('audienceType must be a valid audience type'),
  handleValidationErrors,
  (req, res) => marketingController.getAudiencePreview(req, res));

router.get('/templates', authenticateEmployee, validateLocationAccess('query'),
  query('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.getTemplates(req, res));

router.get('/templates/:id', authenticateEmployee,
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.getTemplate(req, res));

router.post('/templates', authenticateEmployee, validateLocationAccess('body'),
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('name').notEmpty().withMessage('name is required'),
  body('htmlTemplate').notEmpty().withMessage('htmlTemplate is required'),
  handleValidationErrors,
  (req, res) => marketingController.createTemplate(req, res));

router.put('/templates/:id', authenticateEmployee,
  param('id').isUUID().withMessage('id must be a valid UUID'),
  body('name').notEmpty().withMessage('name is required'),
  body('htmlTemplate').notEmpty().withMessage('htmlTemplate is required'),
  handleValidationErrors,
  (req, res) => marketingController.updateTemplate(req, res));

router.delete('/templates/:id', authenticateEmployee,
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  (req, res) => marketingController.deleteTemplate(req, res));

export const marketingRoutes = router;
