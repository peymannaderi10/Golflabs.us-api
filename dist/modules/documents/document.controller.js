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
exports.documentController = void 0;
const document_service_1 = require("./document.service");
const error_utils_1 = require("../../shared/utils/error.utils");
const logger_1 = require("../../shared/utils/logger");
class DocumentController {
    getActiveDocuments(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const locationId = req.query.locationId;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const documents = yield document_service_1.documentService.getActiveDocuments(locationId);
                if (!documents) {
                    return res.status(404).json({ success: false, error: 'Policies not found for this location. Please contact the facility administrator.' });
                }
                res.json({ success: true, data: documents });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching active documents');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
    }
    getDocumentHistory(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const locationId = req.query.locationId;
                const documentType = req.query.documentType;
                if (!locationId || !documentType) {
                    return res.status(400).json({ error: 'locationId and documentType are required' });
                }
                const history = yield document_service_1.documentService.getDocumentHistory(locationId, documentType);
                res.json({ success: true, data: history });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching document history');
                if (error instanceof Error && error.message.includes('Invalid document type')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
    }
    publishDocument(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { locationId, documentType, title, content } = req.body;
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!userId) {
                    return res.status(401).json({ error: 'Authentication required' });
                }
                const document = yield document_service_1.documentService.publishDocument({
                    locationId,
                    documentType,
                    title,
                    content,
                    publishedBy: userId,
                });
                res.status(201).json({ success: true, data: document });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error publishing document');
                if (error instanceof Error && (error.message.includes('Invalid document type') || error.message.includes('at least 100 characters'))) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
    }
}
exports.documentController = new DocumentController();
