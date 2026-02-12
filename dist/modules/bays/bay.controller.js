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
class BayController {
    constructor(socketService) {
        this.getBays = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const locationId = req.query.locationId;
                const bays = yield this.bayService.getBaysByLocationId(locationId);
                res.status(200).json(bays);
            }
            catch (error) {
                res.status(500).json({ message: error.message });
            }
        });
        this.updateHeartbeat = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bayId } = req.params;
                const kioskIp = req.ip;
                const updatedBay = yield this.bayService.updateBayHeartbeat(bayId, kioskIp);
                res.status(200).json(updatedBay);
            }
            catch (error) {
                res.status(500).json({ message: error.message });
            }
        });
        // Add: Update bay status
        this.updateBayStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bayId } = req.params;
                const { status } = req.body;
                if (!status) {
                    return res.status(400).json({ message: 'Status is required' });
                }
                const updatedBay = yield this.bayService.updateBayStatus(bayId, status);
                res.status(200).json(updatedBay);
            }
            catch (error) {
                res.status(500).json({ message: error.message });
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
                res.status(500).json({ message: error.message });
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
                res.status(500).json({ message: error.message });
            }
        });
        this.toggleBayLeagueMode = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bayId } = req.params;
                const { active, leagueId } = req.body;
                if (active === undefined) {
                    return res.status(400).json({ message: 'active is required' });
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
                res.status(500).json({ message: error.message });
            }
        });
        this.bayService = new bay_service_1.BayService();
        this.socketService = socketService || null;
    }
}
exports.BayController = BayController;
