"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationRoutes = void 0;
const express_1 = require("express");
const location_controller_1 = require("./location.controller");
exports.locationRoutes = (0, express_1.Router)();
const controller = new location_controller_1.LocationController();
// Location routes
exports.locationRoutes.get('/', controller.getAllLocations);
exports.locationRoutes.get('/:locationId', controller.getLocationById);
