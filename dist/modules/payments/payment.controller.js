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
exports.PaymentController = void 0;
const payment_service_1 = require("./payment.service");
class PaymentController {
    constructor() {
        this.createPaymentIntent = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { amount, promotionId, discountAmount, freeMinutes, originalAmount } = req.body;
                // Build promotion info if a promotion is being applied
                const promotionInfo = promotionId ? {
                    promotionId,
                    discountAmount: discountAmount || 0,
                    freeMinutes: freeMinutes || 0,
                    originalAmount: originalAmount || (amount / 100)
                } : undefined;
                const result = yield this.paymentService.createPaymentIntent(bookingId, amount, promotionInfo);
                res.json(result);
            }
            catch (error) {
                console.error(`Error in /bookings/${req.params.bookingId}/create-payment-intent:`, error);
                if (error.message === 'Booking not found.') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message.includes('cannot be paid for')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message === 'Booking reservation has expired.') {
                    return res.status(410).json({ error: error.message });
                }
                res.status(500).json({ error: error.message });
            }
        });
        this.updatePaymentIntent = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.paymentService.updatePaymentIntent(req.body);
                res.json(result);
            }
            catch (error) {
                console.error('Error updating payment intent:', error);
                res.status(500).json({
                    error: 'Failed to update payment intent',
                    details: error.message
                });
            }
        });
        this.getPaymentIntentStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const paymentIntentId = req.query.payment_intent;
                const result = yield this.paymentService.getPaymentIntentStatus(paymentIntentId);
                res.json(result);
            }
            catch (error) {
                console.error("Error retrieving payment intent:", error);
                if (error.message === "Payment Intent ID is required") {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: "Failed to retrieve payment intent status" });
            }
        });
        this.getSetupIntentStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const setupIntentId = req.query.setup_intent;
                const result = yield this.paymentService.getSetupIntentStatus(setupIntentId);
                res.json(result);
            }
            catch (error) {
                console.error('Error retrieving setup intent:', error);
                if (error.message === 'Setup Intent ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'Failed to retrieve setup intent status' });
            }
        });
        this.calculatePrice = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, startTime, endTime } = req.body;
                const result = yield this.paymentService.calculatePrice(locationId, startTime, endTime);
                res.json(result);
            }
            catch (error) {
                console.error('Error in /calculate-price:', error);
                if (error.message.includes('required')) {
                    return res.status(400).json({ error: error.message });
                }
                if (error.message.includes('Invalid')) {
                    return res.status(400).json({ error: error.message });
                }
                if (error.message.includes('No pricing rules found')) {
                    return res.status(404).json({ error: error.message });
                }
                res.status(500).json({ error: 'Failed to calculate price', details: error.message });
            }
        });
        this.paymentService = new payment_service_1.PaymentService();
    }
}
exports.PaymentController = PaymentController;
