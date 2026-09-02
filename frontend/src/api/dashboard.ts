import request from './request';

export interface MonthlyTrend { month: string; meeting_count: number; company_count: number }
export interface HotPosition { position_name: string; recruit_count: number }
export interface OverviewData {
  meeting_count: number;
  company_count: number;
  position_count: number;
  recruit_total: number;
  graduate_count: number;
  graduation_year: string;
  supply_demand_ratio: string;
  monthly_trend: MonthlyTrend[];
  hot_positions: HotPosition[];
}
export interface CollegeDemand { college_name: string; position_count: number; recruit_count: number; student_count: number; supply_demand_ratio: string; ratio_value: number }
export interface SupplyDemandItem { college_name: string; student_count: number; recruit_count: number; ratio: string; ratio_value: number; status: string; warning: boolean }
export interface UserActivity { college_name: string; active_user_count: number; browse_count: number }
export interface InactiveStudentItem { college_name: string; inactive_count: number }
export interface CollegeAnalysisData {
  college_demand: CollegeDemand[];
  supply_demand_analysis: SupplyDemandItem[];
  user_activity: UserActivity[];
  inactive_students: InactiveStudentItem[];
  graduation_year: string;
}

export const dashboardApi = {
  getOverview: () => request.get<OverviewData>('/api/statistics/overview'),
  getCollegeAnalysis: () => request.get<CollegeAnalysisData>('/api/statistics/college'),
};