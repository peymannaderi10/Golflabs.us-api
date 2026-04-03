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
const error_utils_1 = require("../../shared/utils/error.utils");
const logger_1 = require("../../shared/utils/logger");
class AgreementController {
    constructor() {
        this.acceptAgreements = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const { signerName, signerEmail, bookingId, locationId, agreements, documentHashes, } = req.body;
                if (!userId || !bookingId || !locationId || !agreements) {
                    return res.status(400).json({
                        error: 'bookingId, locationId, and agreements are required',
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
                const ipAddress = ((_c = (_b = req.headers['x-forwarded-for']) === null || _b === void 0 ? void 0 : _b.split(',')[0]) === null || _c === void 0 ? void 0 : _c.trim()) ||
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
                logger_1.logger.error({ err: error }, 'Error accepting agreements');
                if (error.message.includes('Missing required')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.checkAgreements = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { bookingId } = req.params;
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!bookingId || !userId) {
                    return res.status(400).json({
                        error: 'bookingId (param) is required and user must be authenticated',
                    });
                }
                const result = yield agreement_service_1.agreementService.checkAgreements(userId, bookingId);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error checking agreements');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
    }
}
exports.AgreementController = AgreementController;
exports.agreementController = new AgreementController();
