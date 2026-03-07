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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailTemplateService = void 0;
const handlebars_1 = __importDefault(require("handlebars"));
const date_fns_tz_1 = require("date-fns-tz");
const database_1 = require("../../config/database");
const email_template_defaults_1 = require("./email-template.defaults");
const DEFAULT_BRAND = {
    brandName: 'GOLF LABS US',
    brandColor: '#2c5530',
    brandTagline: 'Ready to improve your game? 🏌️‍♂️',
};
class EmailTemplateService {
    // ------------------------------------------------------------------
    // Template resolution: location override → system default → hardcoded
    // ------------------------------------------------------------------
    static getTemplate(locationId, templateType) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Try location-specific override
            if (locationId) {
                const override = yield this.fetchFromDb(locationId, templateType);
                if (override) {
                    return {
                        subject: override.subject_template,
                        html: override.html_template,
                        text: override.text_template || '',
                    };
                }
            }
            // 2. Try system default from DB (location_id IS NULL)
            const systemDefault = yield this.fetchFromDb(null, templateType);
            if (systemDefault) {
                return {
                    subject: systemDefault.subject_template,
                    html: systemDefault.html_template,
                    text: systemDefault.text_template || '',
                };
            }
            // 3. Fall back to hardcoded defaults
            const fallback = email_template_defaults_1.DEFAULT_TEMPLATES[templateType];
            if (!fallback) {
                throw new Error(`No template found for type: ${templateType}`);
            }
            return { subject: fallback.subject, html: fallback.html, text: fallback.text };
        });
    }
    static fetchFromDb(locationId, templateType) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = database_1.supabase
                .from('email_templates')
                .select('*')
                .eq('template_type', templateType)
                .eq('is_active', true);
            if (locationId) {
                query = query.eq('location_id', locationId);
            }
            else {
                query = query.is('location_id', null);
            }
            const { data, error } = yield query.maybeSingle();
            if (error) {
                console.error(`Error fetching email template (${templateType}, loc=${locationId}):`, error);
                return null;
            }
            return data;
        });
    }
    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------
    static render(subjectTemplate, htmlTemplate, textTemplate, data) {
        const compiledSubject = handlebars_1.default.compile(subjectTemplate);
        const compiledHtml = handlebars_1.default.compile(htmlTemplate);
        const result = {
            subject: compiledSubject(data),
            html: compiledHtml(data),
        };
        if (textTemplate) {
            const compiledText = handlebars_1.default.compile(textTemplate);
            result.text = compiledText(data);
        }
        return result;
    }
    // ------------------------------------------------------------------
    // High-level "resolve + prepare + render" per template type
    // ------------------------------------------------------------------
    static renderBookingConfirmation(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'booking_confirmation');
            const vars = this.prepareBookingVars(data);
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    static renderBookingReminder(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'booking_reminder');
            const vars = this.prepareBookingVars(data);
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    static renderBookingCancellation(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'booking_cancellation');
            const vars = this.prepareBookingVars(data);
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    static renderTeamInvite(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'team_invite');
            const totalPrizePot = data.weeklyPrizePot * data.totalWeeks;
            const totalCost = data.seasonFee + totalPrizePot;
            const vars = Object.assign(Object.assign({}, DEFAULT_BRAND), { captainName: data.captainName, teamName: data.teamName, leagueName: data.leagueName, playersPerTeam: data.playersPerTeam, numHoles: data.numHoles, totalWeeks: data.totalWeeks, seasonFee: data.seasonFee.toFixed(2), weeklyPrizePot: data.weeklyPrizePot.toFixed(2), totalPrizePot: totalPrizePot.toFixed(2), totalCost: totalCost.toFixed(2), acceptUrl: data.acceptUrl, declineUrl: data.declineUrl, hasSeasonFee: data.seasonFee > 0, hasPrizePot: totalPrizePot > 0, hasTotalCost: totalCost > 0 });
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    static renderTeamStatus(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'team_status');
            const vars = Object.assign(Object.assign({}, DEFAULT_BRAND), { teamName: data.teamName, leagueName: data.leagueName, message: data.message, actionUrl: data.actionUrl || '', actionLabel: data.actionLabel || 'View Details', hasActionUrl: !!data.actionUrl });
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    static renderAttendanceReminder(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'attendance_reminder');
            const vars = Object.assign(Object.assign({}, DEFAULT_BRAND), { playerName: data.playerName, leagueName: data.leagueName, weekNumber: data.weekNumber, leagueDate: data.leagueDate, startTime: data.startTime, confirmUrl: data.confirmUrl, declineUrl: data.declineUrl });
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    static renderEnrollmentConfirmation(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'enrollment_confirmation');
            const vars = Object.assign(Object.assign({}, DEFAULT_BRAND), { playerName: data.playerName, leagueName: data.leagueName, format: data.format, dayOfWeek: data.dayOfWeek, startTime: data.startTime, totalWeeks: data.totalWeeks, startDate: data.startDate, totalPaid: data.totalPaid.toFixed(2), seasonFee: data.seasonFee.toFixed(2), prizePotTotal: data.prizePotTotal.toFixed(2), dashboardUrl: data.dashboardUrl, hasTotalPaid: data.totalPaid > 0, hasSeasonFee: data.seasonFee > 0, hasPrizePot: data.prizePotTotal > 0 });
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    static renderMembershipWelcome(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'membership_welcome');
            const benefits = [];
            if (data.freeHoursPerMonth)
                benefits.push({ label: `${data.freeHoursPerMonth} free hours per month` });
            if (data.bookingWindowDays)
                benefits.push({ label: `Book up to ${data.bookingWindowDays} days in advance` });
            if (data.guestPassesPerMonth)
                benefits.push({ label: `${data.guestPassesPerMonth} guest passes per month` });
            const vars = Object.assign(Object.assign({}, DEFAULT_BRAND), { userFullName: data.userFullName, planName: data.planName, locationName: data.locationName, formattedPrice: data.price.toFixed(2), billingLabel: data.billingInterval === 'annual' ? 'year' : 'month', renewalDate: data.renewalDate || '', benefits, hasBenefits: benefits.length > 0 });
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    static renderMembershipCanceled(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const tpl = yield this.getTemplate(locationId, 'membership_canceled');
            const isImmediate = data.cancelType === 'immediate';
            const vars = Object.assign(Object.assign({}, DEFAULT_BRAND), { userFullName: data.userFullName, planName: data.planName, locationName: data.locationName, isImmediate, formattedRefundAmount: data.refundAmount && data.refundAmount > 0
                    ? (data.refundAmount / 100).toFixed(2)
                    : '', hasRefund: isImmediate && !!data.refundAmount && data.refundAmount > 0, accessUntil: data.accessUntil || '' });
            return this.render(tpl.subject, tpl.html, tpl.text, vars);
        });
    }
    // ------------------------------------------------------------------
    // Shared variable preparation
    // ------------------------------------------------------------------
    static prepareBookingVars(data) {
        const timezone = data.locationTimezone || 'America/New_York';
        const localStart = (0, date_fns_tz_1.toZonedTime)(new Date(data.startTime), timezone);
        const localEnd = (0, date_fns_tz_1.toZonedTime)(new Date(data.endTime), timezone);
        return Object.assign(Object.assign({}, DEFAULT_BRAND), { userFullName: data.userFullName, locationName: data.locationName, bayName: data.bayName, startDate: (0, date_fns_tz_1.format)(localStart, 'EEEE, MMMM d, yyyy', { timeZone: timezone }), startTime: (0, date_fns_tz_1.format)(localStart, 'h:mm a', { timeZone: timezone }), endTime: (0, date_fns_tz_1.format)(localEnd, 'h:mm a', { timeZone: timezone }), unlockLink: data.unlockLink || '', formattedAmount: (data.totalAmount / 100).toFixed(2), refundAmount: data.refundAmount != null ? data.refundAmount.toFixed(2) : (data.totalAmount / 100).toFixed(2), isCancelledByEmployee: data.cancelledBy === 'employee', cancellationReason: data.cancellationReason || '', refundProcessed: !!data.refundProcessed });
    }
    // ------------------------------------------------------------------
    // CRUD helpers for managing templates in the DB
    // ------------------------------------------------------------------
    static upsertTemplate(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = yield this.fetchFromDb(params.locationId, params.templateType);
            if (existing) {
                const { error } = yield database_1.supabase
                    .from('email_templates')
                    .update({
                    name: params.name,
                    subject_template: params.subjectTemplate,
                    html_template: params.htmlTemplate,
                    text_template: params.textTemplate || null,
                    variables: params.variables || [],
                    version: existing.version + 1,
                })
                    .eq('id', existing.id);
                if (error)
                    throw new Error(`Failed to update template: ${error.message}`);
                return existing.id;
            }
            const { data, error } = yield database_1.supabase
                .from('email_templates')
                .insert({
                location_id: params.locationId,
                template_type: params.templateType,
                name: params.name,
                subject_template: params.subjectTemplate,
                html_template: params.htmlTemplate,
                text_template: params.textTemplate || null,
                variables: params.variables || [],
            })
                .select('id')
                .single();
            if (error)
                throw new Error(`Failed to insert template: ${error.message}`);
            return data.id;
        });
    }
    static getTemplatesByLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('email_templates')
                .select('*')
                .eq('location_id', locationId)
                .eq('is_active', true)
                .order('template_type');
            if (error) {
                console.error('Error fetching location templates:', error);
                return [];
            }
            return (data || []);
        });
    }
    static deleteTemplate(templateId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('email_templates')
                .update({ is_active: false })
                .eq('id', templateId);
            if (error)
                throw new Error(`Failed to deactivate template: ${error.message}`);
        });
    }
    // ------------------------------------------------------------------
    // Seed system defaults into the DB
    // ------------------------------------------------------------------
    static seedDefaults() {
        return __awaiter(this, void 0, void 0, function* () {
            let seeded = 0;
            for (const [type, tpl] of Object.entries(email_template_defaults_1.DEFAULT_TEMPLATES)) {
                const existing = yield this.fetchFromDb(null, type);
                if (!existing) {
                    yield this.upsertTemplate({
                        locationId: null,
                        templateType: type,
                        name: tpl.name,
                        subjectTemplate: tpl.subject,
                        htmlTemplate: tpl.html,
                        textTemplate: tpl.text,
                        variables: tpl.variables,
                    });
                    seeded++;
                }
            }
            console.log(`Seeded ${seeded} default email templates`);
            return seeded;
        });
    }
}
exports.EmailTemplateService = EmailTemplateService;
