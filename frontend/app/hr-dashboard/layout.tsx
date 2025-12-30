"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { clearHRAuth, getHRUser, isHRAuthenticated } from "@/lib/auth-hr";
import { authAPI } from "@/lib/api";

export default function HRDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);

  useEffect(() => {
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const checkAccess = async () => {
    if (!isHRAuthenticated()) {
      router.push("/hr-login");
      return;
    }

    try {
      const authRes = await authAPI.checkAuth();
      const perms = authRes.data.permissions;
      const userType = authRes.data?.user_type || authRes.data?.user?.user_type || getHRUser()?.user_type;

      // Block non-HR tokens from reaching HR pages
      if (!userType?.startsWith("hr_") && !perms.is_hr_recruiter && !perms.is_hr_manager && !perms.is_superuser) {
        clearHRAuth();
        router.push("/hr-login");
        return;
      }

      const isITSupportOnly = perms.is_it_support && !perms.is_hr_manager && !perms.is_hr_recruiter && !perms.is_superuser;
      if (isITSupportOnly && !pathname.startsWith("/hr-dashboard/token-monitoring")) {
        router.push("/it-dashboard");
        return;
      }

      if (!perms.is_hr_recruiter && !perms.is_hr_manager && !perms.is_superuser) {
        router.push("/hr-login");
        return;
      }

      const restrictedManagerPaths = [
        "/hr-dashboard/questions",
        "/hr-dashboard/question-types",
        "/hr-dashboard/job-categories",
        "/hr-dashboard/users",
        "/hr-dashboard/ai-comparison",
      ];
      const isManagerRoute = restrictedManagerPaths.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`)
      );
      const canAccessManagerRoutes = perms.is_hr_manager || perms.is_superuser;
      setIsForbidden(isManagerRoute && !canAccessManagerRoutes);

      const userData = getHRUser();
      setUser(userData);
      setPermissions(perms);
      setLoading(false);
    } catch (error) {
      console.error("Access check error:", error);
      router.push("/hr-login");
    }
  };

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem("hr_refresh");
      if (refreshToken) {
        await authAPI.logout(refreshToken);
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearHRAuth();
      router.push("/hr-login");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (isForbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="max-w-lg w-full bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
          <div className="text-4xl font-bold text-red-600">403</div>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">Access denied</h1>
          <p className="mt-2 text-gray-600">
            This page is restricted to HR Managers only. Please contact your administrator if you believe you should
            have access.
          </p>
          <button
            onClick={() => router.push("/hr-dashboard")}
            className="mt-6 px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  type NavItem =
    | { type: "link"; name: string; href: string; icon: string }
    | { type: "section"; label: string };

  const baseNavigation: NavItem[] = [
    { type: "link", name: "Overview", href: "/hr-dashboard", icon: "OV" },
    { type: "link", name: "HR Review Queue", href: "/hr-dashboard/review-queue", icon: "RQ" },
    { type: "link", name: "Interview Review", href: "/hr-dashboard/results", icon: "IR" },
    { type: "link", name: "Interview Records", href: "/hr-dashboard/history", icon: "REC" },
    { type: "link", name: "Applicants", href: "/hr-dashboard/applicants", icon: "APP" },
    { type: "link", name: "Positions", href: "/hr-dashboard/positions", icon: "POS" },
    { type: "link", name: "Analytics", href: "/hr-dashboard/analytics", icon: "AN" },
  ];

  const managerToolsNavigation: NavItem[] = [
    { type: "link", name: "AI vs HR Comparison", href: "/hr-dashboard/ai-comparison", icon: "AI" },
  ];

  const governanceNavigation: NavItem[] = [
    { type: "link", name: "Questions", href: "/hr-dashboard/questions", icon: "Q" },
    { type: "link", name: "Question Types", href: "/hr-dashboard/question-types", icon: "QT" },
    { type: "link", name: "Job Categories", href: "/hr-dashboard/job-categories", icon: "CAT" },
    { type: "link", name: "Users", href: "/hr-dashboard/users", icon: "USR" },
  ];

  const tokenMonitoringItem: NavItem = { type: "link", name: "Token Monitoring", href: "/hr-dashboard/token-monitoring", icon: "TOK" };

  const buildNavigation = () => {
    const isHRManagerRole = permissions?.is_hr_manager || permissions?.is_superuser;
    const isHRRecruiterRole = permissions?.is_hr_recruiter;
    const isHRStaffRole = isHRManagerRole || isHRRecruiterRole;
    const isITSupportOnly = permissions?.is_it_support && !isHRStaffRole && !permissions?.is_superuser;

    if (isITSupportOnly) {
      return [tokenMonitoringItem];
    }

    const items = isHRStaffRole ? [...baseNavigation] : [];

    if (isHRManagerRole && managerToolsNavigation.length > 0) {
      items.push({ type: "section", label: "Manager Tools" });
      items.push(...managerToolsNavigation);
    }

    if (permissions?.is_hr_manager || permissions?.is_it_support || permissions?.is_superuser) {
      const analyticsIndex = items.findIndex(
        (item) => item.type === "link" && item.href === "/hr-dashboard/analytics"
      );
      if (analyticsIndex >= 0) {
        items.splice(analyticsIndex + 1, 0, tokenMonitoringItem);
      } else {
        items.push(tokenMonitoringItem);
      }
    }

    if (isHRManagerRole) {
      items.push({ type: "section", label: "Governance" });
      items.push(...governanceNavigation);
    }

    return items;
  };

  const navigation = buildNavigation();


  return (
    <div className="min-h-screen bg-gray-100">
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-slate-900 to-purple-900 text-white transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-purple-800">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-600 p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold">HireNow HR</span>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navigation.map((item) => {
              if (item.type === "section") {
                return (
                  <div
                    key={`section-${item.label}`}
                    className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-purple-200/80"
                  >
                    {item.label}
                  </div>
                );
              }

              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive ? "bg-purple-700 text-white" : "text-gray-300 hover:bg-purple-800 hover:text-white"
                  }`}
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-purple-800">
            <div className="mb-3">
              <p className="text-sm text-gray-400">Signed in as</p>
              <p className="font-medium truncate">{user?.username}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.user_type?.replace("_", " ")}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`transition-all duration-300 ${isSidebarOpen ? "ml-64" : "ml-0"}`}>
        <div className="bg-white shadow-sm sticky top-0 z-40">
          <div className="flex items-center justify-between px-6 py-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center space-x-4">
              <button className="p-2 rounded-lg hover:bg-gray-100 relative">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500"></span>
              </button>
            </div>
          </div>
        </div>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
