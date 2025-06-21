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
    constructor() {
        this.getBays = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                const bays = yield this.bayService.getBaysByLocationId(locationId);
                res.json(bays);
            }
            catch (error) {
                console.error('Error in /bays endpoint:', error);
                if (error.message === 'Location ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.bayService = new bay_service_1.BayService();
    }
}
exports.BayController = BayController;
