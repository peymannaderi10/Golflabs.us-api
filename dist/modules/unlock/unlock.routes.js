"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlockRoutes = void 0;
const express_1 = require("express");
const unlock_controller_1 = require("./unlock.controller");
const auth_1 = require("../auth");
const unlockRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const unlockController = new unlock_controller_1.UnlockController(socketService);
    // Customer unlock via token
    router.post('/unlock', unlockController.unlockDoor);
    // Employee unlock - tries first available bay
    router.post('/employee-unlock', auth_1.authenticateEmployee, unlockController.employeeUnlock);
    return router;
};
exports.unlockRoutes = unlockRoutes;
