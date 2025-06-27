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
exports.BayService = void 0;
const database_1 = require("../../config/database");
class BayService {
    getBaysByLocationId(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('bays')
                .select('id, status, location_id, bay_number, name')
                .eq('location_id', locationId);
            if (error) {
                console.error('Error fetching bays:', error);
                throw new Error('Failed to fetch bays');
            }
            return data;
        });
    }
    updateBayHeartbeat(bayId, kioskIp) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!bayId) {
                throw new Error('Bay ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('bays')
                .update({
                last_seen: new Date().toISOString(),
                kiosk_ip: kioskIp
            })
                .eq('id', bayId)
                .select('id, last_seen, kiosk_ip')
                .single();
            if (error) {
                console.error('Error updating bay heartbeat:', error);
                throw new Error('Failed to update bay heartbeat');
            }
            if (!data) {
                throw new Error(`Bay with ID ${bayId} not found.`);
            }
            return data;
        });
    }
}
exports.BayService = BayService;
