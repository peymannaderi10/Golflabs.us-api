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
exports.LogController = void 0;
const log_service_1 = require("./log.service");
const error_utils_1 = require("../../shared/utils/error.utils");
const logger_1 = require("../../shared/utils/logger");
class LogController {
    constructor() {
        this.logAccess = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const logData = Object.assign(Object.assign({}, req.body), { ip_address: req.ip });
                const newLog = yield this.logService.createAccessLog(logData);
                res.status(201).json(newLog);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in logAccess controller');
                res.status(500).json({ error: 'Failed to log access event' });
            }
        });
        this.getAccessLogs = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                const page = parseInt(req.query.page) || 1;
                const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 200);
                const startDate = req.query.startDate;
                const endDate = req.query.endDate;
                const action = req.query.action;
                const success = req.query.success !== undefined ? req.query.success === 'true' : undefined;
                if (!locationId) {
                    return res.status(400).json({ error: 'Location ID is required' });
                }
                const result = yield this.logService.getAccessLogs(locationId, {
                    page,
                    pageSize,
                    startDate,
                    endDate,
                    action,
                    success
                });
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in getAccessLogs controller');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.logService = new log_service_1.LogService();
    }
}
exports.LogController = LogController;
