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
exports.BayController = void 0;
const bay_service_1 = require("./bay.service");
const error_utils_1 = require("../../shared/utils/error.utils");
class BayController {
    constructor(socketService) {
        this.getBays = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const locationId = req.query.locationId;
                const bays = yield this.bayService.getBaysByLocationId(locationId);
                res.status(200).json(bays);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.createBay = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, name, bayNumber, equipment } = req.body;
                if (!locationId || !name || bayNumber === undefined) {
                    return res.status(400).json({ message: 'locationId, name, and bayNumber are required' });
                }
                const bay = yield this.bayService.createBay(locationId, name, bayNumber, equipment);
                // Broadcast to dashboards
                if (this.socketService) {
                    this.socketService.broadcastBayCreated(locationId, bay);
                }
                res.status(201).json(bay);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.deleteBay = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { bayId } = req.params;
                if (!bayId) {
                    return res.status(400).json({ message: 'bayId is required' });
                }
                const bayLocationId = yield this.bayService.getBayLocationId(bayId);
                if (!bayLocationId)
                    return res.status(404).json({ message: 'Bay not found' });
                if (bayLocationId !== ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.location_id)) {
                    return res.status(403).json({ message: 'Access denied: bay belongs to a different location' });
                }
                const result = yield this.bayService.deleteBay(bayId);
                // Broadcast to dashboards
                if (this.socketService && result.locationId) {
                    this.socketService.broadcastBayDeleted(result.locationId, bayId);
                }
                res.status(200).json({ success: true });
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.updateHeartbeat = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bayId } = req.params;
                const kioskIp = req.ip;
                const updatedBay = yield this.bayService.updateBayHeartbeat(bayId, kioskIp);
                // Broadcast heartbeat to dashboards so they can update online status
                if (this.socketService && updatedBay.location_id) {
                    this.socketService.broadcastBayUpdate(updatedBay.location_id, updatedBay);
                }
                res.status(200).json(updatedBay);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // Add: Update bay status
        this.updateBayStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { bayId } = req.params;
                const { status } = req.body;
                if (!status) {
                    return res.status(400).json({ message: 'Status is required' });
                }
                const bayLocationId = yield this.bayService.getBayLocationId(bayId);
                if (!bayLocationId)
                    return res.status(404).json({ message: 'Bay not found' });
                if (bayLocationId !== ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.location_id)) {
                    return res.status(403).json({ message: 'Access denied: bay belongs to a different location' });
                }
                const updatedBay = yield this.bayService.updateBayStatus(bayId, status);
                // Broadcast to dashboards
                if (this.socketService && updatedBay.location_id) {
                    this.socketService.broadcastBayUpdate(updatedBay.location_id, updatedBay);
                }
                res.status(200).json(updatedBay);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // LEAGUE MODE
        // =====================================================
        this.activateLeagueMode = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, leagueId } = req.body;
                if (!locationId || !leagueId) {
                    return res.status(400).json({ message: 'locationId and leagueId are required' });
                }
                const updatedBays = yield this.bayService.activateLeagueMode(locationId, leagueId);
                // Broadcast to kiosks
                if (this.socketService) {
                    this.socketService.broadcastToLocation(locationId, 'league_mode_changed', {
                        active: true,
                        leagueId,
                        locationId,
                    });
                }
                res.status(200).json({ message: 'League mode activated', bays: updatedBays });
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.deactivateLeagueMode = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.body;
                if (!locationId) {
                    return res.status(400).json({ message: 'locationId is required' });
                }
                const updatedBays = yield this.bayService.deactivateLeagueMode(locationId);
                // Broadcast to kiosks
                if (this.socketService) {
                    this.socketService.broadcastToLocation(locationId, 'league_mode_changed', {
                        active: false,
                        leagueId: null,
                        locationId,
                    });
                }
                res.status(200).json({ message: 'League mode deactivated', bays: updatedBays });
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.toggleBayLeagueMode = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { bayId } = req.params;
                const { active, leagueId } = req.body;
                if (active === undefined) {
                    return res.status(400).json({ message: 'active is required' });
                }
                const bayLocationId = yield this.bayService.getBayLocationId(bayId);
                if (!bayLocationId)
                    return res.status(404).json({ message: 'Bay not found' });
                if (bayLocationId !== ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.location_id)) {
                    return res.status(403).json({ message: 'Access denied: bay belongs to a different location' });
                }
                const updatedBay = yield this.bayService.toggleBayLeagueMode(bayId, active, leagueId || null);
                // Broadcast to the specific kiosk
                if (this.socketService) {
                    this.socketService.broadcastToLocation(updatedBay.location_id, 'league_mode_changed', {
                        active,
                        leagueId: active ? leagueId : null,
                        bayId,
                        locationId: updatedBay.location_id,
                    });
                }
                res.status(200).json(updatedBay);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.bayService = new bay_service_1.BayService();
        this.socketService = socketService || null;
    }
}
exports.BayController = BayController;
