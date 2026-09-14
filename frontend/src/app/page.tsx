"use client";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  Scale, 
  FileText, 
  ShieldCheck, 
  ShieldAlert,
  Layers, 
  MessageSquare, 
  Clock, 
  Shield, 
  FileSearch, 
  CheckCircle2,
  LayoutDashboard,
  FolderKanban,
  Activity,
  Sun,
  Moon,
  Upload,
  UserCircle,
  LogOut,
  ChevronDown,
  Settings,
  X
} from "lucide-react";
import Link from "next/link";
import OverviewDashboard from "../components/OverviewDashboard";
import ContractAuditView from "../components/ContractAuditView";
import ChatInterface from "../components/ChatInterface";
import RepositoryView from "../components/RepositoryView";
import { useTheme } from "../context/ThemeContext";
import { 
  fetchDocuments, 
  fetchSessions, 
  deleteSession, 
  DocumentMeta, 
  ChatSession, 
  ContractAuditReport,
  checkBackendHealth 
} from "../lib/api";

type ActiveTab = "overview" | "auditor" | "copilot" | "repository";

export default function DashboardPage() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [triggerSummaryDocId, setTriggerSummaryDocId] = useState<string | null>(null);
  const [pendingCopilotPrompt, setPendingCopilotPrompt] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<{ status: string; has_gemini_key: boolean }>({
    status: "checking",
    has_gemini_key: false,
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const userFullName = user?.name && user.name.trim()
    ? user.name.trim()
    : (user?.email ? user.email.split("@")[0].charAt(0).toUpperCase() + user.email.split("@")[0].slice(1) : "User");
  const userDisplayName = userFullName.split(" ")[0];
  const userInitial = userFullName.charAt(0).toUpperCase();

  const loadDocs = async () => {
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
      if (docs.length > 0 && !selectedDocId) {
        setSelectedDocId(docs[0].doc_id);
      }
    } catch (err) {
      console.warn("Failed to load documents", err);
    }
  };

  const loadSessions = async () => {
    try {
      const sess = await fetchSessions();
      setSessions(sess);
    } catch (err) {
      console.warn("Failed to load sessions", err);
    }
  };

  const checkHealth = async () => {
    const health = await checkBackendHealth();
    setBackendHealth(health);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.id) {
      setDocuments([]);
      setSessions([]);
      setSelectedDocId(null);
      setActiveSessionId(null);
      loadDocs();
      loadSessions();
      checkHealth();
      const interval = setInterval(checkHealth, 15000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  // Scroll to top and re-fetch documents when switching tabs
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    if (activeTab === "repository" || activeTab === "overview") {
      loadDocs();
    }
  }, [activeTab]);

  const handleAuditComplete = (audit: ContractAuditReport) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.doc_id === audit.doc_id
          ? {
              ...d,
              risk_score: audit.overall_risk_score,
              risk_level: audit.risk_level,
              is_legal_contract: audit.is_legal_contract,
              document_category: audit.document_category,
            }
          : d
      )
    );
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    const session = sessions.find((s) => s.id === sessionId);
    if (session && session.doc_id) {
      setSelectedDocId(session.doc_id);
    }
    setActiveTab("copilot");
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setActiveTab("copilot");
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  const selectedDoc = documents.find((d) => d.doc_id === selectedDocId) || (documents.length > 0 ? documents[0] : null);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#060919] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100/90 via-slate-50 to-indigo-50/25 dark:from-[#060919] dark:via-[#060919] dark:to-[#080d24] text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-indigo-200 transition-colors duration-300">
      {/* Background Ambient Glow Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[15%] w-[500px] h-[500px] bg-indigo-500/15 dark:bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] bg-sky-400/15 dark:bg-sky-600/10 rounded-full blur-[160px]" />
      </div>

      {/* Top Header & Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-[#060919]/90 backdrop-blur-xl px-6 py-3 shadow-xs dark:shadow-xl dark:shadow-black/30 transition-colors duration-300">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-sky-500 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-800 dark:from-white dark:via-indigo-100 dark:to-sky-200 bg-clip-text text-transparent">
                LexiGuard AI
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Enterprise Legal Contract Intelligence & Risk Auditor</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center p-1.5 rounded-2xl bg-slate-200/60 dark:bg-slate-900/80 border border-slate-300/70 dark:border-slate-800/90 shadow-inner backdrop-blur-md">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "overview"
                  ? "bg-white dark:bg-gradient-to-r dark:from-indigo-900/90 dark:to-slate-800 text-indigo-700 dark:text-indigo-200 border border-slate-200 dark:border-indigo-500/40 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab("auditor")}
              className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "auditor"
                  ? "bg-white dark:bg-gradient-to-r dark:from-indigo-900/90 dark:to-slate-800 text-indigo-700 dark:text-indigo-200 border border-slate-200 dark:border-indigo-500/40 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40"
              }`}
            >
              <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Doc & Risk Auditor</span>
            </button>

            <button
              onClick={() => setActiveTab("copilot")}
              className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "copilot"
                  ? "bg-white dark:bg-gradient-to-r dark:from-indigo-900/90 dark:to-slate-800 text-indigo-700 dark:text-indigo-200 border border-slate-200 dark:border-indigo-500/40 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40"
              }`}
            >
              <MessageSquare className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Legal Copilot</span>
            </button>

            <button
              onClick={() => setActiveTab("repository")}
              className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "repository"
                  ? "bg-white dark:bg-gradient-to-r dark:from-indigo-900/90 dark:to-slate-800 text-indigo-700 dark:text-indigo-200 border border-slate-200 dark:border-indigo-500/40 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40"
              }`}
            >
              <FolderKanban className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Repository ({documents.length})</span>
            </button>
          </nav>

          {/* Right Controls: Quick Upload + Health Status + Theme Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Admin Console Pill (Only for Admins) */}
            {user?.role === "admin" && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 text-xs font-bold transition-all shadow-xs cursor-pointer whitespace-nowrap"
                title="Open Enterprise Admin Console"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                <span className="hidden sm:inline">Admin Console</span>
              </Link>
            )}

            {/* Quick Upload Button */}
            <button
              onClick={() => setActiveTab("overview")}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-bold shadow-md shadow-indigo-500/25 flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 whitespace-nowrap shrink-0"
              title="Upload New Agreement or Document"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Upload PDF</span>
            </button>
            
            {/* Ultra-Clean User Profile Pill */}
            <div className="relative group ml-1">
              <button 
                className="flex items-center gap-2 py-1 px-1.5 pr-2.5 rounded-full bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-xs"
                title={`${userDisplayName} (${user?.email})`}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {userInitial}
                </div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 hidden sm:inline">
                  {userDisplayName}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform duration-150" />
              </button>
              
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-[#0c1226] border border-slate-200/90 dark:border-slate-800 shadow-2xl p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 transform origin-top-right z-50 backdrop-blur-xl">
                {/* User Identity Header */}
                <div className="px-3 py-2 mb-1 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {userFullName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={user?.email}>
                    {user?.email}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {user?.role === "admin" && (
                    <Link 
                      href="/admin" 
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Admin Console</span>
                    </Link>
                  )}

                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer text-left"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>Settings</span>
                  </button>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800/80" />

                  <button 
                    onClick={logout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle Light/Dark Theme"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-sm flex items-center gap-1.5 text-xs font-semibold"
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
                  <span className="hidden sm:inline text-[11px]">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-600" />
                  <span className="hidden sm:inline text-[11px]">Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Conditional Server Offline Alert Banner (Only shown if disconnected) */}
      {backendHealth.status === "offline" && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-2 text-center text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          <span>Backend server is offline. Please make sure the Python FastAPI service is running on port 8000.</span>
        </div>
      )}

      {/* Main Workspace Container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col">
        {activeTab === "overview" && (
          <OverviewDashboard
            documents={documents}
            onUploadSuccess={(newDoc) => {
              setDocuments((prev) => [newDoc, ...prev]);
              setSelectedDocId(newDoc.doc_id);
              setActiveTab("auditor");
            }}
            onBatchUploadSuccess={(newDocs) => {
              setDocuments((prev) => [...newDocs, ...prev]);
              if (newDocs.length > 0) {
                setSelectedDocId(newDocs[0].doc_id);
                setActiveTab("auditor");
              }
            }}
            onNavigateToAudit={(docId) => {
              setSelectedDocId(docId);
              setActiveTab("auditor");
            }}
            onNavigateToCopilot={(docId, prompt) => {
              if (docId) setSelectedDocId(docId);
              if (prompt) setPendingCopilotPrompt(prompt);
              setActiveTab("copilot");
            }}
            onNavigateToRepository={() => setActiveTab("repository")}
          />
        )}

        {activeTab === "auditor" && (
          <ContractAuditView
            selectedDoc={selectedDoc}
            documents={documents}
            onSelectDoc={(id) => setSelectedDocId(id)}
            onAuditComplete={handleAuditComplete}
            onAskCopilot={(prompt) => {
              if (prompt) setPendingCopilotPrompt(prompt);
              setActiveTab("copilot");
            }}
            onNavigateToCopilot={(docId) => {
              if (docId) setSelectedDocId(docId);
              setActiveTab("copilot");
            }}
          />
        )}

        {activeTab === "copilot" && (
          <div className="flex-1 flex flex-col">
            <ChatInterface
              documents={documents}
              selectedDocId={selectedDocId}
              setSelectedDocId={setSelectedDocId}
              onUploadDocSuccess={(newDoc) => {
                setDocuments((prev) => [newDoc, ...prev]);
                setSelectedDocId(newDoc.doc_id);
              }}
              triggerSummaryDocId={triggerSummaryDocId}
              onResetTriggerSummary={() => setTriggerSummaryDocId(null)}
              pendingPrompt={pendingCopilotPrompt}
              onClearPendingPrompt={() => setPendingCopilotPrompt(null)}
              activeSessionId={activeSessionId}
              sessions={sessions}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              onDeleteSession={handleDeleteSession}
              onRefreshSessions={loadSessions}
              setActiveSessionId={setActiveSessionId}
            />
          </div>
        )}

        {activeTab === "repository" && (
          <RepositoryView
            documents={documents}
            onSelectDocForAudit={(docId) => {
              setSelectedDocId(docId);
              setActiveTab("auditor");
            }}
            onSelectDocForCopilot={(docId) => {
              setSelectedDocId(docId);
              setActiveTab("copilot");
            }}
            onDeleteSuccess={(deletedId) => {
              setDocuments((prev) => prev.filter((d) => d.doc_id !== deletedId));
              if (selectedDocId === deletedId) {
                const remaining = documents.filter((d) => d.doc_id !== deletedId);
                setSelectedDocId(remaining.length > 0 ? remaining[0].doc_id : null);
              }
            }}
            onNavigateToOverview={() => setActiveTab("overview")}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 dark:border-slate-800/60 bg-white/50 dark:bg-slate-950/40 py-3.5 px-6 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 LexiGuard AI • Enterprise Legal Contract Intelligence & Risk Auditor</span>
          <span className="text-slate-400 dark:text-slate-500 font-medium">Confidential & Secure AI Legal Due Diligence</span>
        </div>
      </footer>

      {/* Account Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#0c1226] border border-slate-200/90 dark:border-slate-800 shadow-2xl p-6 relative">
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white font-bold text-base flex items-center justify-center shadow-md">
                {userInitial}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  {userFullName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user?.email}
                </p>
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Account Role</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                  {user?.role === "admin" ? "System Administrator" : "Standard User"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Appearance</span>
                <button
                  onClick={toggleTheme}
                  className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer"
                >
                  {theme === "dark" ? "Dark Mode" : "Light Mode"}
                </button>
              </div>

              <div className="flex items-center justify-between py-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Platform Version</span>
                <span className="font-mono text-slate-400">LexiGuard AI v2.4 (Enterprise)</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}