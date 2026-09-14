"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Users, FileText, Activity, ShieldCheck, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface AdminStats {
  total_users: number;
  total_documents: number;
}

interface UserInfo {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export default function AdminDashboard() {
  const { user, token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [usersList, setUsersList] = useState<UserInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (user.role !== "admin") {
        router.push("/");
      } else {
        fetchStats();
      }
    }
  }, [user, authLoading, router]);

  const fetchStats = async () => {
    try {
      // Token is automatically added by api interceptor, but we can be explicit if needed
      const [statsRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/auth/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/auth/admin/users`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setStats(statsRes.data);
      setUsersList(usersRes.data);
    } catch (err: any) {
      console.error("Failed to fetch admin stats:", err);
      setError("Failed to load admin statistics. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || (user?.role === "admin" && isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-[#060919]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060919] pb-12">
      <nav className="bg-white dark:bg-[#0c1226] border-b border-slate-200 dark:border-white/5 sticky top-0 z-30 shadow-sm backdrop-blur-xl bg-opacity-80 dark:bg-opacity-80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-500 dark:from-purple-400 dark:to-indigo-300">
                  Admin Dashboard
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Monitor overall usage and user statistics for LexiGuard AI.
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 flex items-start gap-3">
            <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Users Card */}
          <div className="bg-white dark:bg-[#0c1226] rounded-2xl border border-slate-200 dark:border-white/5 p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users className="w-24 h-24 text-blue-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Users</h3>
              <p className="text-4xl font-bold text-slate-900 dark:text-white mt-2">
                {stats?.total_users || 0}
              </p>
            </div>
          </div>

          {/* Documents Card */}
          <div className="bg-white dark:bg-[#0c1226] rounded-2xl border border-slate-200 dark:border-white/5 p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <FileText className="w-24 h-24 text-purple-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Documents Analyzed</h3>
              <p className="text-4xl font-bold text-slate-900 dark:text-white mt-2">
                {stats?.total_documents || 0}
              </p>
            </div>
          </div>

          {/* System Health Card */}
          <div className="bg-white dark:bg-[#0c1226] rounded-2xl border border-slate-200 dark:border-white/5 p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity className="w-24 h-24 text-emerald-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
                <Activity className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">System Health</h3>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                Operational
              </p>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Registered Users</h2>
          <div className="bg-white dark:bg-[#0c1226] rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {usersList.length > 0 ? (
                    usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{u.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            u.role === "admin" 
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                          {new Date(u.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
