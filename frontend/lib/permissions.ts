/**
 * Role-based access control helpers for frontend
 */

export interface UserPermissions {
  is_hr_recruiter: boolean;
  is_hr_manager: boolean;
  is_it_support: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  can_view_recruiter_insights?: boolean;
  can_view_system_analytics?: boolean;
}

export interface UserWithPermissions {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  groups: string[];
  permissions: UserPermissions;
}

export function isHRRecruiter(user: UserWithPermissions | null): boolean {
  return user?.permissions?.is_hr_recruiter || false;
}

export function isHRManager(user: UserWithPermissions | null): boolean {
  return user?.permissions?.is_hr_manager || false;
}

export function isITSupport(user: UserWithPermissions | null): boolean {
  return user?.permissions?.is_it_support || false;
}

export function isHRStaff(user: UserWithPermissions | null): boolean {
  return isHRRecruiter(user) || isHRManager(user);
}

export function canAccessTokenMonitoring(user: UserWithPermissions | null): boolean {
  return isHRManager(user) || isITSupport(user);
}

export function canManageUsers(user: UserWithPermissions | null): boolean {
  return isHRManager(user) || isITSupport(user) || user?.permissions?.is_superuser || false;
}

export function canAccessAnalytics(user: UserWithPermissions | null): boolean {
  return (
    user?.permissions?.can_view_recruiter_insights
    || isHRRecruiter(user)
    || isHRManager(user)
    || user?.permissions?.is_superuser
    || false
  );
}

export function canViewRecruiterInsights(user: UserWithPermissions | null): boolean {
  return user?.permissions?.can_view_recruiter_insights || isHRRecruiter(user) || isHRManager(user) || false;
}

export function canViewSystemAnalytics(user: UserWithPermissions | null): boolean {
  return user?.permissions?.can_view_system_analytics || isHRManager(user) || user?.permissions?.is_superuser || false;
}

export function canManageQuestions(user: UserWithPermissions | null): boolean {
  return isHRManager(user) || user?.permissions?.is_superuser || false;
}

export function getFilteredNavigation(user: UserWithPermissions | null) {
  const allItems = [
    { name: "Overview", href: "/hr-dashboard", icon: "🏠", roles: ["all"] },
    { name: "HR Review Queue", href: "/hr-dashboard/review-queue", icon: "📝", roles: ["hr_staff"] },
    { name: "Interview Review", href: "/hr-dashboard/results", icon: "📊", roles: ["hr_staff"] },
    { name: "Interview Records", href: "/hr-dashboard/history", icon: "🗂", roles: ["hr_staff"] },
    { name: "Applicants", href: "/hr-dashboard/applicants", icon: "👥", roles: ["hr_staff"] },
    { name: "Analytics", href: "/hr-dashboard/analytics", icon: "📈", roles: ["hr_staff"] },
    { name: "AI vs HR Comparison", href: "/hr-dashboard/ai-comparison", icon: "🤖", roles: ["hr_manager"] },
    {
      name: "Token Monitoring",
      href: "/hr-dashboard/token-monitoring",
      icon: "🔑",
      roles: ["hr_manager", "it_support"],
    },
    { name: "Questions", href: "/hr-dashboard/questions", icon: "❓", roles: ["hr_manager"] },
    { name: "Job Categories", href: "/hr-dashboard/job-categories", icon: "💼", roles: ["superuser"] },
    { name: "Question Types", href: "/hr-dashboard/question-types", icon: "📄", roles: ["hr_manager"] },
    { name: "Users", href: "/hr-dashboard/users", icon: "👤", roles: ["hr_manager", "it_support"] },
  ];

  return allItems.filter((item) => {
    if (item.roles.includes("all")) return true;
    if (item.roles.includes("hr_staff") && isHRStaff(user)) return true;
    if (item.roles.includes("hr_manager") && isHRManager(user)) return true;
    if (item.roles.includes("it_support") && isITSupport(user)) return true;
    if (item.roles.includes("superuser") && user?.permissions?.is_superuser) return true;
    if (user?.permissions?.is_superuser) return true;
    return false;
  });
}
