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
class UserController {
    constructor() {
        this.deleteAccount = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'User ID is required' });
                }
                const result = yield this.userService.deleteAccount(userId);
                res.json(result);
            }
            catch (error) {
                console.error('Error in deleteAccount endpoint:', error);
                if (error.message === 'User not found') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message === 'User ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred while deleting account' });
            }
        });
        this.getUserProfile = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'User ID is required' });
                }
                const profile = yield this.userService.getUserProfile(userId);
                res.json(profile);
            }
            catch (error) {
                console.error('Error in getUserProfile endpoint:', error);
                if (error.message === 'User ID is required') {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: 'An unexpected error occurred while fetching user profile' });
            }
        });
        this.userService = new user_service_1.UserService();
    }
}
exports.UserController = UserController;
