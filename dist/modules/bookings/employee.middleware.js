"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateEmployee = exports.authenticateUser = void 0;
// Re-export from the canonical auth module for backwards compatibility
var auth_1 = require("../auth");
Object.defineProperty(exports, "authenticateUser", { enumerable: true, get: function () { return auth_1.authenticateUser; } });
Object.defineProperty(exports, "authenticateEmployee", { enumerable: true, get: function () { return auth_1.authenticateEmployee; } });
