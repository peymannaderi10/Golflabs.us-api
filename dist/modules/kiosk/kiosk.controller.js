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
exports.KioskController = void 0;
const zod_1 = require("zod");
const kiosk_types_1 = require("./kiosk.types");
const logger_1 = require("../../shared/utils/logger");
function handleError(error, res, context) {
    var _a;
    if (error instanceof zod_1.ZodError) {
        return res.status(400).json({
            success: false,
            error: ((_a = error.issues[0]) === null || _a === void 0 ? void 0 : _a.message) || 'Invalid input',
        });
    }
    if (error instanceof kiosk_types_1.KioskError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    logger_1.logger.error({ err: error, context }, 'Unexpected error in kiosk controller');
    return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
}
function requireOwnerOrAdmin(req, res) {
    var _a;
    const role = (_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.clientRole;
    if (role !== 'owner' && role !== 'admin') {
        res.status(403).json({ success: false, error: 'Only owners or admins can manage kiosks' });
        return false;
    }
    return true;
}
class KioskController {
    constructor(service) {
        this.service = service;
        // -------- kiosk-authenticated --------
        /** GET /kiosk/locations/:locationId/spaces */
        this.listUnclaimedSpaces = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.service.listUnclaimedSpacesForLocation(req.params.locationId);
                res.json({ success: true, data: result });
            }
            catch (error) {
                handleError(error, res, 'kiosk.listUnclaimedSpaces');
            }
        });
        /** POST /kiosk/register */
        this.register = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const parsed = kiosk_types_1.registerKioskSchema.parse(req.body);
                const settings = yield this.service.registerKiosk(parsed);
                res.status(201).json({ success: true, data: settings });
            }
            catch (error) {
                handleError(error, res, 'kiosk.register');
            }
        });
        /** GET /kiosk/settings/:installationId */
        this.getSettingsByInstallation = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const authReq = req;
                const boundInstallationId = authReq.kioskInstallationId;
                if (!boundInstallationId) {
                    return res.status(401).json({
                        success: false,
                        error: 'X-Kiosk-Installation-Id header required',
                    });
                }
                if (boundInstallationId !== req.params.installationId) {
                    logger_1.logger.warn({ bound: boundInstallationId, requested: req.params.installationId }, 'Kiosk attempted to fetch settings for a different installation');
                    return res.status(403).json({
                        success: false,
                        error: 'Installation id mismatch',
                    });
                }
                const settings = yield this.service.getSettingsByInstallation(req.params.installationId);
                res.json({ success: true, data: settings });
            }
            catch (error) {
                handleError(error, res, 'kiosk.getSettingsByInstallation');
            }
        });
        // -------- employee-authenticated --------
        /** GET /kiosk/by-space/:spaceId */
        this.getSettingsBySpace = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const settings = yield this.service.getSettingsBySpace(req.params.spaceId);
                res.json({ success: true, data: settings });
            }
            catch (error) {
                handleError(error, res, 'kiosk.getSettingsBySpace');
            }
        });
        /** PATCH /kiosk/by-space/:spaceId */
        this.updateSettings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!requireOwnerOrAdmin(req, res))
                    return;
                const parsed = kiosk_types_1.updateKioskSettingsSchema.parse(req.body);
                const settings = yield this.service.updateSettings(req.params.spaceId, parsed);
                res.json({ success: true, data: settings });
            }
            catch (error) {
                handleError(error, res, 'kiosk.updateSettings');
            }
        });
        /** POST /kiosk/by-space/:spaceId/restart */
        this.restart = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!requireOwnerOrAdmin(req, res))
                    return;
                const parsed = kiosk_types_1.restartKioskSchema.parse(req.body);
                yield this.service.triggerRestart(req.params.spaceId, parsed === null || parsed === void 0 ? void 0 : parsed.reason);
                res.json({ success: true, data: { ok: true } });
            }
            catch (error) {
                handleError(error, res, 'kiosk.restart');
            }
        });
        /** POST /kiosk/by-space/:spaceId/clear-installation */
        this.clearInstallation = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!requireOwnerOrAdmin(req, res))
                    return;
                const settings = yield this.service.clearInstallation(req.params.spaceId);
                res.json({ success: true, data: settings });
            }
            catch (error) {
                handleError(error, res, 'kiosk.clearInstallation');
            }
        });
    }
}
exports.KioskController = KioskController;
