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
class LogController {
    constructor() {
        this.logAccess = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const logData = Object.assign(Object.assign({}, req.body), { ip_address: req.ip });
                const newLog = yield this.logService.createAccessLog(logData);
                res.status(201).json(newLog);
            }
            catch (error) {
                console.error('Error in logAccess controller:', error.message);
                res.status(500).json({ message: 'Failed to log access event', error: error.message });
            }
        });
        this.logService = new log_service_1.LogService();
    }
}
exports.LogController = LogController;
