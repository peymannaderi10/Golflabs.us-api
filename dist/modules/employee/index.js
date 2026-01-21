"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.employeeService = exports.employeeController = exports.employeeRoutes = void 0;
// Employee module barrel export
var employee_routes_1 = require("./employee.routes");
Object.defineProperty(exports, "employeeRoutes", { enumerable: true, get: function () { return employee_routes_1.employeeRoutes; } });
var employee_controller_1 = require("./employee.controller");
Object.defineProperty(exports, "employeeController", { enumerable: true, get: function () { return employee_controller_1.employeeController; } });
var employee_service_1 = require("./employee.service");
Object.defineProperty(exports, "employeeService", { enumerable: true, get: function () { return employee_service_1.employeeService; } });
__exportStar(require("./employee.types"), exports);
