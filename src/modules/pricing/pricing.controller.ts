import { Request, Response } from 'express';
import { PricingService } from './pricing.service';

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
      console.error('Error in /pricing-rules endpoint:', error);
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
      console.error('Error in getAllPricingRules endpoint:', error);
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
      console.error('Error in createPricingRule endpoint:', error);
      if (error.message === 'Location ID is required' || error.message === 'Failed to create pricing rule') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  updatePricingRule = async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      const updates = req.body;
      const pricingRule = await this.pricingService.updatePricingRule(ruleId, updates);
      res.json(pricingRule);
    } catch (error: any) {
      console.error('Error in updatePricingRule endpoint:', error);
      if (error.message === 'Pricing rule ID is required' || error.message === 'Failed to update pricing rule') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  deletePricingRule = async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      await this.pricingService.deletePricingRule(ruleId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error in deletePricingRule endpoint:', error);
      if (error.message === 'Pricing rule ID is required' || error.message === 'Failed to delete pricing rule') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };
} 