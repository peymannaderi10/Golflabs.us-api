import { Router } from 'express';
import { PricingController } from './pricing.controller';

export const pricingRoutes = Router();

const controller = new PricingController();

// Pricing routes
pricingRoutes.get('/pricing-rules', controller.getPricingRules); 