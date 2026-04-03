import { supabase } from '../../config/database';
import { CapacityHoldService } from '../bookings/capacity-hold.service';
import {
  League,
  LeagueCourse,
  LeaguePlayer,
  LeagueWeek,
  LeagueTeam,
  LeagueTeamInvite,
  CreateLeagueRequest,
  CreateCourseRequest,
  UpdateCourseRequest,
  UpdateLeagueRequest,
  EnrollPlayerRequest,
  SubmitScoreRequest,
  SubmitScoreResult,
  StandingWithPlayer,
  LiveLeaderboardEntry,
  TeamLeaderboardEntry,
  PrizeLedgerEntry,
  PrizePoolSummary,
} from './league.types';
import { generateSessionDates } from './schedule-generator';
import { logger } from '../../shared/utils/logger';

// Sub-service imports (facade delegates)
import { LeagueEnrollmentService } from './league-enrollment.service';
import { LeagueCourseService } from './league-course.service';
import { LeagueScoringService } from './league-scoring.service';
import { LeagueStandingsService } from './league-standings.service';
import { LeaguePrizeService } from './league-prize.service';
import { LeagueTeamService } from './league-team.service';

export class LeagueService {

  private capacityHoldService = new CapacityHoldService();
  private enrollmentService = new LeagueEnrollmentService();
  private courseService = new LeagueCourseService();
  private standingsService = new LeagueStandingsService();
  private prizeService = new LeaguePrizeService();
  private scoringService: LeagueScoringService;
  private teamService = new LeagueTeamService();

  constructor() {
    // Scoring service needs standings, prize, and course services for finalizeWeek orchestration
    this.scoringService = new LeagueScoringService(
      this.standingsService,
      this.prizeService,
      this.courseService
    );
  }

  // =====================================================
  // LEAGUE CRUD (stays in facade)
  // =====================================================

  async getCourseCatalog(): Promise<any[]> {
    const { data, error } = await supabase
      .from('golf_course_catalog')
      .select('id, name, location, country, num_holes, total_par, hole_pars')
      .order('name');

    if (error) {
      throw new Error(`Failed to fetch course catalog: ${error.message}`);
    }

    return data || [];
  }

  async createLeague(data: CreateLeagueRequest): Promise<League> {
    const {
      locationId,
      name,
      format = 'stroke_play',
      numHoles = 9,
      parPerHole = 3,
      seasonFee = 0,
      membersOnly = false,
      maxPlayers = 32,
      handicapEnabled = true,
      courseRotation = 'fixed',
      scoringType = 'net_stroke_play',
      pointsConfig,
      courses,
      scheduleConfig,
      prizePoolConfig,
      playersPerTeam = 2,
      teamScoringFormat = 'best_ball',
      capacityHoldType = 'all_bays',
      capacityHoldValue = 100,
      leagueBayIds = [],
      bufferBeforeMins = 0,
      bufferAfterMins = 0,
      attendanceRequired = false,
      attendanceAutoAdjust = false,
      attendanceReminderHours = 24,
      attendanceCutoffHours = 8,
      playersPerBay = 2,
      teamMinAttendance = null,
    } = data;

    // Validate bay count for num_bays hold type
    if (capacityHoldType === 'num_bays') {
      const { count: bayCount } = await supabase
        .from('bays')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .is('deleted_at', null);

      if (bayCount !== null && capacityHoldValue > bayCount) {
        throw new Error(`Cannot reserve ${capacityHoldValue} bays — this location only has ${bayCount}`);
      }
    }

    // Generate sessions from schedule config
    const generatedSessions = generateSessionDates(scheduleConfig);
    if (generatedSessions.length === 0) {
      throw new Error('Schedule config generated 0 sessions');
    }

    const totalWeeks = generatedSessions.length;
    const primaryDayOfWeek = scheduleConfig.daysOfWeek[0];
    const weeklyPrizePot = prizePoolConfig?.enabled ? prizePoolConfig.buyInPerSession : 0;

    // Insert the league
    const { data: league, error } = await supabase
      .from('leagues')
      .insert({
        location_id: locationId,
        name,
        format,
        num_holes: numHoles,
        par_per_hole: parPerHole,
        total_weeks: totalWeeks,
        day_of_week: primaryDayOfWeek,
        start_time: scheduleConfig.startTime,
        end_time: scheduleConfig.endTime,
        season_fee: seasonFee,
        members_only: membersOnly,
        weekly_prize_pot: weeklyPrizePot,
        max_players: maxPlayers,
        handicap_enabled: handicapEnabled,
        course_rotation: courseRotation,
        scoring_type: scoringType,
        points_config: pointsConfig || null,
        payout_config: null,
        schedule_config: scheduleConfig,
        prize_pool_config: prizePoolConfig || null,
        players_per_team: format === 'team' ? playersPerTeam : 2,
        team_scoring_format: format === 'team' ? teamScoringFormat : 'best_ball',
        capacity_hold_type: capacityHoldType,
        capacity_hold_value: capacityHoldValue,
        league_bay_ids: leagueBayIds,
        buffer_before_mins: bufferBeforeMins,
        buffer_after_mins: bufferAfterMins,
        attendance_required: attendanceRequired,
        attendance_auto_adjust: attendanceAutoAdjust,
        attendance_reminder_hours: attendanceReminderHours,
        attendance_cutoff_hours: attendanceCutoffHours,
        players_per_bay: playersPerBay,
        team_min_attendance: teamMinAttendance,
      })
      .select()
      .single();

    if (error || !league) {
      throw new Error(`Failed to create league: ${error?.message}`);
    }

    // Create courses if provided
    let createdCourses: LeagueCourse[] = [];
    if (courses && courses.length > 0) {
      const courseRows = courses.map((c, idx) => ({
        league_id: league.id,
        course_name: c.courseName,
        num_holes: c.numHoles,
        hole_pars: c.holePars,
        total_par: c.holePars.reduce((sum: number, p: number) => sum + p, 0),
        is_default: idx === 0 ? true : (c.isDefault || false),
      }));

      const { data: coursesData, error: coursesError } = await supabase
        .from('league_courses')
        .insert(courseRows)
        .select();

      if (coursesError) {
        logger.error({ err: coursesError }, 'Failed to create league courses');
      } else {
        createdCourses = coursesData || [];
      }
    }

    // Auto-generate league_weeks rows from schedule config
    const weeks = [];

    for (const session of generatedSessions) {
      let courseId: string | null = null;
      if (createdCourses.length > 0) {
        if (courseRotation === 'fixed') {
          const defaultCourse = createdCourses.find(c => c.is_default) || createdCourses[0];
          courseId = defaultCourse.id;
        } else {
          courseId = createdCourses[(session.sessionNumber - 1) % createdCourses.length].id;
        }
      }

      weeks.push({
        league_id: league.id,
        week_number: session.sessionNumber,
        date: session.date,
        status: 'upcoming',
        league_course_id: courseId,
        session_label: session.sessionLabel,
      });
    }

    const { data: weeksData, error: weeksError } = await supabase
      .from('league_weeks')
      .insert(weeks)
      .select('id, date');

    if (weeksError) {
      logger.error({ err: weeksError }, 'Failed to create league weeks');
    }

    // Generate capacity holds for each league week
    if (weeksData && weeksData.length > 0) {
      try {
        await this.capacityHoldService.generateHoldsForLeague(
          league.id,
          locationId,
          scheduleConfig.startTime,
          scheduleConfig.endTime,
          weeksData.map((w: any) => ({ id: w.id, date: w.date })),
          {
            holdType: capacityHoldType,
            holdValue: capacityHoldValue,
            bufferBeforeMins,
            bufferAfterMins,
          }
        );
      } catch (holdError: any) {
        logger.error({ err: holdError }, 'Failed to generate capacity holds');
      }
    }

    return league;
  }

  async getLeaguesByLocation(locationId: string): Promise<League[]> {
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('location_id', locationId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch leagues: ${error.message}`);
    }

    return data || [];
  }

  async getLeague(leagueId: string): Promise<League> {
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new Error(`League not found: ${error?.message}`);
    }

    return data;
  }

  async deleteLeague(leagueId: string): Promise<{ success: true }> {
    await this.cancelLeague(leagueId);
    return { success: true };
  }

  async updateLeague(leagueId: string, data: UpdateLeagueRequest): Promise<League> {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.format !== undefined) updateData.format = data.format;
    if (data.numHoles !== undefined) updateData.num_holes = data.numHoles;
    if (data.parPerHole !== undefined) updateData.par_per_hole = data.parPerHole;
    if (data.seasonFee !== undefined) updateData.season_fee = data.seasonFee;
    if (data.maxPlayers !== undefined) updateData.max_players = data.maxPlayers;
    if (data.handicapEnabled !== undefined) updateData.handicap_enabled = data.handicapEnabled;
    if (data.courseRotation !== undefined) updateData.course_rotation = data.courseRotation;
    if (data.scoringType !== undefined) updateData.scoring_type = data.scoringType;
    if (data.pointsConfig !== undefined) updateData.points_config = data.pointsConfig;
    if (data.playersPerTeam !== undefined) updateData.players_per_team = data.playersPerTeam;
    if (data.teamScoringFormat !== undefined) updateData.team_scoring_format = data.teamScoringFormat;
    if (data.capacityHoldType !== undefined) updateData.capacity_hold_type = data.capacityHoldType;
    if (data.capacityHoldValue !== undefined) updateData.capacity_hold_value = data.capacityHoldValue;
    if (data.leagueBayIds !== undefined) updateData.league_bay_ids = data.leagueBayIds;
    if (data.bufferBeforeMins !== undefined) updateData.buffer_before_mins = data.bufferBeforeMins;
    if (data.bufferAfterMins !== undefined) updateData.buffer_after_mins = data.bufferAfterMins;
    if (data.attendanceRequired !== undefined) updateData.attendance_required = data.attendanceRequired;
    if (data.attendanceAutoAdjust !== undefined) updateData.attendance_auto_adjust = data.attendanceAutoAdjust;
    if (data.attendanceReminderHours !== undefined) updateData.attendance_reminder_hours = data.attendanceReminderHours;
    if (data.attendanceCutoffHours !== undefined) updateData.attendance_cutoff_hours = data.attendanceCutoffHours;
    if (data.playersPerBay !== undefined) updateData.players_per_bay = data.playersPerBay;
    if (data.teamMinAttendance !== undefined) updateData.team_min_attendance = data.teamMinAttendance;
    if (data.scheduleConfig !== undefined) {
      updateData.schedule_config = data.scheduleConfig;
      updateData.start_time = data.scheduleConfig.startTime;
      updateData.end_time = data.scheduleConfig.endTime;
      updateData.day_of_week = data.scheduleConfig.daysOfWeek[0];
    }
    if (data.prizePoolConfig !== undefined) {
      updateData.prize_pool_config = data.prizePoolConfig;
      updateData.weekly_prize_pot = data.prizePoolConfig?.enabled ? data.prizePoolConfig.buyInPerSession : 0;
    }

    const { data: league, error } = await supabase
      .from('leagues')
      .update(updateData)
      .eq('id', leagueId)
      .select()
      .single();

    if (error || !league) {
      throw new Error(`Failed to update league: ${error?.message}`);
    }

    // If capacity hold config changed, update future holds
    if (data.capacityHoldType !== undefined || data.capacityHoldValue !== undefined ||
        data.bufferBeforeMins !== undefined || data.bufferAfterMins !== undefined) {
      try {
        await this.capacityHoldService.updateHoldConfig(leagueId, {
          holdType: league.capacity_hold_type || 'all_bays',
          holdValue: league.capacity_hold_value || 100,
          bufferBeforeMins: league.buffer_before_mins || 0,
          bufferAfterMins: league.buffer_after_mins || 0,
        });
      } catch (holdError: any) {
        logger.error({ err: holdError }, 'Failed to update capacity holds');
      }
    }

    return league;
  }

  async cancelLeague(leagueId: string): Promise<League> {
    const { data: league, error } = await supabase
      .from('leagues')
      .update({
        status: 'cancelled',
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !league) {
      throw new Error(`League not found or already deleted: ${error?.message}`);
    }

    try {
      await this.capacityHoldService.releaseHoldsForLeague(leagueId);
    } catch (holdError: any) {
      logger.error({ err: holdError }, 'Failed to release capacity holds');
    }

    return league;
  }

  async activateLeague(leagueId: string): Promise<League> {
    const league = await this.getLeague(leagueId);

    if (league.status !== 'draft' && league.status !== 'registration') {
      throw new Error(`Cannot activate league in '${league.status}' status`);
    }

    const { data, error } = await supabase
      .from('leagues')
      .update({ status: 'active', current_week: 1 })
      .eq('id', leagueId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to activate league: ${error?.message}`);
    }

    return data;
  }

  async completeLeague(leagueId: string): Promise<League> {
    const league = await this.getLeague(leagueId);

    if (league.status !== 'active') {
      throw new Error(`Cannot complete league in '${league.status}' status`);
    }

    // Verify all weeks are finalized
    const { count: remaining } = await supabase
      .from('league_weeks')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .neq('status', 'finalized');

    if (remaining && remaining > 0) {
      throw new Error(`Cannot complete league — ${remaining} week(s) are not finalized`);
    }

    const { data, error } = await supabase
      .from('leagues')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', leagueId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to complete league: ${error?.message}`);
    }

    try {
      await this.capacityHoldService.releaseHoldsForLeague(leagueId);
    } catch (holdError: any) {
      logger.error({ err: holdError }, 'Failed to release capacity holds');
    }

    return data;
  }

  async getLeagueLocationId(leagueId: string): Promise<string | null> {
    const { data } = await supabase
      .from('leagues')
      .select('location_id')
      .eq('id', leagueId)
      .single();
    return data?.location_id ?? null;
  }

  async getActivePlayerIdForUser(userId: string, leagueId: string): Promise<string | null> {
    const { data } = await supabase
      .from('league_players')
      .select('id')
      .eq('user_id', userId)
      .eq('league_id', leagueId)
      .neq('enrollment_status', 'withdrawn')
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  }

  // =====================================================
  // USER-FACING QUERIES (stays in facade)
  // =====================================================

  async getLeaguesForUser(userId: string): Promise<any[]> {
    const { data: enrollments, error } = await supabase
      .from('league_players')
      .select('*, leagues(*)')
      .eq('user_id', userId)
      .neq('enrollment_status', 'withdrawn');

    if (error) {
      throw new Error(`Failed to fetch user leagues: ${error.message}`);
    }

    if (!enrollments || enrollments.length === 0) {
      return [];
    }

    // Batch fetch standings and next weeks to avoid N+1
    const validEnrollments = enrollments.filter(e => e.leagues && !e.leagues.deleted_at);
    const playerIds = validEnrollments.map(e => e.id);
    const leagueIds = [...new Set(validEnrollments.map(e => e.leagues.id))];

    const [{ data: allStandings }, { data: allWeeks }] = await Promise.all([
      supabase.from('league_standings').select('*').in('league_player_id', playerIds),
      supabase.from('league_weeks').select('id, league_id, week_number, date, status')
        .in('league_id', leagueIds).in('status', ['upcoming', 'active']).order('week_number'),
    ]);

    const standingsMap = new Map((allStandings || []).map((s: any) => [s.league_player_id, s]));
    const nextWeekMap = new Map<string, any>();
    for (const w of (allWeeks || [])) {
      if (!nextWeekMap.has(w.league_id)) nextWeekMap.set(w.league_id, w);
    }

    const results = [];

    for (const enrollment of validEnrollments) {
      const league = enrollment.leagues;
      const standing = standingsMap.get(enrollment.id) || null;
      const nextWeek = nextWeekMap.get(league.id) || null;

      results.push({
        league: {
          id: league.id,
          name: league.name,
          format: league.format,
          num_holes: league.num_holes,
          par_per_hole: league.par_per_hole,
          total_weeks: league.total_weeks,
          current_week: league.current_week,
          day_of_week: league.day_of_week,
          start_time: league.start_time,
          end_time: league.end_time,
          season_fee: league.season_fee,
          weekly_prize_pot: league.weekly_prize_pot,
          max_players: league.max_players,
          handicap_enabled: league.handicap_enabled,
          status: league.status,
          created_at: league.created_at,
          attendance_required: league.attendance_required || false,
        },
        player: {
          id: enrollment.id,
          displayName: enrollment.display_name,
          handicap: enrollment.current_handicap,
          enrollmentStatus: enrollment.enrollment_status,
          seasonPaid: enrollment.season_paid,
        },
        standing: standing ? {
          rank: standing.current_rank,
          weeksPlayed: standing.weeks_played,
          totalGross: standing.total_gross,
          totalNet: standing.total_net,
          avgGross: standing.avg_gross,
          bestGross: standing.best_gross,
        } : null,
        nextWeek: nextWeek ? {
          id: nextWeek.id,
          weekNumber: nextWeek.week_number,
          date: nextWeek.date,
          status: nextWeek.status,
        } : null,
      });
    }

    return results;
  }

  async getLeagueStateForKiosk(leagueId: string, options: { playerId?: string; userId?: string }): Promise<any> {
    const league = await this.getLeague(leagueId);

    const { data: activeWeek } = await supabase
      .from('league_weeks')
      .select('*, league_courses(id, course_name, num_holes, hole_pars, total_par)')
      .eq('league_id', leagueId)
      .in('status', ['active', 'scoring'])
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    let player: any = null;
    if (options.playerId) {
      const { data } = await supabase
        .from('league_players')
        .select('*')
        .eq('id', options.playerId)
        .single();
      player = data;
    } else if (options.userId) {
      const { data } = await supabase
        .from('league_players')
        .select('*')
        .eq('league_id', leagueId)
        .eq('user_id', options.userId)
        .neq('enrollment_status', 'withdrawn')
        .single();
      player = data;
    }

    let scores: any[] = [];
    let nextHole = 1;

    if (activeWeek && player) {
      const { data: weekScores } = await supabase
        .from('league_scores')
        .select('hole_number, strokes')
        .eq('league_week_id', activeWeek.id)
        .eq('league_player_id', player.id)
        .order('hole_number');

      scores = weekScores || [];
      nextHole = scores.length > 0
        ? Math.max(...scores.map((s: any) => s.hole_number)) + 1
        : 1;
    }

    const courseData = activeWeek?.league_courses as any;

    let teammates: any[] | null = null;

    if (player && player.league_team_id && activeWeek) {
      const { data: teamPlayers } = await supabase
        .from('league_players')
        .select('id, display_name, current_handicap')
        .eq('league_team_id', player.league_team_id)
        .neq('enrollment_status', 'withdrawn')
        .order('display_name');

      if (teamPlayers && teamPlayers.length > 1) {
        const playerIds = teamPlayers.map((tp: any) => tp.id);

        const { data: allScores } = await supabase
          .from('league_scores')
          .select('league_player_id, hole_number, strokes')
          .eq('league_week_id', activeWeek.id)
          .in('league_player_id', playerIds)
          .order('hole_number');

        const scoresByPlayer: Record<string, any[]> = {};
        for (const s of (allScores || [])) {
          if (!scoresByPlayer[s.league_player_id]) {
            scoresByPlayer[s.league_player_id] = [];
          }
          scoresByPlayer[s.league_player_id].push({ hole_number: s.hole_number, strokes: s.strokes });
        }

        teammates = teamPlayers.map((tp: any) => {
          const tpScores = scoresByPlayer[tp.id] || [];
          const tpNextHole = tpScores.length > 0
            ? Math.max(...tpScores.map((s: any) => s.hole_number)) + 1
            : 1;
          return {
            id: tp.id,
            displayName: tp.display_name,
            handicap: tp.current_handicap,
            scores: tpScores,
            nextHole: Math.min(tpNextHole, league.num_holes),
            roundComplete: tpScores.length >= league.num_holes,
          };
        });
      }
    }

    return {
      league: {
        id: league.id,
        name: league.name,
        numHoles: league.num_holes,
        parPerHole: league.par_per_hole,
        currentWeek: league.current_week,
      },
      week: activeWeek ? {
        id: activeWeek.id,
        weekNumber: activeWeek.week_number,
        date: activeWeek.date,
        status: activeWeek.status,
      } : null,
      course: courseData ? {
        id: courseData.id,
        courseName: courseData.course_name,
        numHoles: courseData.num_holes,
        holePars: courseData.hole_pars,
        totalPar: courseData.total_par,
      } : null,
      player: player ? {
        id: player.id,
        displayName: player.display_name,
        handicap: player.current_handicap,
      } : null,
      scores,
      nextHole: Math.min(nextHole, league.num_holes),
      roundComplete: player ? scores.length >= league.num_holes : false,
      teammates,
    };
  }

  // =====================================================
  // DELEGATED METHODS — Enrollment
  // =====================================================

  async enrollPlayer(leagueId: string, data: EnrollPlayerRequest): Promise<LeaguePlayer> {
    return this.enrollmentService.enrollPlayer(leagueId, data);
  }

  async getPlayers(leagueId: string): Promise<(LeaguePlayer & { email?: string })[]> {
    return this.enrollmentService.getPlayers(leagueId);
  }

  async searchPlayers(leagueId: string, query?: string) {
    return this.enrollmentService.searchPlayers(leagueId, query);
  }

  async refundWeeklyBuyIn(leagueId: string, playerId: string, reason: string, issuedBy: string) {
    return this.enrollmentService.refundWeeklyBuyIn(leagueId, playerId, reason, issuedBy);
  }

  async removeAndRefund(leagueId: string, playerId: string, refundType: 'full' | 'prorated' | 'none', reason: string, issuedBy: string) {
    return this.enrollmentService.removeAndRefund(leagueId, playerId, refundType, reason, issuedBy);
  }

  async withdrawPlayer(leagueId: string, playerId: string): Promise<void> {
    return this.enrollmentService.withdrawPlayer(leagueId, playerId);
  }

  async enrollAndPay(leagueId: string, userId: string, displayName: string, initialHandicap: number = 0) {
    return this.enrollmentService.enrollAndPay(leagueId, userId, displayName, initialHandicap);
  }

  async overrideHandicap(leagueId: string, playerId: string, newHandicap: number, overriddenBy: string, reason: string): Promise<void> {
    return this.enrollmentService.overrideHandicap(leagueId, playerId, newHandicap, overriddenBy, reason);
  }

  // =====================================================
  // DELEGATED METHODS — Courses
  // =====================================================

  async addCourse(leagueId: string, data: CreateCourseRequest): Promise<LeagueCourse> {
    return this.courseService.addCourse(leagueId, data);
  }

  async getCourses(leagueId: string): Promise<LeagueCourse[]> {
    return this.courseService.getCourses(leagueId);
  }

  async updateCourse(courseId: string, data: UpdateCourseRequest): Promise<LeagueCourse> {
    return this.courseService.updateCourse(courseId, data);
  }

  async deleteCourse(courseId: string): Promise<void> {
    return this.courseService.deleteCourse(courseId);
  }

  async assignCourseToWeek(weekId: string, courseId: string): Promise<LeagueWeek> {
    return this.courseService.assignCourseToWeek(weekId, courseId);
  }

  // =====================================================
  // DELEGATED METHODS — Scoring & Weeks
  // =====================================================

  async getWeeks(leagueId: string): Promise<LeagueWeek[]> {
    return this.scoringService.getWeeks(leagueId);
  }

  async activateWeek(leagueId: string, weekId: string): Promise<LeagueWeek> {
    return this.scoringService.activateWeek(leagueId, weekId);
  }

  async finalizeWeek(leagueId: string, weekId: string) {
    return this.scoringService.finalizeWeek(leagueId, weekId);
  }

  async validateScoreSubmission(data: SubmitScoreRequest): Promise<void> {
    return this.scoringService.validateScoreSubmission(data);
  }

  async submitScore(data: SubmitScoreRequest): Promise<SubmitScoreResult> {
    return this.scoringService.submitScore(data);
  }

  async submitScoresBulk(leagueId: string, data: any): Promise<SubmitScoreResult> {
    return this.scoringService.submitScoresBulk(leagueId, data);
  }

  async getWeekScores(leagueId: string, weekId: string) {
    return this.scoringService.getWeekScores(leagueId, weekId);
  }

  async getPlayerScorecard(leagueId: string, weekId: string, playerId: string) {
    return this.scoringService.getPlayerScorecard(leagueId, weekId, playerId);
  }

  async confirmScore(scoreId: string, confirmedBy: string): Promise<void> {
    return this.scoringService.confirmScore(scoreId, confirmedBy);
  }

  async confirmWeekScores(weekId: string, confirmedBy: string): Promise<number> {
    return this.scoringService.confirmWeekScores(weekId, confirmedBy);
  }

  async overrideScore(scoreId: string, newStrokes: number, overriddenBy: string, reason: string): Promise<void> {
    return this.scoringService.overrideScore(scoreId, newStrokes, overriddenBy, reason);
  }

  // =====================================================
  // DELEGATED METHODS — Standings & Leaderboards
  // =====================================================

  async getStandings(leagueId: string): Promise<StandingWithPlayer[]> {
    return this.standingsService.getStandings(leagueId);
  }

  async getLiveLeaderboard(leagueId: string): Promise<LiveLeaderboardEntry[]> {
    return this.standingsService.getLiveLeaderboard(leagueId);
  }

  async getTeamLeaderboard(leagueId: string): Promise<TeamLeaderboardEntry[]> {
    return this.standingsService.getTeamLeaderboard(leagueId);
  }

  async recalculateHandicaps(leagueId: string, weekId?: string): Promise<void> {
    return this.standingsService.recalculateHandicaps(leagueId, weekId);
  }

  // =====================================================
  // DELEGATED METHODS — Prize Pool
  // =====================================================

  async calculateWeeklyPot(leagueId: string, weekId: string): Promise<number> {
    return this.prizeService.calculateWeeklyPot(leagueId, weekId);
  }

  async generateWeekPayouts(leagueId: string, weekId: string): Promise<PrizeLedgerEntry[]> {
    return this.prizeService.generateWeekPayouts(leagueId, weekId);
  }

  async confirmPayout(ledgerEntryId: string, confirmedBy: string): Promise<void> {
    return this.prizeService.confirmPayout(ledgerEntryId, confirmedBy);
  }

  async confirmWeekPayouts(leagueId: string, weekId: string, confirmedBy: string): Promise<void> {
    return this.prizeService.confirmWeekPayouts(leagueId, weekId, confirmedBy);
  }

  async getPrizePoolSummary(leagueId: string): Promise<PrizePoolSummary> {
    return this.prizeService.getPrizePoolSummary(leagueId);
  }

  async getPlayerPrizeHistory(leagueId: string, playerId: string): Promise<PrizeLedgerEntry[]> {
    return this.prizeService.getPlayerPrizeHistory(leagueId, playerId);
  }

  async insertPrizeContribution(leagueId: string, leaguePlayerId: string, amount: number, description: string): Promise<void> {
    return this.prizeService.insertPrizeContribution(leagueId, leaguePlayerId, amount, description);
  }

  // =====================================================
  // DELEGATED METHODS — Teams
  // =====================================================

  async createTeam(leagueId: string, captainUserId: string, teamName: string): Promise<LeagueTeam> {
    return this.teamService.createTeam(leagueId, captainUserId, teamName);
  }

  async inviteTeammates(teamId: string, captainUserId: string, emails: string[]) {
    return this.teamService.inviteTeammates(teamId, captainUserId, emails);
  }

  async acceptInvite(inviteToken: string, userId: string) {
    return this.teamService.acceptInvite(inviteToken, userId);
  }

  async declineInvite(inviteToken: string, userId: string): Promise<void> {
    return this.teamService.declineInvite(inviteToken, userId);
  }

  async getInviteByToken(token: string) {
    return this.teamService.getInviteByToken(token);
  }

  async getTeams(leagueId: string): Promise<LeagueTeam[]> {
    return this.teamService.getTeams(leagueId);
  }

  async getTeam(teamId: string): Promise<LeagueTeam> {
    return this.teamService.getTeam(teamId);
  }

  async enrollTeamPlayer(leagueId: string, teamId: string, userId: string, displayName: string, initialHandicap: number = 0) {
    return this.teamService.enrollTeamPlayer(leagueId, teamId, userId, displayName, initialHandicap);
  }

  async checkTeamAllPaid(teamId: string): Promise<boolean> {
    return this.teamService.checkTeamAllPaid(teamId);
  }

  async disqualifyTeam(teamId: string, reason: string) {
    return this.teamService.disqualifyTeam(teamId, reason);
  }

  async processTeamDeadlines() {
    return this.teamService.processTeamDeadlines();
  }

  async getUserTeams(userId: string) {
    return this.teamService.getUserTeams(userId);
  }

  async calculateTeamScore(teamId: string, weekId: string, league: League) {
    return this.teamService.calculateTeamScore(teamId, weekId, league);
  }
}
