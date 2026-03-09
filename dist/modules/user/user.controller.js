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
exports.UserController = void 0;
const user_service_1 = require("./user.service");
const error_utils_1 = require("../../shared/utils/error.utils");
const logger_1 = require("../../shared/utils/logger");
class UserController {
    constructor(socketService) {
        this.deleteAccount = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'User ID is required' });
                }
                if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== userId) {
                    return res.status(403).json({ error: 'You can only delete your own account' });
                }
                const result = yield this.userService.deleteAccount(userId, this.socketService);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in deleteAccount endpoint');
                if (error.message === 'User not found') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message === 'User ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred while deleting account' });
            }
        });
        this.exportUserData = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { userId } = req.params;
                if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== userId) {
                    return res.status(403).json({ error: 'You can only export your own data' });
                }
                const data = yield this.userService.exportUserData(userId);
                res.json(data);
            }
            catch (error) {
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getUserProfile = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'User ID is required' });
                }
                if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== userId) {
                    return res.status(403).json({ error: 'You can only view your own profile' });
                }
                const profile = yield this.userService.getUserProfile(userId);
                res.json(profile);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in getUserProfile endpoint');
                if (error.message === 'User ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred while fetching user profile' });
            }
        });
        this.userService = new user_service_1.UserService();
        this.socketService = socketService;
    }
}
exports.UserController = UserController;
