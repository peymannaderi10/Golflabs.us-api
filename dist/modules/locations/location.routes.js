"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationRoutes = void 0;
const express_1 = require("express");
const location_controller_1 = require("./location.controller");
exports.locationRoutes = (0, express_1.Router)();
const controller = new location_controller_1.LocationController();
// Subdomain resolution (public, must be before /:locationId)
exports.locationRoutes.get('/resolve/:subdomain', controller.resolveSubdomain);
exports.locationRoutes.get('/check-subdomain/:slug', controller.checkSubdomainAvailability);
// Single-location lookup. The list endpoint was removed: tenant resolution
// happens via /resolve/:subdomain so the browser only ever sees its own
// tenant's row. Listing every location was a data-leak surface with no
// remaining caller.
exports.locationRoutes.get('/:locationId', controller.getLocationById);
