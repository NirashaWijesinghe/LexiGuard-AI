"use client";

import React, { useState } from "react";
import { FileText, Trash2, Search, Sparkles, X, AlertTriangle, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { DocumentMeta, deleteDocument } from "../lib/api";

interface DocumentListProps {
  documents: DocumentMeta[];
  selectedDocId: string | null;
  onSelectDoc: (docId: string | null) => void;
  onDeleteSuccess: (docId: string) => void;
  onSummarizeDoc?: (docId: string) => void;
  onAuditDoc?: (docId: string) => void;
}

export default function DocumentList({
  documents,
  selectedDocId,
  onSelectDoc,
  onDeleteSuccess,
  onSummarizeDoc,
  onAuditDoc,
}: DocumentListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [docToDelete, setDocToDelete] = useState<DocumentMeta | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDocument(docToDelete.doc_id);
      onDeleteSuccess(docToDelete.doc_id);
      setDocToDelete(null);
    } catch (err) {
      alert("Failed to delete agreement. Please check the backend.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDocs = documents.filter((d) =>
    d.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Contract Repository ({documents.length})
        </h3>
        <button
          onClick={() => onSelectDoc(null)}
          className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
            selectedDocId === null
              ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40"
              : "bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          All Contracts
        </button>
      </div>

      {documents.length > 0 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contracts by name..."
            className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-8 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400">
          No contracts uploaded yet. Upload a legal agreement (PDF or Word .docx) above to begin.
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400">
          No agreements match "{searchQuery}".
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {filteredDocs.map((doc) => {
            const isSelected = selectedDocId === doc.doc_id;
            const isNonContract = doc.is_legal_contract === false || doc.risk_level === "NON_CONTRACT";
            const hasRisk = !isNonContract && doc.risk_score !== undefined && doc.risk_score !== null;
            const isHigh = hasRisk && doc.risk_score! >= 65;
            const isMed = hasRisk && doc.risk_score! >= 35 && doc.risk_score! < 65;
            
            return (
              <div
                key={doc.doc_id}
                onClick={() => onSelectDoc(isSelected ? null : doc.doc_id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2 group ${
                  isSelected
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-500/50 shadow-xs"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/90"
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                    isSelected ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}>
                    {isNonContract ? <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" /> : <Scale className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${isSelected ? "text-indigo-900 dark:text-indigo-200 font-semibold" : "text-slate-800 dark:text-slate-300"}`}>
                      {doc.filename}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{doc.total_pages} pages</span>
                      <span>•</span>
                      <span>{doc.file_size_kb} KB</span>
                      {isNonContract ? (
                        <>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/20">
                            {doc.document_category || "General Doc"}
                          </span>
                        </>
                      ) : (
                        hasRisk && (
                          <>
                            <span>•</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isHigh ? "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400" : isMed ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            }`}>
                              Risk: {doc.risk_score}/100
                            </span>
                          </>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onAuditDoc && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDoc(doc.doc_id);
                        onAuditDoc(doc.doc_id);
                      }}
                      className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/60 border border-transparent hover:border-amber-200 dark:hover:border-amber-500/30 transition-all cursor-pointer"
                      title="Run Legal Risk Audit"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onSummarizeDoc && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDoc(doc.doc_id);
                        onSummarizeDoc(doc.doc_id);
                      }}
                      className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all cursor-pointer"
                      title="Generate Legal Summary"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDocToDelete(doc);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Delete contract"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-lg shadow-rose-500/10">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">Delete Document?</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Are you sure you want to delete <span className="text-rose-600 dark:text-rose-300 font-semibold truncate">"{docToDelete.filename}"</span>? All indexed vector embeddings will be permanently removed from ChromaDB.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full pt-2">
              <button
                onClick={() => setDocToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-xs font-semibold text-white transition-all shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
