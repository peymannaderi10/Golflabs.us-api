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
exports.PricingController = void 0;
const pricing_service_1 = require("./pricing.service");
class PricingController {
    constructor() {
        this.getPricingRules = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                const pricingRules = yield this.pricingService.getPricingRules(locationId);
                res.json(pricingRules);
            }
            catch (error) {
                console.error('Error in /pricing-rules endpoint:', error);
                if (error.message === 'Location ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.getAllPricingRules = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'Location ID is required' });
                }
                const pricingRules = yield this.pricingService.getAllPricingRules(locationId);
                res.json(pricingRules);
            }
            catch (error) {
                console.error('Error in getAllPricingRules endpoint:', error);
                if (error.message === 'Location ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.createPricingRule = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.params;
                const rule = req.body;
                const pricingRule = yield this.pricingService.createPricingRule(locationId, rule);
                res.status(201).json(pricingRule);
            }
            catch (error) {
                console.error('Error in createPricingRule endpoint:', error);
                if (error.message === 'Location ID is required' || error.message === 'Failed to create pricing rule') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.updatePricingRule = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { ruleId } = req.params;
                const updates = req.body;
                const pricingRule = yield this.pricingService.updatePricingRule(ruleId, updates);
                res.json(pricingRule);
            }
            catch (error) {
                console.error('Error in updatePricingRule endpoint:', error);
                if (error.message === 'Pricing rule ID is required' || error.message === 'Failed to update pricing rule') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.deletePricingRule = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { ruleId } = req.params;
                yield this.pricingService.deletePricingRule(ruleId);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error in deletePricingRule endpoint:', error);
                if (error.message === 'Pricing rule ID is required' || error.message === 'Failed to delete pricing rule') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.pricingService = new pricing_service_1.PricingService();
    }
}
exports.PricingController = PricingController;
