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
exports.processScheduledCampaigns = processScheduledCampaigns;
const marketing_service_1 = require("../modules/marketing/marketing.service");
function processScheduledCampaigns() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const sent = yield marketing_service_1.MarketingService.sendDueScheduledCampaigns();
            if (sent > 0) {
                console.log(`Marketing scheduler: sent ${sent} scheduled campaign(s)`);
            }
        }
        catch (error) {
            console.error('Marketing scheduler error:', error);
        }
    });
}
