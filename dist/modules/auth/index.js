"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateEmployee = exports.authenticateUser = void 0;
var auth_middleware_1 = require("./auth.middleware");
Object.defineProperty(exports, "authenticateUser", { enumerable: true, get: function () { return auth_middleware_1.authenticateUser; } });
Object.defineProperty(exports, "authenticateEmployee", { enumerable: true, get: function () { return auth_middleware_1.authenticateEmployee; } });
