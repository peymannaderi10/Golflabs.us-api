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
exports.LocationController = void 0;
const location_service_1 = require("./location.service");
class LocationController {
    constructor() {
        this.getAllLocations = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const locations = yield this.locationService.getAllLocations();
                res.json(locations);
            }
            catch (error) {
                console.error('Error in /locations endpoint:', error);
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.getLocationById = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.params;
                const location = yield this.locationService.getLocationById(locationId);
                res.json(location);
            }
            catch (error) {
                console.error(`Error in /locations/${req.params.locationId} endpoint:`, error);
                if (error.message === 'Location ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                if (error.message === 'Location not found') {
                    return res.status(404).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.locationService = new location_service_1.LocationService();
    }
}
exports.LocationController = LocationController;
