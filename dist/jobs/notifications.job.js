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
exports.dispatchNotifications = dispatchNotifications;
const email_service_1 = require("../modules/email/email.service");
/**
 * Dispatch pending email notifications
 * This function is called by the scheduler to process and send queued emails
 */
function dispatchNotifications() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const dispatched = yield email_service_1.EmailService.dispatchPendingNotifications();
            if (dispatched > 0) {
                console.log(`[Notification Job] Dispatched ${dispatched} notifications`);
            }
        }
        catch (error) {
            console.error('[Notification Job] Error dispatching notifications:', error);
        }
    });
}
