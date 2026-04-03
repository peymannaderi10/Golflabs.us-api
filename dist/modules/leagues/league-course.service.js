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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeagueCourseService = void 0;
const database_1 = require("../../config/database");
class LeagueCourseService {
    addCourse(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const totalPar = data.holePars.reduce((sum, p) => sum + p, 0);
            const { data: course, error } = yield database_1.supabase
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
                throw new Error(`Failed to add course: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // If this is set as default, unset other defaults
            if (data.isDefault) {
                yield database_1.supabase
                    .from('league_courses')
                    .update({ is_default: false })
                    .eq('league_id', leagueId)
                    .neq('id', course.id);
            }
            return course;
        });
    }
    getCourses(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_courses')
                .select('*')
                .eq('league_id', leagueId)
                .order('is_default', { ascending: false })
                .order('created_at');
            if (error) {
                throw new Error(`Failed to fetch courses: ${error.message}`);
            }
            return data || [];
        });
    }
    updateCourse(courseId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const updateData = {};
            if (data.courseName !== undefined)
                updateData.course_name = data.courseName;
            if (data.holePars !== undefined) {
                updateData.hole_pars = data.holePars;
                updateData.total_par = data.holePars.reduce((sum, p) => sum + p, 0);
                updateData.num_holes = data.holePars.length;
            }
            if (data.isDefault !== undefined)
                updateData.is_default = data.isDefault;
            const { data: course, error } = yield database_1.supabase
                .from('league_courses')
                .update(updateData)
                .eq('id', courseId)
                .select()
                .single();
            if (error || !course) {
                throw new Error(`Failed to update course: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // If setting as default, unset others
            if (data.isDefault) {
                yield database_1.supabase
                    .from('league_courses')
                    .update({ is_default: false })
                    .eq('league_id', course.league_id)
                    .neq('id', course.id);
            }
            return course;
        });
    }
    deleteCourse(courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_courses')
                .delete()
                .eq('id', courseId);
            if (error) {
                throw new Error(`Failed to delete course: ${error.message}`);
            }
        });
    }
    assignCourseToWeek(weekId, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_weeks')
                .update({ league_course_id: courseId })
                .eq('id', weekId)
                .select()
                .single();
            if (error || !data) {
                throw new Error(`Failed to assign course to week: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return data;
        });
    }
    /**
     * Get the course for a specific week, falling back to league defaults.
     */
    getCourseForWeek(weekId, league) {
        return __awaiter(this, void 0, void 0, function* () {
            // First check if week has an assigned course
            const { data: week } = yield database_1.supabase
                .from('league_weeks')
                .select('league_course_id')
                .eq('id', weekId)
                .single();
            if (week === null || week === void 0 ? void 0 : week.league_course_id) {
                const { data: course } = yield database_1.supabase
                    .from('league_courses')
                    .select('*')
                    .eq('id', week.league_course_id)
                    .single();
                if (course)
                    return course;
            }
            // Fall back to default course for the league
            const { data: defaultCourse } = yield database_1.supabase
                .from('league_courses')
                .select('*')
                .eq('league_id', league.id)
                .eq('is_default', true)
                .single();
            return defaultCourse || null;
        });
    }
}
exports.LeagueCourseService = LeagueCourseService;
