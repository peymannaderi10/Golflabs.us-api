import { Request, Response, NextFunction } from 'express';
import { validationResult, param, query, body } from 'express-validator';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Invalid input',
      details: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
    });
  }
  next();
};

export const validateUUID = (field: string, location: 'param' | 'query' | 'body' = 'param') => {
  const fn = location === 'param' ? param : location === 'query' ? query : body;
  return fn(field).isUUID().withMessage(`${field} must be a valid UUID`);
};

export const validatePagination = () => [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize must be between 1 and 100'),
];

export const validateDateRange = () => [
  query('startDate').optional().isISO8601().withMessage('startDate must be a valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('endDate must be a valid ISO 8601 date'),
];

export const validateRequiredString = (field: string, maxLength = 500) =>
  body(field)
    .isString().withMessage(`${field} must be a string`)
    .isLength({ min: 1, max: maxLength }).withMessage(`${field} must be between 1 and ${maxLength} characters`);

export const validateOptionalString = (field: string, maxLength = 500) =>
  body(field).optional()
    .isString().withMessage(`${field} must be a string`)
    .isLength({ max: maxLength }).withMessage(`${field} must be at most ${maxLength} characters`);
