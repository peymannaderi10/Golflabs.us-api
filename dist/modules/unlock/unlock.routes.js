"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlockRoutes = void 0;
const express_1 = require("express");
const unlock_controller_1 = require("./unlock.controller");
const unlockRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const unlockController = new unlock_controller_1.UnlockController(socketService);
    router.post('/unlock', unlockController.unlockDoor);
    return router;
};
exports.unlockRoutes = unlockRoutes;
