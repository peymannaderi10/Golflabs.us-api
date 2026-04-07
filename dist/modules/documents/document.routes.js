"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const document_controller_1 = require("./document.controller");
const auth_1 = require("../auth");
const validation_1 = require("../../shared/middleware/validation");
const router = (0, express_1.Router)();
// Public — customers need this during checkout
router.get('/active', (0, express_validator_1.query)('locationId').isUUID().withMessage('locationId is required'), validation_1.handleValidationErrors, (req, res) => document_controller_1.documentController.getActiveDocuments(req, res));
// Employee-only — auth + location access first, then validate
router.get('/history', auth_1.authenticateEmployee, auth_1.enforceLocationScope, (0, express_validator_1.query)('locationId').isUUID(), (0, express_validator_1.query)('documentType').isString().notEmpty(), validation_1.handleValidationErrors, (req, res) => document_controller_1.documentController.getDocumentHistory(req, res));
// Employee-only — auth + location access first, then validate
router.post('/publish', auth_1.authenticateEmployee, auth_1.enforceLocationScope, (0, express_validator_1.body)('locationId').isUUID(), (0, express_validator_1.body)('documentType').isString().notEmpty(), (0, express_validator_1.body)('title').isString().notEmpty(), (0, express_validator_1.body)('content').isString().isLength({ min: 100 }).withMessage('Document content must be at least 100 characters'), validation_1.handleValidationErrors, (req, res) => document_controller_1.documentController.publishDocument(req, res));
exports.default = router;
