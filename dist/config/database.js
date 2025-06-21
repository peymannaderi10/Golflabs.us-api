"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const environment_1 = require("./environment");
const config = (0, environment_1.validateEnvironment)();
exports.supabase = (0, supabase_js_1.createClient)(config.supabase.url, config.supabase.serviceRoleKey);
