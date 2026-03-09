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
exports.userTypesController = exports.UserTypesController = void 0;
const user_types_service_1 = require("./user-types.service");
const logger_1 = require("../../shared/utils/logger");
class UserTypesController {
    constructor() {
        this.getByLocation = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const types = yield user_types_service_1.userTypesService.getByLocation(locationId);
                res.json(types);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in getByLocation user-types');
                res.status(500).json({ error: error.message || 'An unexpected error occurred' });
            }
        });
        this.create = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.params;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const { slug, label, isDefault } = req.body;
                if (!slug || !label) {
                    return res.status(400).json({ error: 'slug and label are required' });
                }
                const userType = yield user_types_service_1.userTypesService.create(locationId, { slug, label, isDefault });
                res.status(201).json(userType);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in create user-type');
                const status = error.message.includes('already exists') ? 409 : 500;
                res.status(status).json({ error: error.message || 'An unexpected error occurred' });
            }
        });
        this.update = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                if (!id) {
                    return res.status(400).json({ error: 'id is required' });
                }
                const { slug, label, isDefault } = req.body;
                const userType = yield user_types_service_1.userTypesService.update(id, { slug, label, isDefault });
                res.json(userType);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in update user-type');
                const status = error.message.includes('not found') ? 404
                    : error.message.includes('already exists') ? 409
                        : 500;
                res.status(status).json({ error: error.message || 'An unexpected error occurred' });
            }
        });
        this.delete = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                if (!id) {
                    return res.status(400).json({ error: 'id is required' });
                }
                yield user_types_service_1.userTypesService.delete(id);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in delete user-type');
                const status = error.message.includes('Cannot delete') ? 400
                    : error.message.includes('not found') ? 404
                        : 500;
                res.status(status).json({ error: error.message || 'An unexpected error occurred' });
            }
        });
    }
}
exports.UserTypesController = UserTypesController;
exports.userTypesController = new UserTypesController();
