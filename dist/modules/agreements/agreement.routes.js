"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agreement_controller_1 = require("./agreement.controller");
const router = (0, express_1.Router)();
// Record agreement acceptance for a booking
router.post('/accept', (req, res) => agreement_controller_1.agreementController.acceptAgreements(req, res));
// Check if all agreements have been accepted for a booking
router.get('/check/:bookingId', (req, res) => agreement_controller_1.agreementController.checkAgreements(req, res));
exports.default = router;
