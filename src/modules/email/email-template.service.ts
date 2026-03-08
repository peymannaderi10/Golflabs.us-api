import Handlebars from 'handlebars';
import { format, toZonedTime } from 'date-fns-tz';
import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import { DEFAULT_TEMPLATES } from './email-template.defaults';
import {
  EmailTemplateType,
  EmailTemplateRecord,
  RenderedEmail,
  BookingEmailData,
  TeamInviteEmailData,
  TeamStatusEmailData,
  AttendanceReminderEmailData,
  LeagueEnrollmentEmailData,
  MembershipEmailData,
} from './email.types';

const DEFAULT_BRAND = {
  brandName: 'GOLF LABS US',
  brandColor: '#2c5530',
  brandTagline: 'Ready to improve your game? 🏌️‍♂️',
};

export class EmailTemplateService {

  // ------------------------------------------------------------------
  // Template resolution: location override → system default → hardcoded
  // ------------------------------------------------------------------

  static async getTemplate(
    locationId: string | null,
    templateType: EmailTemplateType
  ): Promise<{ subject: string; html: string; text: string }> {
    // 1. Try location-specific override
    if (locationId) {
      const override = await this.fetchFromDb(locationId, templateType);
      if (override) {
        return {
          subject: override.subject_template,
          html: override.html_template,
          text: override.text_template || '',
        };
      }
    }

    // 2. Try system default from DB (location_id IS NULL)
    const systemDefault = await this.fetchFromDb(null, templateType);
    if (systemDefault) {
      return {
        subject: systemDefault.subject_template,
        html: systemDefault.html_template,
        text: systemDefault.text_template || '',
      };
    }

    // 3. Fall back to hardcoded defaults
    const fallback = DEFAULT_TEMPLATES[templateType];
    if (!fallback) {
      throw new Error(`No template found for type: ${templateType}`);
    }
    return { subject: fallback.subject, html: fallback.html, text: fallback.text };
  }

  private static async fetchFromDb(
    locationId: string | null,
    templateType: EmailTemplateType
  ): Promise<EmailTemplateRecord | null> {
    let query = supabase
      .from('email_templates')
      .select('*')
      .eq('template_type', templateType)
      .eq('is_active', true);

    if (locationId) {
      query = query.eq('location_id', locationId);
    } else {
      query = query.is('location_id', null);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      logger.error({ err: error, templateType, locationId }, 'Error fetching email template');
      return null;
    }
    return data as EmailTemplateRecord | null;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  static render(
    subjectTemplate: string,
    htmlTemplate: string,
    textTemplate: string,
    data: Record<string, any>
  ): RenderedEmail {
    const compiledSubject = Handlebars.compile(subjectTemplate);
    const compiledHtml = Handlebars.compile(htmlTemplate);
    const result: RenderedEmail = {
      subject: compiledSubject(data),
      html: compiledHtml(data),
    };

    if (textTemplate) {
      const compiledText = Handlebars.compile(textTemplate);
      result.text = compiledText(data);
    }

    return result;
  }

  // ------------------------------------------------------------------
  // High-level "resolve + prepare + render" per template type
  // ------------------------------------------------------------------

  static async renderBookingConfirmation(
    locationId: string,
    data: BookingEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'booking_confirmation');
    const vars = this.prepareBookingVars(data);
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  static async renderBookingReminder(
    locationId: string,
    data: BookingEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'booking_reminder');
    const vars = this.prepareBookingVars(data);
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  static async renderBookingCancellation(
    locationId: string,
    data: BookingEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'booking_cancellation');
    const vars = this.prepareBookingVars(data);
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  static async renderTeamInvite(
    locationId: string,
    data: TeamInviteEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'team_invite');
    const totalPrizePot = data.weeklyPrizePot * data.totalWeeks;
    const totalCost = data.seasonFee + totalPrizePot;
    const vars: Record<string, any> = {
      ...DEFAULT_BRAND,
      captainName: data.captainName,
      teamName: data.teamName,
      leagueName: data.leagueName,
      playersPerTeam: data.playersPerTeam,
      numHoles: data.numHoles,
      totalWeeks: data.totalWeeks,
      seasonFee: data.seasonFee.toFixed(2),
      weeklyPrizePot: data.weeklyPrizePot.toFixed(2),
      totalPrizePot: totalPrizePot.toFixed(2),
      totalCost: totalCost.toFixed(2),
      acceptUrl: data.acceptUrl,
      declineUrl: data.declineUrl,
      hasSeasonFee: data.seasonFee > 0,
      hasPrizePot: totalPrizePot > 0,
      hasTotalCost: totalCost > 0,
    };
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  static async renderTeamStatus(
    locationId: string,
    data: TeamStatusEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'team_status');
    const vars: Record<string, any> = {
      ...DEFAULT_BRAND,
      teamName: data.teamName,
      leagueName: data.leagueName,
      message: data.message,
      actionUrl: data.actionUrl || '',
      actionLabel: data.actionLabel || 'View Details',
      hasActionUrl: !!data.actionUrl,
    };
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  static async renderAttendanceReminder(
    locationId: string,
    data: AttendanceReminderEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'attendance_reminder');
    const vars: Record<string, any> = {
      ...DEFAULT_BRAND,
      playerName: data.playerName,
      leagueName: data.leagueName,
      weekNumber: data.weekNumber,
      leagueDate: data.leagueDate,
      startTime: data.startTime,
      confirmUrl: data.confirmUrl,
      declineUrl: data.declineUrl,
    };
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  static async renderEnrollmentConfirmation(
    locationId: string,
    data: LeagueEnrollmentEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'enrollment_confirmation');
    const vars: Record<string, any> = {
      ...DEFAULT_BRAND,
      playerName: data.playerName,
      leagueName: data.leagueName,
      format: data.format,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      totalWeeks: data.totalWeeks,
      startDate: data.startDate,
      totalPaid: data.totalPaid.toFixed(2),
      seasonFee: data.seasonFee.toFixed(2),
      prizePotTotal: data.prizePotTotal.toFixed(2),
      dashboardUrl: data.dashboardUrl,
      hasTotalPaid: data.totalPaid > 0,
      hasSeasonFee: data.seasonFee > 0,
      hasPrizePot: data.prizePotTotal > 0,
    };
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  static async renderMembershipWelcome(
    locationId: string,
    data: MembershipEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'membership_welcome');
    const benefits: { label: string }[] = [];
    if (data.freeHoursPerMonth) benefits.push({ label: `${data.freeHoursPerMonth} free hours per month` });
    if (data.bookingWindowDays) benefits.push({ label: `Book up to ${data.bookingWindowDays} days in advance` });
    if (data.guestPassesPerMonth) benefits.push({ label: `${data.guestPassesPerMonth} guest passes per month` });

    const vars: Record<string, any> = {
      ...DEFAULT_BRAND,
      userFullName: data.userFullName,
      planName: data.planName,
      locationName: data.locationName,
      formattedPrice: data.price.toFixed(2),
      billingLabel: data.billingInterval === 'annual' ? 'year' : 'month',
      renewalDate: data.renewalDate || '',
      benefits,
      hasBenefits: benefits.length > 0,
    };
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  static async renderMembershipCanceled(
    locationId: string,
    data: MembershipEmailData
  ): Promise<RenderedEmail> {
    const tpl = await this.getTemplate(locationId, 'membership_canceled');
    const isImmediate = data.cancelType === 'immediate';
    const vars: Record<string, any> = {
      ...DEFAULT_BRAND,
      userFullName: data.userFullName,
      planName: data.planName,
      locationName: data.locationName,
      isImmediate,
      formattedRefundAmount:
        data.refundAmount && data.refundAmount > 0
          ? (data.refundAmount / 100).toFixed(2)
          : '',
      hasRefund: isImmediate && !!data.refundAmount && data.refundAmount > 0,
      accessUntil: data.accessUntil || '',
    };
    return this.render(tpl.subject, tpl.html, tpl.text, vars);
  }

  // ------------------------------------------------------------------
  // Shared variable preparation
  // ------------------------------------------------------------------

  private static prepareBookingVars(data: BookingEmailData): Record<string, any> {
    const timezone = data.locationTimezone || 'America/New_York';
    const localStart = toZonedTime(new Date(data.startTime), timezone);
    const localEnd = toZonedTime(new Date(data.endTime), timezone);

    return {
      ...DEFAULT_BRAND,
      userFullName: data.userFullName,
      locationName: data.locationName,
      bayName: data.bayName,
      startDate: format(localStart, 'EEEE, MMMM d, yyyy', { timeZone: timezone }),
      startTime: format(localStart, 'h:mm a', { timeZone: timezone }),
      endTime: format(localEnd, 'h:mm a', { timeZone: timezone }),
      unlockLink: data.unlockLink || '',
      formattedAmount: (data.totalAmount / 100).toFixed(2),
      refundAmount: data.refundAmount != null ? data.refundAmount.toFixed(2) : (data.totalAmount / 100).toFixed(2),
      isCancelledByEmployee: data.cancelledBy === 'employee',
      cancellationReason: data.cancellationReason || '',
      refundProcessed: !!data.refundProcessed,
    };
  }

  // ------------------------------------------------------------------
  // CRUD helpers for managing templates in the DB
  // ------------------------------------------------------------------

  static async upsertTemplate(params: {
    locationId: string | null;
    templateType: EmailTemplateType;
    name: string;
    subjectTemplate: string;
    htmlTemplate: string;
    textTemplate?: string;
    variables?: string[];
  }): Promise<string> {
    const existing = await this.fetchFromDb(params.locationId, params.templateType);

    if (existing) {
      const { error } = await supabase
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

      if (error) throw new Error(`Failed to update template: ${error.message}`);
      return existing.id;
    }

    const { data, error } = await supabase
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

    if (error) throw new Error(`Failed to insert template: ${error.message}`);
    return data.id;
  }

  static async getTemplatesByLocation(
    locationId: string
  ): Promise<EmailTemplateRecord[]> {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('location_id', locationId)
      .eq('is_active', true)
      .order('template_type');

    if (error) {
      logger.error({ err: error }, 'Error fetching location templates');
      return [];
    }
    return (data || []) as EmailTemplateRecord[];
  }

  static async deleteTemplate(templateId: string): Promise<void> {
    const { error } = await supabase
      .from('email_templates')
      .update({ is_active: false })
      .eq('id', templateId);

    if (error) throw new Error(`Failed to deactivate template: ${error.message}`);
  }

  // ------------------------------------------------------------------
  // Seed system defaults into the DB
  // ------------------------------------------------------------------

  static async seedDefaults(): Promise<number> {
    let seeded = 0;
    for (const [type, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
      const existing = await this.fetchFromDb(null, type as EmailTemplateType);
      if (!existing) {
        await this.upsertTemplate({
          locationId: null,
          templateType: type as EmailTemplateType,
          name: tpl.name,
          subjectTemplate: tpl.subject,
          htmlTemplate: tpl.html,
          textTemplate: tpl.text,
          variables: tpl.variables,
        });
        seeded++;
      }
    }
    logger.info({ count: seeded }, 'Seeded default email templates');
    return seeded;
  }
}
