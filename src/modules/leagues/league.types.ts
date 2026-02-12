// =====================================================
// League System Type Definitions
// =====================================================

export type TeamScoringFormat = 'best_ball' | 'combined' | 'scramble';

export interface League {
  id: string;
  location_id: string;
  name: string;
  format: 'stroke_play' | 'match_play' | 'team';
  num_holes: number;
  par_per_hole: number;
  total_weeks: number;
  current_week: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  season_fee: number;
  weekly_prize_pot: number;
  max_players: number;
  handicap_enabled: boolean;
  handicap_rounds_used: number;
  handicap_rounds_window: number;
  course_rotation: 'fixed' | 'rotating';
  scoring_type: 'net_stroke_play' | 'gross_stroke_play' | 'points_based';
  points_config: PointsConfig | null;
  payout_config: PayoutConfig | null;
  players_per_team: number;
  team_scoring_format: TeamScoringFormat;
  status: 'draft' | 'registration' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface PointsConfig {
  win_week: number;
  second_place: number;
  third_place: number;
  participation: number;
  low_gross_bonus: number;
}

export interface PayoutConfig {
  first_pct: number;    // e.g. 50
  second_pct: number;   // e.g. 30
  third_pct: number;    // e.g. 20
  payout_method: 'weekly' | 'end_of_season';
}

export interface PrizeLedgerEntry {
  id: string;
  league_id: string;
  league_week_id: string | null;
  league_player_id: string;
  type: 'contribution' | 'payout' | 'adjustment';
  amount: number;
  description: string | null;
  payout_status: 'pending' | 'paid' | 'cancelled' | null;
  placement: number | null;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
  // Joined fields
  player_name?: string;
}

export interface PrizePoolSummary {
  totalCollected: number;
  totalPaidOut: number;
  totalPending: number;
  balance: number;
  weeklyBreakdown: WeekPayoutSummary[];
}

export interface WeekPayoutSummary {
  weekId: string;
  weekNumber: number;
  date: string;
  prizePoolTotal: number;
  payoutsConfirmed: boolean;
  payouts: {
    playerId: string;
    playerName: string;
    placement: number;
    amount: number;
    status: string;
  }[];
}

export interface LeagueCourse {
  id: string;
  league_id: string;
  course_name: string;
  num_holes: number;
  hole_pars: number[];   // [4, 3, 5, 4, 3, 4, 5, 3, 4]
  total_par: number;
  is_default: boolean;
  created_at: string;
}

export interface LeaguePlayer {
  id: string;
  league_id: string;
  user_id: string;
  display_name: string;
  current_handicap: number;
  bay_assignment: string | null;
  enrollment_status: 'pending' | 'active' | 'withdrawn';
  season_paid: boolean;
  prize_pot_paid: boolean;
  stripe_payment_intent_id: string | null;
  league_team_id: string | null;
  joined_at: string;
}

export interface LeagueWeek {
  id: string;
  league_id: string;
  week_number: number;
  date: string;
  league_course_id: string | null;
  status: 'upcoming' | 'active' | 'scoring' | 'finalized';
  prize_pool_total: number;
  payouts_confirmed: boolean;
  notes: string | null;
  created_at: string;
}

export interface LeagueScore {
  id: string;
  league_week_id: string;
  league_player_id: string;
  hole_number: number;
  strokes: number;
  entered_via: 'kiosk' | 'employee' | 'player_app';
  bay_id: string | null;
  score_status: 'submitted' | 'confirmed' | 'overridden';
  confirmed_at: string | null;
  confirmed_by: string | null;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeagueStanding {
  id: string;
  league_id: string;
  league_player_id: string;
  league_team_id: string | null;
  weeks_played: number;
  total_gross: number;
  total_net: number;
  best_gross: number | null;
  avg_gross: number;
  current_rank: number;
  points: number;
  updated_at: string;
}

export interface HandicapHistoryEntry {
  id: string;
  league_player_id: string;
  league_week_id: string | null;
  old_handicap: number;
  new_handicap: number;
  calculation_details: {
    differentials: number[];
    best_used: number[];
    average: number;
    multiplier: number;
    type?: string;          // 'calculated' | 'manual_override'
    reason?: string;
    overridden_by?: string;
  };
  calculated_at: string;
}

// =====================================================
// Team Types
// =====================================================

export type TeamStatus = 'forming' | 'pending_payment' | 'active' | 'disqualified' | 'withdrawn';
export type TeamInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface LeagueTeam {
  id: string;
  league_id: string;
  team_name: string;
  captain_user_id: string;
  players_per_team: number;
  status: TeamStatus;
  created_at: string;
  // Joined fields
  captain_name?: string;
  members?: LeagueTeamMember[];
  invites?: LeagueTeamInvite[];
}

export interface LeagueTeamMember {
  league_player_id: string;
  user_id: string;
  display_name: string;
  enrollment_status: string;
  season_paid: boolean;
  prize_pot_paid: boolean;
  is_captain: boolean;
}

export interface LeagueTeamInvite {
  id: string;
  league_team_id: string;
  invited_user_id: string;
  invited_email: string;
  status: TeamInviteStatus;
  invite_token: string;
  invited_at: string;
  responded_at: string | null;
  // Joined fields
  invited_user_name?: string;
  team_name?: string;
  league_name?: string;
  league_id?: string;
}

// =====================================================
// Request / Response Types
// =====================================================

export interface CreateLeagueRequest {
  locationId: string;
  name: string;
  format?: 'stroke_play' | 'match_play' | 'team';
  numHoles?: number;
  parPerHole?: number;
  totalWeeks: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  seasonFee?: number;
  weeklyPrizePot?: number;
  maxPlayers?: number;
  handicapEnabled?: boolean;
  startDate: string; // YYYY-MM-DD of the first week
  courseRotation?: 'fixed' | 'rotating';
  scoringType?: 'net_stroke_play' | 'gross_stroke_play' | 'points_based';
  pointsConfig?: PointsConfig;
  payoutConfig?: PayoutConfig;
  courses?: CreateCourseRequest[];
  // Team league fields
  playersPerTeam?: number;
  teamScoringFormat?: TeamScoringFormat;
}

export interface UpdateLeagueRequest {
  name?: string;
  format?: 'stroke_play' | 'match_play' | 'team';
  numHoles?: number;
  parPerHole?: number;
  seasonFee?: number;
  weeklyPrizePot?: number;
  maxPlayers?: number;
  handicapEnabled?: boolean;
  startTime?: string;
  endTime?: string;
  courseRotation?: 'fixed' | 'rotating';
  scoringType?: 'net_stroke_play' | 'gross_stroke_play' | 'points_based';
  pointsConfig?: PointsConfig;
  payoutConfig?: PayoutConfig;
  playersPerTeam?: number;
  teamScoringFormat?: TeamScoringFormat;
}

export interface CreateCourseRequest {
  courseName: string;
  numHoles: number;
  holePars: number[];
  isDefault?: boolean;
}

export interface UpdateCourseRequest {
  courseName?: string;
  holePars?: number[];
  isDefault?: boolean;
}

export interface EnrollPlayerRequest {
  userId: string;
  displayName: string;
}

export interface CreateTeamRequest {
  teamName: string;
  captainUserId: string;
  teammateEmails: string[];      // emails of teammates to invite
}

export interface InviteTeammatesRequest {
  emails: string[];
}

export interface TeamPaymentRequest {
  userId: string;
  displayName: string;
}

export interface SubmitScoreRequest {
  leagueWeekId: string;
  leaguePlayerId: string;
  holeNumber: number;
  strokes: number;
  bayId?: string;
  enteredVia?: 'kiosk' | 'employee' | 'player_app';
}

export interface SubmitScoreResult {
  score_id: string;
  league_id: string;
  holes_entered: number;
  total_holes: number;
  round_gross: number;
  round_complete: boolean;
}

export interface OverrideScoreRequest {
  strokes: number;
  reason: string;
}

export interface OverrideHandicapRequest {
  handicap: number;
  reason: string;
}

export interface LeagueScorePayload {
  type: 'league_score_update';
  leagueId: string;
  weekId: string;
  player: {
    id: string;
    displayName: string;
    handicap: number;
  };
  holeNumber: number;
  strokes: number;
  roundGross: number;
  holesCompleted: number;
  totalHoles: number;
  timestamp: string;
}

export interface LeagueStandingsPayload {
  type: 'league_standings_update';
  leagueId: string;
  standings: StandingWithPlayer[];
  timestamp: string;
}

export interface StandingWithPlayer {
  rank: number;
  playerId: string;
  displayName: string;
  handicap: number;
  weeksPlayed: number;
  totalGross: number;
  totalNet: number;
  avgGross: number;
  bestGross: number | null;
  points: number;
  teamId?: string;
  teamName?: string;
}

export interface LiveLeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  handicap: number;
  todayGross: number;
  todayNet: number;
  thru: number;
  totalHoles: number;
  seasonGross: number;
  seasonNet: number;
  weeksPlayed: number;
  courseName?: string;
  coursePar?: number;
}

export interface TeamLeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  status: TeamStatus;
  members: {
    playerId: string;
    displayName: string;
    handicap: number;
    todayGross: number;
    todayNet: number;
    thru: number;
    seasonGross: number;
    seasonNet: number;
  }[];
  teamTodayGross: number;
  teamTodayNet: number;
  teamSeasonGross: number;
  teamSeasonNet: number;
  weeksPlayed: number;
  scoringFormat: TeamScoringFormat;
  courseName?: string;
  coursePar?: number;
}
