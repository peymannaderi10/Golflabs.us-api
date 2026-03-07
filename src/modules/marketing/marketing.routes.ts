import { Router } from 'express';
import { marketingController } from './marketing.controller';
import { authenticateEmployee } from '../auth';

const router = Router();

router.get('/campaigns', authenticateEmployee, (req, res) => marketingController.getCampaigns(req, res));

router.post('/campaigns', authenticateEmployee, (req, res) => marketingController.createCampaign(req, res));

router.get('/campaigns/:id', authenticateEmployee, (req, res) => marketingController.getCampaignDetail(req, res));

router.put('/campaigns/:id', authenticateEmployee, (req, res) => marketingController.updateCampaign(req, res));

router.post('/campaigns/:id/send', authenticateEmployee, (req, res) => marketingController.sendCampaign(req, res));

router.delete('/campaigns/:id', authenticateEmployee, (req, res) => marketingController.deleteCampaign(req, res));

router.get('/audience-preview', authenticateEmployee, (req, res) => marketingController.getAudiencePreview(req, res));

router.get('/templates', authenticateEmployee, (req, res) => marketingController.getTemplates(req, res));
router.get('/templates/:id', authenticateEmployee, (req, res) => marketingController.getTemplate(req, res));
router.post('/templates', authenticateEmployee, (req, res) => marketingController.createTemplate(req, res));
router.put('/templates/:id', authenticateEmployee, (req, res) => marketingController.updateTemplate(req, res));
router.delete('/templates/:id', authenticateEmployee, (req, res) => marketingController.deleteTemplate(req, res));

export const marketingRoutes = router;
