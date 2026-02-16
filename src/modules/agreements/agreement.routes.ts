import { Router } from 'express';
import { agreementController } from './agreement.controller';

const router = Router();

// Record agreement acceptance for a booking
router.post('/accept', (req, res) => agreementController.acceptAgreements(req, res));

// Check if all agreements have been accepted for a booking
router.get('/check/:bookingId', (req, res) => agreementController.checkAgreements(req, res));

export default router;
