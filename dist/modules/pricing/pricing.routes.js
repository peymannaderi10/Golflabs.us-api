"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingRoutes = void 0;
const express_1 = require("express");
const pricing_controller_1 = require("./pricing.controller");
exports.pricingRoutes = (0, express_1.Router)();
const controller = new pricing_controller_1.PricingController();
// Pricing routes
exports.pricingRoutes.get('/pricing-rules', controller.getPricingRules);
