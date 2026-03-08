"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateOptionalString = exports.validateRequiredString = exports.validateDateRange = exports.validatePagination = exports.validateUUID = exports.handleValidationErrors = void 0;
const express_validator_1 = require("express-validator");
const handleValidationErrors = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Invalid input',
            details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};
exports.handleValidationErrors = handleValidationErrors;
const validateUUID = (field, location = 'param') => {
    const fn = location === 'param' ? express_validator_1.param : location === 'query' ? express_validator_1.query : express_validator_1.body;
    return fn(field).isUUID().withMessage(`${field} must be a valid UUID`);
};
exports.validateUUID = validateUUID;
const validatePagination = () => [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    (0, express_validator_1.query)('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize must be between 1 and 100'),
];
exports.validatePagination = validatePagination;
const validateDateRange = () => [
    (0, express_validator_1.query)('startDate').optional().isISO8601().withMessage('startDate must be a valid ISO 8601 date'),
    (0, express_validator_1.query)('endDate').optional().isISO8601().withMessage('endDate must be a valid ISO 8601 date'),
];
exports.validateDateRange = validateDateRange;
const validateRequiredString = (field, maxLength = 500) => (0, express_validator_1.body)(field)
    .isString().withMessage(`${field} must be a string`)
    .isLength({ min: 1, max: maxLength }).withMessage(`${field} must be between 1 and ${maxLength} characters`);
exports.validateRequiredString = validateRequiredString;
const validateOptionalString = (field, maxLength = 500) => (0, express_validator_1.body)(field).optional()
    .isString().withMessage(`${field} must be a string`)
    .isLength({ max: maxLength }).withMessage(`${field} must be at most ${maxLength} characters`);
exports.validateOptionalString = validateOptionalString;
