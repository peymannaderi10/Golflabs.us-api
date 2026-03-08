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
exports.MembershipController = void 0;
const membership_service_1 = require("./membership.service");
const error_utils_1 = require("../../shared/utils/error.utils");
class MembershipController {
    constructor() {
        this.service = new membership_service_1.MembershipService();
        // =====================================================
        // PUBLIC / CUSTOMER
        // =====================================================
        this.getPlans = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                if (!locationId)
                    return res.status(400).json({ error: 'locationId is required' });
                const plans = yield this.service.getPlansForLocation(locationId);
                res.json(plans);
            }
            catch (error) {
                console.error('Error fetching membership plans:', error);
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getMyMembership = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const { locationId } = req.query;
                if (!userId || !locationId)
                    return res.status(400).json({ error: 'locationId is required' });
                const membership = yield this.service.getUserMembership(userId, locationId);
                res.json({ membership });
            }
            catch (error) {
                console.error('Error fetching user membership:', error);
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.subscribe = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!userId)
                    return res.status(401).json({ error: 'Not authenticated' });
                const { planId, billingInterval } = req.body;
                if (!planId || !billingInterval) {
                    return res.status(400).json({ error: 'planId and billingInterval are required' });
                }
                if (!['monthly', 'annual'].includes(billingInterval)) {
                    return res.status(400).json({ error: 'billingInterval must be monthly or annual' });
                }
                const result = yield this.service.subscribe(userId, planId, billingInterval);
                res.json(result);
            }
            catch (error) {
                console.error('Error subscribing:', error);
                if ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('already have')) {
                    return res.status(409).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.cancel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!userId)
                    return res.status(401).json({ error: 'Not authenticated' });
                const { membershipId } = req.params;
                const { immediate } = req.body || {};
                const result = yield this.service.cancelMembership(membershipId, userId, !!immediate);
                if (immediate) {
                    const refundDollars = result.refundAmount ? (result.refundAmount / 100).toFixed(2) : '0.00';
                    res.json({
                        success: true,
                        message: `Membership canceled immediately. Refund of $${refundDollars} issued.`,
                        refundAmount: result.refundAmount || 0,
                    });
                }
                else {
                    res.json({ success: true, message: 'Membership will be canceled at the end of the billing period' });
                }
            }
            catch (error) {
                console.error('Error canceling membership:', error);
                if (error.message === 'Access denied')
                    return res.status(403).json({ error: error.message });
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.changePlan = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!userId)
                    return res.status(401).json({ error: 'Not authenticated' });
                const { membershipId } = req.params;
                const { newPlanId } = req.body;
                if (!newPlanId)
                    return res.status(400).json({ error: 'newPlanId is required' });
                yield this.service.changePlan(membershipId, userId, newPlanId);
                res.json({ success: true, message: 'Plan changed successfully' });
            }
            catch (error) {
                console.error('Error changing plan:', error);
                if (error.message === 'Access denied')
                    return res.status(403).json({ error: error.message });
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // EMPLOYEE
        // =====================================================
        this.createPlan = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const plan = yield this.service.createPlan(req.body);
                res.status(201).json(plan);
            }
            catch (error) {
                console.error('Error creating plan:', error);
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.updatePlan = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { planId } = req.params;
                const plan = yield this.service.updatePlan(planId, req.body);
                res.json(plan);
            }
            catch (error) {
                console.error('Error updating plan:', error);
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.deactivatePlan = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { planId } = req.params;
                yield this.service.deactivatePlan(planId);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error deactivating plan:', error);
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getSubscribers = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                if (!locationId)
                    return res.status(400).json({ error: 'locationId is required' });
                const subscribers = yield this.service.getSubscribersForLocation(locationId);
                res.json(subscribers);
            }
            catch (error) {
                console.error('Error fetching subscribers:', error);
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // LOCATION SETTINGS
        // =====================================================
        this.getLocationSettings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.params;
                const settings = yield this.service.getLocationMembershipSettings(locationId);
                res.json(settings);
            }
            catch (error) {
                console.error('Error fetching location membership settings:', error);
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.updateLocationSettings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.params;
                yield this.service.updateLocationMembershipSettings(locationId, req.body);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error updating location membership settings:', error);
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
    }
}
exports.MembershipController = MembershipController;
