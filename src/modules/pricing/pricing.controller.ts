import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { PricingService } from './pricing.service';
import { logger } from '../../shared/utils/logger';

export class PricingController {
  private pricingService: PricingService;

  constructor() {
    this.pricingService = new PricingService();
  }

  getPricingRules = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      const pricingRules = await this.pricingService.getPricingRules(locationId as string);
      res.json(pricingRules);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in pricing-rules endpoint');
      if (error.message === 'Location ID is required') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getAllPricingRules = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      if (!locationId) {
        return res.status(400).json({ error: 'Location ID is required' });
      }
      const pricingRules = await this.pricingService.getAllPricingRules(locationId as string);
      res.json(pricingRules);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in getAllPricingRules endpoint');
      if (error.message === 'Location ID is required') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  createPricingRule = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const rule = req.body;
      const pricingRule = await this.pricingService.createPricingRule(locationId, rule);
      res.status(201).json(pricingRule);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in createPricingRule endpoint');
      if (error.message.includes('overlaps') || error.message === 'Location ID is required' || error.message === 'Failed to create pricing rule') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  updatePricingRule = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ruleId } = req.params;
      const updates = req.body;
      const employeeLocationId = req.employeeProfile?.location_id;
      if (!employeeLocationId) {
        return res.status(403).json({ error: 'Employee profile missing location' });
      }
      const pricingRule = await this.pricingService.updatePricingRule(ruleId, updates, employeeLocationId);
      res.json(pricingRule);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in updatePricingRule endpoint');
      if (error.message.includes('Access denied')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('overlaps') || error.message === 'Pricing rule ID is required' || error.message === 'Pricing rule not found' || error.message === 'Failed to update pricing rule') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  deletePricingRule = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ruleId } = req.params;
      const employeeLocationId = req.employeeProfile?.location_id;
      if (!employeeLocationId) {
        return res.status(403).json({ error: 'Employee profile missing location' });
      }
      await this.pricingService.deletePricingRule(ruleId, employeeLocationId);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error in deletePricingRule endpoint');
      if (error.message.includes('Access denied')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === 'Pricing rule ID is required' || error.message === 'Pricing rule not found' || error.message === 'Failed to delete pricing rule') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };
} 