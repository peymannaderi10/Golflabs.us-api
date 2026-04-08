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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationController = void 0;
const location_service_1 = require("./location.service");
const logger_1 = require("../../shared/utils/logger");
class LocationController {
    constructor() {
        this.getLocationById = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.params;
                const location = yield this.locationService.getLocationById(locationId);
                res.json(location);
            }
            catch (error) {
                logger_1.logger.error({ err: error, locationId: req.params.locationId }, 'Error in get location endpoint');
                if (error.message === 'Location ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                if (error.message === 'Location not found') {
                    return res.status(404).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.getAccessibleLocations = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const authReq = req;
                const profile = authReq.employeeProfile;
                const accessibleIds = (_a = profile === null || profile === void 0 ? void 0 : profile.accessibleLocationIds) !== null && _a !== void 0 ? _a : [];
                if (accessibleIds.length === 0) {
                    return res.json({ locations: [], preferredLocationId: null });
                }
                const locations = yield this.locationService.getAccessibleLocations(accessibleIds);
                // Server-side default: user_profiles.location_id is the authoritative
                // "default workspace" set by the signup RPC. We only honour it if it
                // is still in the accessible set (defends against stale references
                // after a location is removed from the user's permissions).
                const preferredLocationId = (profile === null || profile === void 0 ? void 0 : profile.location_id) && accessibleIds.includes(profile.location_id)
                    ? profile.location_id
                    : null;
                res.json({ locations, preferredLocationId });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching accessible locations');
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.resolveSubdomain = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { subdomain } = req.params;
                if (!subdomain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain) || subdomain.length < 3 || subdomain.length > 63) {
                    return res.status(400).json({ error: 'Invalid subdomain' });
                }
                const location = yield this.locationService.resolveBySubdomain(subdomain);
                if (!location) {
                    return res.status(404).json({ error: 'Location not found for this subdomain' });
                }
                // Include all sibling locations under the same client so customers
                // on multi-location tenants can switch between them from the booking
                // page. Falls back to a single-element array if no clientId is set.
                const siblings = location.clientId
                    ? yield this.locationService.getLocationsByClient(location.clientId)
                    : [location];
                // Strip employee/admin-only fields before responding to this PUBLIC,
                // unauthenticated endpoint. The customer-facing booking SPA does not
                // need (and should not see) the merchant's Stripe Connect account id,
                // its connect-status flags, billing plan, or internal client id.
                // The employee dashboard fetches the same locations through
                // `/locations/accessible` which keeps these fields intact.
                const stripPrivate = (loc) => {
                    const { stripeConnect: _s, clientId: _c, plan: _p } = loc, rest = __rest(loc, ["stripeConnect", "clientId", "plan"]);
                    return rest;
                };
                res.json(Object.assign(Object.assign({}, stripPrivate(location)), { siblings: siblings.map(stripPrivate) }));
            }
            catch (error) {
                logger_1.logger.error({ err: error, subdomain: req.params.subdomain }, 'Error resolving subdomain');
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.checkSubdomainAvailability = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { slug } = req.params;
                const excludeLocationId = req.query.excludeLocationId;
                const result = yield this.locationService.isSubdomainAvailable(slug, excludeLocationId);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error checking subdomain availability');
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.updateLocation = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.params;
                const { salesTaxRate, timezone, status, phone } = req.body;
                const updates = {};
                if (salesTaxRate !== undefined)
                    updates.sales_tax_rate = salesTaxRate;
                if (timezone !== undefined)
                    updates.timezone = timezone;
                if (status !== undefined)
                    updates.status = status;
                if (phone !== undefined)
                    updates.phone = phone;
                const location = yield this.locationService.updateLocation(locationId, updates);
                res.json(location);
            }
            catch (error) {
                logger_1.logger.error({ err: error, locationId: req.params.locationId }, 'Error updating location');
                if (error.message === 'Location ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                if (error.message === 'Location not found' || error.message === 'Failed to update location') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.locationService = new location_service_1.LocationService();
    }
}
exports.LocationController = LocationController;
