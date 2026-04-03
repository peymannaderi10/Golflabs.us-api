import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import {
  League,
  LeagueCourse,
  LeagueWeek,
  CreateCourseRequest,
  UpdateCourseRequest,
} from './league.types';

export class LeagueCourseService {

  async addCourse(leagueId: string, data: CreateCourseRequest): Promise<LeagueCourse> {
    const totalPar = data.holePars.reduce((sum, p) => sum + p, 0);

    const { data: course, error } = await supabase
      .from('league_courses')
      .insert({
        league_id: leagueId,
        course_name: data.courseName,
        num_holes: data.numHoles,
        hole_pars: data.holePars,
        total_par: totalPar,
        is_default: data.isDefault || false,
      })
      .select()
      .single();

    if (error || !course) {
      throw new Error(`Failed to add course: ${error?.message}`);
    }

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await supabase
        .from('league_courses')
        .update({ is_default: false })
        .eq('league_id', leagueId)
        .neq('id', course.id);
    }

    return course;
  }

  async getCourses(leagueId: string): Promise<LeagueCourse[]> {
    const { data, error } = await supabase
      .from('league_courses')
      .select('*')
      .eq('league_id', leagueId)
      .order('is_default', { ascending: false })
      .order('created_at');

    if (error) {
      throw new Error(`Failed to fetch courses: ${error.message}`);
    }

    return data || [];
  }

  async updateCourse(courseId: string, data: UpdateCourseRequest): Promise<LeagueCourse> {
    const updateData: any = {};
    if (data.courseName !== undefined) updateData.course_name = data.courseName;
    if (data.holePars !== undefined) {
      updateData.hole_pars = data.holePars;
      updateData.total_par = data.holePars.reduce((sum: number, p: number) => sum + p, 0);
      updateData.num_holes = data.holePars.length;
    }
    if (data.isDefault !== undefined) updateData.is_default = data.isDefault;

    const { data: course, error } = await supabase
      .from('league_courses')
      .update(updateData)
      .eq('id', courseId)
      .select()
      .single();

    if (error || !course) {
      throw new Error(`Failed to update course: ${error?.message}`);
    }

    // If setting as default, unset others
    if (data.isDefault) {
      await supabase
        .from('league_courses')
        .update({ is_default: false })
        .eq('league_id', course.league_id)
        .neq('id', course.id);
    }

    return course;
  }

  async deleteCourse(courseId: string): Promise<void> {
    const { error } = await supabase
      .from('league_courses')
      .delete()
      .eq('id', courseId);

    if (error) {
      throw new Error(`Failed to delete course: ${error.message}`);
    }
  }

  async assignCourseToWeek(weekId: string, courseId: string): Promise<LeagueWeek> {
    const { data, error } = await supabase
      .from('league_weeks')
      .update({ league_course_id: courseId })
      .eq('id', weekId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to assign course to week: ${error?.message}`);
    }

    return data;
  }

  /**
   * Get the course for a specific week, falling back to league defaults.
   */
  async getCourseForWeek(weekId: string, league: League): Promise<LeagueCourse | null> {
    // First check if week has an assigned course
    const { data: week } = await supabase
      .from('league_weeks')
      .select('league_course_id')
      .eq('id', weekId)
      .single();

    if (week?.league_course_id) {
      const { data: course } = await supabase
        .from('league_courses')
        .select('*')
        .eq('id', week.league_course_id)
        .single();
      if (course) return course;
    }

    // Fall back to default course for the league
    const { data: defaultCourse } = await supabase
      .from('league_courses')
      .select('*')
      .eq('league_id', league.id)
      .eq('is_default', true)
      .single();

    return defaultCourse || null;
  }
}
