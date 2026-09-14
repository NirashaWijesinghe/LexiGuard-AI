"use client";

import React from "react";
import { 
  Scale, 
  ShieldAlert, 
  MessageSquare, 
  FileText, 
  Sparkles, 
  ArrowRight, 
  Layers,
  Upload,
  Activity
} from "lucide-react";
import { DocumentMeta } from "../lib/api";
import FileUpload from "./FileUpload";

interface OverviewDashboardProps {
  documents: DocumentMeta[];
  onUploadSuccess: (newDoc: DocumentMeta) => void;
  onBatchUploadSuccess: (newDocs: DocumentMeta[]) => void;
  onNavigateToAudit: (docId: string) => void;
  onNavigateToCopilot: (docId?: string, prompt?: string) => void;
  onNavigateToRepository?: () => void;
}

export default function OverviewDashboard({
  documents,
  onUploadSuccess,
  onBatchUploadSuccess,
  onNavigateToAudit,
  onNavigateToCopilot,
}: OverviewDashboardProps) {
  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1 pb-10">
      {/* Top Hero & Quick Upload Split Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Hero Welcome Banner (7 cols) */}
        <div className="lg:col-span-7 p-7 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white border border-indigo-500/20 backdrop-blur-xl shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-80 h-80 rounded-full bg-sky-500/10 blur-[100px] pointer-events-none" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-3 shadow-inner">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>Enterprise Legal Contract Intelligence & Risk Auditor</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
              Audit Legal Contracts with{" "}
              <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
                Automated AI Due Diligence
              </span>
            </h2>

            <p className="mt-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              LexiGuard AI parses commercial agreements, calculates contract risk scores (0–100), detects hazardous liability traps, identifies omitted protective terms, and powers an interactive Legal Copilot.
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-indigo-500/20">
            <button
              onClick={() => {
                if (documents.length > 0) onNavigateToAudit(documents[0].doc_id);
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Scale className="w-4 h-4" />
              <span>Open Risk & Redline Matrix</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => onNavigateToCopilot()}
              className="px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700/80 shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-sky-400" />
              <span>Ask Legal Copilot</span>
            </button>
          </div>
        </div>

        {/* Right Primary Upload Dropzone (5 cols) - Prominently at Top */}
        <div className="lg:col-span-5 p-6 rounded-3xl bg-white dark:bg-slate-900/80 border-2 border-indigo-500/30 dark:border-indigo-500/40 backdrop-blur-xl shadow-lg dark:shadow-2xl dark:shadow-indigo-950/40 flex flex-col justify-between gap-3 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Upload className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Upload Legal Agreement
              </h3>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
              Instant AI Scan
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <FileUpload
              onUploadSuccess={onUploadSuccess}
              onBatchUploadSuccess={onBatchUploadSuccess}
            />
          </div>
        </div>
      </div>

      {/* Visual 3-Step Process Flow (Horizontal Guide) */}
      <div className="p-6 sm:p-7 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-sm dark:shadow-xl flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
              How LexiGuard AI Works
            </h3>
          </div>
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-500/30">
            Instant AI Due Diligence Flow
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 flex items-start gap-4 hover:border-indigo-400 dark:hover:border-indigo-500/40 transition-all group">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">Step 1</span>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Upload & Smart Scan</h4>
              </div>
              <p className="text-xs sm:text-[13.5px] text-slate-700 dark:text-slate-200 mt-1.5 leading-relaxed font-normal">
                Upload any legal agreement. AI instantly parses and indexes every page and clause in seconds.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 flex items-start gap-4 hover:border-amber-400 dark:hover:border-amber-500/40 transition-all group">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">Step 2</span>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Automated Risk Audit</h4>
              </div>
              <p className="text-xs sm:text-[13.5px] text-slate-700 dark:text-slate-200 mt-1.5 leading-relaxed font-normal">
                Calculates an instant Risk Score (0–100), flagging unfair terms, liability traps, and missing protections.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 flex items-start gap-4 hover:border-emerald-400 dark:hover:border-emerald-500/40 transition-all group">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">Step 3</span>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Ask AI Legal Assistant</h4>
              </div>
              <p className="text-xs sm:text-[13.5px] text-slate-700 dark:text-slate-200 mt-1.5 leading-relaxed font-normal">
                Ask questions, draft safer counter-clauses, and get clear answers backed by exact page citations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
