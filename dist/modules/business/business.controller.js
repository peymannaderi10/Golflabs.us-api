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
exports.BusinessController = void 0;
const zod_1 = require("zod");
const business_service_1 = require("./business.service");
const business_types_1 = require("./business.types");
const logger_1 = require("../../shared/utils/logger");
function handleError(error, res, context) {
    var _a;
    if (error instanceof zod_1.ZodError) {
        return res.status(400).json({
            success: false,
            error: ((_a = error.issues[0]) === null || _a === void 0 ? void 0 : _a.message) || 'Invalid input',
        });
    }
    if (error instanceof business_service_1.BusinessSignupError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    logger_1.logger.error({ err: error, context }, 'Unexpected error in business controller');
    return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
}
class BusinessController {
    constructor() {
        this.startSignup = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const parsed = business_types_1.startSignupSchema.parse(req.body);
                const result = yield this.service.startSignup(parsed);
                res.status(202).json({ success: true, data: result });
            }
            catch (error) {
                handleError(error, res, 'business.startSignup');
            }
        });
        this.verifySignup = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const parsed = business_types_1.verifySignupSchema.parse(req.body);
                const result = yield this.service.verifySignup(parsed);
                res.status(201).json({ success: true, data: result });
            }
            catch (error) {
                handleError(error, res, 'business.verifySignup');
            }
        });
        this.createLocation = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const employee = req.employeeProfile;
                if (!(employee === null || employee === void 0 ? void 0 : employee.clientId) || !employee.id) {
                    return res.status(403).json({ success: false, error: 'Not associated with a business' });
                }
                if (employee.clientRole !== 'owner' && employee.clientRole !== 'admin') {
                    return res
                        .status(403)
                        .json({ success: false, error: 'Only owners or admins can create locations' });
                }
                const parsed = business_types_1.locationInputSchema.parse(req.body);
                const result = yield this.service.createLocation(employee.clientId, employee.id, employee.clientRole, parsed);
                res.status(201).json({ success: true, data: result });
            }
            catch (error) {
                handleError(error, res, 'business.createLocation');
            }
        });
        this.service = new business_service_1.BusinessService();
    }
}
exports.BusinessController = BusinessController;
