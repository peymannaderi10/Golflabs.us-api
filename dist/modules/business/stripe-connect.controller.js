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
exports.StripeConnectController = void 0;
const stripe_connect_service_1 = require("./stripe-connect.service");
const logger_1 = require("../../shared/utils/logger");
/**
 * All routes here are mounted under `/business/locations/:locationId/...`
 * with `[authenticateEmployee, enforceLocationScope]`, so by the time these
 * handlers run we know the caller is an authenticated employee with access
 * to the requested location. We additionally require owner/admin role since
 * connecting a Stripe account is a billing-level decision.
 */
function requireOwnerOrAdmin(req, res) {
    var _a;
    const role = (_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.clientRole;
    if (role !== 'owner' && role !== 'admin') {
        res.status(403).json({ success: false, error: 'Only owners or admins can manage Stripe Connect' });
        return false;
    }
    return true;
}
function handleError(error, res, context) {
    if (error instanceof stripe_connect_service_1.StripeConnectError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    logger_1.logger.error({ err: error, context }, 'Unexpected error in stripe-connect controller');
    return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
}
class StripeConnectController {
    constructor() {
        /** GET /business/locations/:locationId/stripe-connect/status */
        this.getStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!requireOwnerOrAdmin(req, res))
                    return;
                const status = yield stripe_connect_service_1.stripeConnectService.getStatus(req.params.locationId);
                res.json({ success: true, data: status });
            }
            catch (error) {
                handleError(error, res, 'stripe-connect.getStatus');
            }
        });
        /**
         * POST /business/locations/:locationId/stripe-connect/onboard
         *
         * Returns `{ url }` — the hosted onboarding link to redirect the user to.
         * Creates the Express account on first call and reuses it on subsequent
         * calls (Stripe lets us mint multiple onboarding links for the same
         * account, useful when an owner abandons partway and returns later).
         */
        this.startOnboarding = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                if (!requireOwnerOrAdmin(req, res))
                    return;
                const ownerEmail = (_a = req.user) === null || _a === void 0 ? void 0 : _a.email;
                if (!ownerEmail) {
                    return res.status(400).json({ success: false, error: 'Authenticated user is missing an email' });
                }
                const accountId = yield stripe_connect_service_1.stripeConnectService.getOrCreateAccount(req.params.locationId, ownerEmail);
                const url = yield stripe_connect_service_1.stripeConnectService.createOnboardingLink(req.params.locationId, accountId);
                res.json({ success: true, data: { url } });
            }
            catch (error) {
                handleError(error, res, 'stripe-connect.startOnboarding');
            }
        });
        /**
         * POST /business/locations/:locationId/stripe-connect/dashboard
         *
         * Returns `{ url }` — a one-time login link into the Stripe Express
         * dashboard. Only valid for accounts whose onboarding has completed
         * (Stripe rejects the request otherwise, which we surface as 409).
         */
        this.openDashboard = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!requireOwnerOrAdmin(req, res))
                    return;
                const status = yield stripe_connect_service_1.stripeConnectService.getStatus(req.params.locationId);
                if (!status.accountId) {
                    return res.status(409).json({ success: false, error: 'No Stripe account connected' });
                }
                const url = yield stripe_connect_service_1.stripeConnectService.createDashboardLink(status.accountId);
                res.json({ success: true, data: { url } });
            }
            catch (error) {
                handleError(error, res, 'stripe-connect.openDashboard');
            }
        });
        /**
         * DELETE /business/locations/:locationId/stripe-connect
         *
         * Detach this location from its current connected account. Used when a
         * franchisee wants to file taxes/payouts under their own LLC instead of
         * inheriting the corporate-shared account. Sibling locations are
         * unaffected — they continue to use the original account.
         */
        this.disconnect = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!requireOwnerOrAdmin(req, res))
                    return;
                const status = yield stripe_connect_service_1.stripeConnectService.disconnectLocation(req.params.locationId);
                res.json({ success: true, data: status });
            }
            catch (error) {
                handleError(error, res, 'stripe-connect.disconnect');
            }
        });
        /**
         * POST /business/locations/:locationId/stripe-connect/refresh
         *
         * Force-pulls the latest account state from Stripe and updates the cache.
         * Used when the owner returns from hosted onboarding before the
         * `account.updated` webhook has landed.
         */
        this.refreshStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!requireOwnerOrAdmin(req, res))
                    return;
                const status = yield stripe_connect_service_1.stripeConnectService.refreshStatusForLocation(req.params.locationId);
                res.json({ success: true, data: status });
            }
            catch (error) {
                handleError(error, res, 'stripe-connect.refreshStatus');
            }
        });
    }
}
exports.StripeConnectController = StripeConnectController;
