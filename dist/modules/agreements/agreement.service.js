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
exports.agreementService = exports.AgreementService = void 0;
const crypto_1 = require("crypto");
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
const REQUIRED_AGREEMENT_TYPES = [
    'terms_of_service',
    'privacy_policy',
    'liability_waiver',
    'damage_fees_acknowledgment',
];
const CURRENT_AGREEMENT_VERSION = '1.0';
class AgreementService {
    recordAgreements(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { userId, signerName, signerEmail, bookingId, locationId, agreements, documentHashes, ipAddress, userAgent, } = params;
            if (!bookingId || !locationId) {
                throw new Error('bookingId and locationId are required');
            }
            if (!signerName || !signerEmail) {
                throw new Error('signerName and signerEmail are required for consent records');
            }
            // Validate that all required agreement types are included
            const missingAgreements = REQUIRED_AGREEMENT_TYPES.filter((type) => !agreements.includes(type));
            if (missingAgreements.length > 0) {
                throw new Error(`Missing required agreements: ${missingAgreements.join(', ')}`);
            }
            // Validate that document hashes are provided for each agreement
            const missingHashes = agreements.filter((type) => !documentHashes[type]);
            if (missingHashes.length > 0) {
                throw new Error(`Missing document hashes for: ${missingHashes.join(', ')}`);
            }
            // Check if agreements already exist for this booking (scoped by booking_id only)
            let existingQuery = database_1.supabase
                .from('user_agreements')
                .select('agreement_type')
                .eq('booking_id', bookingId);
            if (userId)
                existingQuery = existingQuery.eq('user_id', userId);
            const { data: existing, error: checkError } = yield existingQuery;
            if (checkError) {
                logger_1.logger.error({ err: checkError }, 'Error checking existing agreements');
                throw new Error('Failed to check existing agreements');
            }
            if (existing && existing.length >= REQUIRED_AGREEMENT_TYPES.length) {
                return { alreadyRecorded: true, count: existing.length };
            }
            // Build rows for insertion
            const now = new Date().toISOString();
            const rows = agreements.map((agreementType) => ({
                user_id: userId,
                signer_name: signerName,
                signer_email: signerEmail,
                booking_id: bookingId,
                location_id: locationId,
                agreement_type: agreementType,
                agreement_version: CURRENT_AGREEMENT_VERSION,
                document_hash: documentHashes[agreementType],
                accepted_at: now,
                ip_address: ipAddress || null,
                user_agent: userAgent || null,
            }));
            const { data, error } = yield database_1.supabase
                .from('user_agreements')
                .insert(rows)
                .select();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error recording agreements');
                throw new Error('Failed to record agreements');
            }
            logger_1.logger.info({ count: data.length, signerName, signerEmail, bookingId }, 'Recorded agreements');
            return { alreadyRecorded: false, count: data.length };
        });
    }
    checkAgreements(userId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId || !bookingId) {
                throw new Error('userId and bookingId are required');
            }
            const { data, error } = yield database_1.supabase
                .from('user_agreements')
                .select('agreement_type, agreement_version, document_hash, accepted_at, signer_name, signer_email')
                .eq('booking_id', bookingId)
                .eq('user_id', userId);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error checking agreements');
                throw new Error('Failed to check agreements');
            }
            const acceptedTypes = (data || []).map((row) => row.agreement_type);
            const allAccepted = REQUIRED_AGREEMENT_TYPES.every((type) => acceptedTypes.includes(type));
            return {
                allAccepted,
                accepted: data || [],
                missing: REQUIRED_AGREEMENT_TYPES.filter((type) => !acceptedTypes.includes(type)),
            };
        });
    }
    getBookingLocationId(bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data } = yield database_1.supabase
                .from('bookings')
                .select('location_id')
                .eq('id', bookingId)
                .single();
            return (_a = data === null || data === void 0 ? void 0 : data.location_id) !== null && _a !== void 0 ? _a : null;
        });
    }
    getBookingAgreements(bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!bookingId) {
                throw new Error('bookingId is required');
            }
            const { data, error } = yield database_1.supabase
                .from('user_agreements')
                .select('agreement_type, agreement_version, document_hash, accepted_at, signer_name, signer_email, ip_address, user_agent')
                .eq('booking_id', bookingId)
                .order('accepted_at', { ascending: true });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching booking agreements');
                throw new Error('Failed to fetch booking agreements');
            }
            return data || [];
        });
    }
    /**
     * Utility: compute SHA-256 hash of document text.
     * Used server-side to verify hashes sent from the client.
     */
    static hashDocument(text) {
        return (0, crypto_1.createHash)('sha256').update(text, 'utf8').digest('hex');
    }
}
exports.AgreementService = AgreementService;
exports.agreementService = new AgreementService();
