"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookSecret = exports.stripe = void 0;
const stripe_1 = __importDefault(require("stripe"));
const environment_1 = require("./environment");
const config = (0, environment_1.validateEnvironment)();
exports.stripe = new stripe_1.default(config.stripe.secretKey);
exports.webhookSecret = config.stripe.webhookSecret;
