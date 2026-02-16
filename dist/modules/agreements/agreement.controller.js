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
exports.agreementController = exports.AgreementController = void 0;
const agreement_service_1 = require("./agreement.service");
class AgreementController {
    constructor() {
        this.acceptAgreements = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const { userId, signerName, signerEmail, bookingId, locationId, agreements, documentHashes, } = req.body;
                if (!userId || !bookingId || !locationId || !agreements) {
                    return res.status(400).json({
                        error: 'userId, bookingId, locationId, and agreements are required',
                    });
                }
                if (!signerName || !signerEmail) {
                    return res.status(400).json({
                        error: 'signerName and signerEmail are required for consent records',
                    });
                }
                if (!Array.isArray(agreements) || agreements.length === 0) {
                    return res.status(400).json({
                        error: 'agreements must be a non-empty array of agreement types',
                    });
                }
                if (!documentHashes || typeof documentHashes !== 'object') {
                    return res.status(400).json({
                        error: 'documentHashes must be an object mapping agreement types to SHA-256 hashes',
                    });
                }
                const ipAddress = ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim()) ||
                    req.socket.remoteAddress ||
                    undefined;
                const userAgent = req.headers['user-agent'] || undefined;
                const result = yield agreement_service_1.agreementService.recordAgreements({
                    userId,
                    signerName,
                    signerEmail,
                    bookingId,
                    locationId,
                    agreements,
                    documentHashes,
                    ipAddress,
                    userAgent,
                });
                res.status(201).json({
                    success: true,
                    alreadyRecorded: result.alreadyRecorded,
                    count: result.count,
                });
            }
            catch (error) {
                console.error('Error accepting agreements:', error);
                if (error.message.includes('Missing required')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: error.message || 'Failed to record agreements' });
            }
        });
        this.checkAgreements = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { userId } = req.query;
                if (!bookingId || !userId) {
                    return res.status(400).json({
                        error: 'bookingId (param) and userId (query) are required',
                    });
                }
                const result = yield agreement_service_1.agreementService.checkAgreements(userId, bookingId);
                res.json(result);
            }
            catch (error) {
                console.error('Error checking agreements:', error);
                res.status(500).json({ error: error.message || 'Failed to check agreements' });
            }
        });
    }
}
exports.AgreementController = AgreementController;
exports.agreementController = new AgreementController();
