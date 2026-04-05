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
exports.SpaceController = void 0;
const space_service_1 = require("./space.service");
const error_utils_1 = require("../../shared/utils/error.utils");
class SpaceController {
    constructor(socketService) {
        this.getSpaces = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const locationId = req.query.locationId;
                const spaces = yield this.spaceService.getSpacesByLocationId(locationId);
                res.status(200).json(spaces);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.createSpace = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, name, spaceNumber, equipment } = req.body;
                if (!locationId || !name || spaceNumber === undefined) {
                    return res.status(400).json({ message: 'locationId, name, and spaceNumber are required' });
                }
                const space = yield this.spaceService.createSpace(locationId, name, spaceNumber, equipment);
                // Broadcast to dashboards
                if (this.socketService) {
                    this.socketService.broadcastSpaceCreated(locationId, space);
                }
                res.status(201).json(space);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.deleteSpace = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { spaceId } = req.params;
                if (!spaceId) {
                    return res.status(400).json({ message: 'spaceId is required' });
                }
                const spaceLocationId = yield this.spaceService.getSpaceLocationId(spaceId);
                if (!spaceLocationId)
                    return res.status(404).json({ message: 'Space not found' });
                if (spaceLocationId !== ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.location_id)) {
                    return res.status(403).json({ message: 'Access denied: space belongs to a different location' });
                }
                const result = yield this.spaceService.deleteSpace(spaceId);
                // Broadcast to dashboards
                if (this.socketService && result.locationId) {
                    this.socketService.broadcastSpaceDeleted(result.locationId, spaceId);
                }
                res.status(200).json({ success: true });
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.updateHeartbeat = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { spaceId } = req.params;
                const kioskIp = req.ip;
                const updatedSpace = yield this.spaceService.updateSpaceHeartbeat(spaceId, kioskIp);
                // Broadcast heartbeat to dashboards so they can update online status
                if (this.socketService && updatedSpace.location_id) {
                    this.socketService.broadcastSpaceUpdate(updatedSpace.location_id, updatedSpace);
                }
                res.status(200).json(updatedSpace);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // Add: Update space status
        this.updateSpaceStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { spaceId } = req.params;
                const { status } = req.body;
                if (!status) {
                    return res.status(400).json({ message: 'Status is required' });
                }
                const spaceLocationId = yield this.spaceService.getSpaceLocationId(spaceId);
                if (!spaceLocationId)
                    return res.status(404).json({ message: 'Space not found' });
                if (spaceLocationId !== ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.location_id)) {
                    return res.status(403).json({ message: 'Access denied: space belongs to a different location' });
                }
                const updatedSpace = yield this.spaceService.updateSpaceStatus(spaceId, status);
                // Broadcast to dashboards
                if (this.socketService && updatedSpace.location_id) {
                    this.socketService.broadcastSpaceUpdate(updatedSpace.location_id, updatedSpace);
                }
                res.status(200).json(updatedSpace);
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
                const updatedSpaces = yield this.spaceService.activateLeagueMode(locationId, leagueId);
                // Broadcast to kiosks
                if (this.socketService) {
                    this.socketService.broadcastToLocation(locationId, 'league_mode_changed', {
                        active: true,
                        leagueId,
                        locationId,
                    });
                }
                res.status(200).json({ message: 'League mode activated', spaces: updatedSpaces });
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
                const updatedSpaces = yield this.spaceService.deactivateLeagueMode(locationId);
                // Broadcast to kiosks
                if (this.socketService) {
                    this.socketService.broadcastToLocation(locationId, 'league_mode_changed', {
                        active: false,
                        leagueId: null,
                        locationId,
                    });
                }
                res.status(200).json({ message: 'League mode deactivated', spaces: updatedSpaces });
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.toggleSpaceLeagueMode = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { spaceId } = req.params;
                const { active, leagueId } = req.body;
                if (active === undefined) {
                    return res.status(400).json({ message: 'active is required' });
                }
                const spaceLocationId = yield this.spaceService.getSpaceLocationId(spaceId);
                if (!spaceLocationId)
                    return res.status(404).json({ message: 'Space not found' });
                if (spaceLocationId !== ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.location_id)) {
                    return res.status(403).json({ message: 'Access denied: space belongs to a different location' });
                }
                const updatedSpace = yield this.spaceService.toggleSpaceLeagueMode(spaceId, active, leagueId || null);
                // Broadcast to the specific kiosk
                if (this.socketService) {
                    this.socketService.broadcastToLocation(updatedSpace.location_id, 'league_mode_changed', {
                        active,
                        leagueId: active ? leagueId : null,
                        spaceId,
                        locationId: updatedSpace.location_id,
                    });
                }
                res.status(200).json(updatedSpace);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.spaceService = new space_service_1.SpaceService();
        this.socketService = socketService || null;
    }
}
exports.SpaceController = SpaceController;
