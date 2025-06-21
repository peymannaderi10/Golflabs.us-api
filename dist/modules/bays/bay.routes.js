"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bayRoutes = void 0;
const express_1 = require("express");
const bay_controller_1 = require("./bay.controller");
exports.bayRoutes = (0, express_1.Router)();
const controller = new bay_controller_1.BayController();
// Bay routes
exports.bayRoutes.get('/', controller.getBays);
