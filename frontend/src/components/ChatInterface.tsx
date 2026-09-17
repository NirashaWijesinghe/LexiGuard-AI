"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Trash2, 
  Loader2, 
  Copy, 
  Check, 
  Download, 
  FileText, 
  BarChart3, 
  AlertCircle, 
  HelpCircle,
  FileDown,
  Printer,
  ClipboardCopy,
  CheckCheck,
  ChevronDown,
  Paperclip,
  X,
  History,
  Plus,
  MessageSquare
} from "lucide-react";
import { 
  sendChatMessage, 
  summarizeDocument, 
  fetchSessionDetail,
  uploadDocument,
  ChatMessage, 
  DocumentMeta, 
  ChatSession 
} from "../lib/api";
import SourceBadge from "./SourceBadge";

interface ChatInterfaceProps {
  documents: DocumentMeta[];
  selectedDocId: string | null;
  setSelectedDocId?: (docId: string | null) => void;
  onUploadDocSuccess?: (doc: DocumentMeta) => void;
  triggerSummaryDocId?: string | null;
  onResetTriggerSummary?: () => void;
  pendingPrompt?: string | null;
  onClearPendingPrompt?: () => void;
  activeSessionId: string | null;
  sessions: ChatSession[];
  onRefreshSessions: () => void;
  onSelectSession?: (sessionId: string) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  onNewChat: () => void;
  onDeleteSession?: (sessionId: string, e: React.MouseEvent) => void;
}

export default function ChatInterface({ 
  documents, 
  selectedDocId,
  setSelectedDocId,
  onUploadDocSuccess,
  triggerSummaryDocId,
  onResetTriggerSummary,
  pendingPrompt,
  onClearPendingPrompt,
  activeSessionId,
  sessions,
  onRefreshSessions,
  onSelectSession,
  setActiveSessionId,
  onNewChat,
  onDeleteSession
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAttach, setIsUploadingAttach] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [allCopied, setAllCopied] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (historyMenuRef.current && !historyMenuRef.current.contains(event.target as Node)) {
        setShowHistoryMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedDoc = documents.find((d) => d.doc_id === selectedDocId);

  const scrollToBottom = () => {
    if (messages.length > 0 && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Load session messages when activeSessionId changes
  useEffect(() => {
    let isCancelled = false;
    if (activeSessionId) {
      const loadSessionMessages = async () => {
        setIsLoading(true);
        try {
          const detail = await fetchSessionDetail(activeSessionId);
          if (!isCancelled) {
            if (detail && detail.messages) {
              // Safety validation: if this session is tied to a doc, make sure it matches selectedDocId!
              if (selectedDocId && detail.session?.doc_id && detail.session.doc_id !== selectedDocId) {
                console.warn("[ChatInterface] Session doc_id mismatch with selected doc, clearing messages");
                setActiveSessionId(null);
                setMessages([]);
              } else {
                setMessages(detail.messages);
              }
            } else {
              setMessages([]);
            }
          }
        } catch (error) {
          console.error("Failed to load session messages", error);
          if (!isCancelled) setMessages([]);
        } finally {
          if (!isCancelled) setIsLoading(false);
        }
      };
      loadSessionMessages();
    } else {
      setMessages([]);
    }
    return () => {
      isCancelled = true;
    };
  }, [activeSessionId, selectedDocId, setActiveSessionId]);

  // Synchronize or reset session when selected document changes
  useEffect(() => {
    if (selectedDocId) {
      // Find matching session for this selected document
      const matchingSession = sessions.find((s) => s.doc_id === selectedDocId);
      if (matchingSession) {
        if (activeSessionId !== matchingSession.id) {
          setActiveSessionId(matchingSession.id);
        }
      } else {
        // No session exists for this document yet -> reset active session & clear chat messages
        if (activeSessionId !== null) {
          setActiveSessionId(null);
        }
        setMessages([]);
      }
    } else {
      // All Documents mode: if current session was tied to a specific doc, clear it
      if (activeSessionId) {
        const cur = sessions.find((s) => s.id === activeSessionId);
        if (cur?.doc_id) {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    }
  }, [selectedDocId, sessions, activeSessionId, setActiveSessionId]);

  // Handle external trigger for document summarization (guarded against double execution)
  const lastProcessedSummaryRef = useRef<string | null>(null);
  useEffect(() => {
    if (triggerSummaryDocId) {
      if (lastProcessedSummaryRef.current === triggerSummaryDocId) return;
      lastProcessedSummaryRef.current = triggerSummaryDocId;
      handleAutoSummarize(triggerSummaryDocId);
      if (onResetTriggerSummary) onResetTriggerSummary();
    } else {
      lastProcessedSummaryRef.current = null;
    }
  }, [triggerSummaryDocId]);

  // Handle external trigger for custom prompt (e.g. Draft negotiation strategy) - strictly guarded against duplicate execution
  const lastProcessedPromptRef = useRef<string | null>(null);
  useEffect(() => {
    if (pendingPrompt) {
      if (lastProcessedPromptRef.current === pendingPrompt) return;
      lastProcessedPromptRef.current = pendingPrompt;
      handleSend(pendingPrompt);
      if (onClearPendingPrompt) onClearPendingPrompt();
    } else {
      lastProcessedPromptRef.current = null;
    }
  }, [pendingPrompt]);

  // Close export menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAutoSummarize = async (docId: string) => {
    const doc = documents.find((d) => d.doc_id === docId);
    if (!doc || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: `⚡ Generate an Executive Summary and Key Takeaways for '${doc.filename}'`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const result = await summarizeDocument(docId);
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.summary,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      onRefreshSessions();
    } catch (error: any) {
      try {
        const response = await sendChatMessage(
          "Summarize the entire document and list key takeaways with metrics.",
          docId,
          [],
          activeSessionId
        );
        if (!activeSessionId && response.session_id) {
          setActiveSessionId(response.session_id);
        }
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.answer,
          sources: response.sources,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        onRefreshSessions();
      } catch (err: any) {
        const errMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Failed to generate document summary. Please check backend connection.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [".pdf", ".docx"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      setAttachError("Please select a valid PDF (.pdf) or Word (.docx) document.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setAttachError("File size exceeds 20MB limit.");
      return;
    }

    setIsUploadingAttach(true);
    setAttachError(null);
    try {
      const res = await uploadDocument(file);
      if (res.document) {
        if (onUploadDocSuccess) {
          onUploadDocSuccess(res.document);
        }
        if (setSelectedDocId) {
          setSelectedDocId(res.document.doc_id);
        }
      }
    } catch (err: any) {
      setAttachError(
        err.response?.data?.detail || "Could not extract text. Please ensure the document is readable."
      );
    } finally {
      setIsUploadingAttach(false);
      if (chatFileInputRef.current) {
        chatFileInputRef.current.value = "";
      }
    }
  };

  const handleSend = async (customText?: string) => {
    const textToSend = customText || inputPrompt;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customText) setInputPrompt("");
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await sendChatMessage(
        userMessage.content, 
        selectedDocId || undefined, 
        history,
        activeSessionId
      );

      if (!activeSessionId && response.session_id) {
        setActiveSessionId(response.session_id);
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      onRefreshSessions();
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error connecting to the AI backend. Please verify your backend server status.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = (content: string, id: string) => {
    try {
      navigator.clipboard.writeText(content).catch(() => {});
    } catch {
      // Fallback if clipboard API restricted
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const generateMarkdownTranscript = () => {
    let markdown = `# LexiGuard AI - Legal Consultation Transcript\n\n`;
    markdown += `**Target Agreement:** ${selectedDoc ? selectedDoc.filename : "All Knowledge Base Documents"}\n`;
    markdown += `**Exported At:** ${new Date().toLocaleString()}\n\n---\n\n`;

    messages.forEach((m) => {
      const author = m.role === "user" ? "User / Legal Counsel" : "LexiGuard Legal Copilot";
      markdown += `### ${author} (${m.timestamp})\n\n`;
      markdown += `${m.content}\n\n`;

      if (m.sources && m.sources.length > 0) {
        markdown += `**Verified Citations:**\n`;
        m.sources.forEach((s) => {
          markdown += `- **${s.filename}** (Page ${s.page_number}): "${s.content}"\n`;
        });
        markdown += `\n`;
      }
      markdown += `---\n\n`;
    });
    return markdown;
  };

  const handleExportMarkdown = () => {
    if (messages.length === 0) return;
    const markdown = generateMarkdownTranscript();
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `LexiGuard_Legal_Consult_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleExportPDF = () => {
    if (messages.length === 0) return;
    setShowExportMenu(false);

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let contentHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>LexiGuard AI Legal Consultation Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #1a202c;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 8px; font-size: 22px; }
          .meta { color: #64748b; font-size: 13px; margin-bottom: 30px; }
          .message { margin-bottom: 24px; padding: 18px; border-radius: 12px; }
          .user { background-color: #f1f5f9; border-left: 4px solid #3b82f6; }
          .assistant { background-color: #f8fafc; border-left: 4px solid #10b981; border: 1px solid #e2e8f0; border-left-width: 4px; }
          .author { font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #334155; }
          .body { font-size: 14px; white-space: pre-wrap; }
          .citations { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #475569; }
        </style>
      </head>
      <body>
        <h1>⚖️ LexiGuard AI Legal Consultation Report</h1>
        <div class="meta">
          <strong>Target Agreement:</strong> ${selectedDoc ? selectedDoc.filename : "All Indexed Contracts"}<br>
          <strong>Generated:</strong> ${new Date().toLocaleString()}
        </div>
    `;

    messages.forEach((m) => {
      const isUser = m.role === "user";
      contentHtml += `
        <div class="message ${isUser ? "user" : "assistant"}">
          <div class="author">${isUser ? "User / Legal Counsel" : "LexiGuard Legal Copilot"} (${m.timestamp})</div>
          <div class="body">${m.content.replace(/\n/g, "<br>")}</div>
      `;

      if (m.sources && m.sources.length > 0) {
        contentHtml += `<div class="citations"><strong>Verified Citations:</strong><br>`;
        m.sources.forEach((s) => {
          contentHtml += `• <em>${s.filename}</em> (Page ${s.page_number}): "${s.content}"<br>`;
        });
        contentHtml += `</div>`;
      }

      contentHtml += `</div>`;
    });

    contentHtml += `
      </body>
      </html>
    `;

    printWindow.document.write(contentHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleCopyTranscript = () => {
    if (messages.length === 0) return;
    const markdown = generateMarkdownTranscript();
    try {
      navigator.clipboard.writeText(markdown).catch(() => {});
    } catch {
      // Fallback if clipboard API restricted
    }
    setAllCopied(true);
    setTimeout(() => {
      setAllCopied(false);
      setShowExportMenu(false);
    }, 1500);
  };

  const samplePrompts = [
    { label: "Liability & Indemnity", text: "What is the liability cap and what are the indemnification obligations in this agreement?", icon: AlertCircle },
    { label: "Non-Compete & Restrictions", text: "Is there a non-compete, exclusivity, or non-solicitation clause? What are the restrictions?", icon: FileText },
    { label: "Termination & Breach", text: "What are the termination rights, notice periods, and breach remedies in this contract?", icon: BarChart3 },
    { label: "Draft Redline Counter-Clause", text: "Draft a fair, mutual redline counter-clause for the highest risk liability section in this agreement.", icon: HelpCircle },
  ];

  const currentActiveSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="relative flex flex-col flex-1 h-[calc(100vh-140px)] min-h-[480px] max-h-[850px] bg-white/95 dark:bg-slate-900/50 rounded-3xl border border-slate-200/90 dark:border-slate-800/90 overflow-hidden shadow-[0_12px_36px_-10px_rgba(15,23,42,0.08)] dark:shadow-2xl backdrop-blur-xl">
      {/* Chat Header */}
      <div className="relative z-30 px-5 py-3.5 border-b border-slate-200/90 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/80 flex items-center justify-between gap-3 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentActiveSession ? currentActiveSession.title : "LexiGuard Legal Copilot"}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {documents.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedDocId || ""}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      if (setSelectedDocId) setSelectedDocId(val);
                    }}
                    className="bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-indigo-700 dark:text-sky-300 rounded-lg px-2 py-0.5 focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[210px] sm:max-w-xs truncate shadow-2xs"
                  >
                    <option value="">🌐 All Contracts (Global)</option>
                    {documents.map((d) => (
                      <option key={d.doc_id} value={d.doc_id}>
                        📄 {d.filename}
                      </option>
                    ))}
                  </select>
                  {selectedDocId && setSelectedDocId && (
                    <button
                      type="button"
                      onClick={() => setSelectedDocId(null)}
                      className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-200/70 dark:bg-slate-800/80 px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0"
                      title="Clear to search across all documents"
                    >
                      <X className="w-2.5 h-2.5" />
                      <span>All Docs</span>
                    </button>
                  )}
                </div>
              ) : selectedDoc ? (
                <>
                  <span className="text-indigo-600 dark:text-sky-400 font-medium truncate">
                    Contract: {selectedDoc.filename}
                  </span>
                  {setSelectedDocId && (
                    <button
                      type="button"
                      onClick={() => setSelectedDocId(null)}
                      className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-200/70 dark:bg-slate-800/80 px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0"
                      title="Clear to search across all documents"
                    >
                      <X className="w-2.5 h-2.5" />
                      <span>All Docs</span>
                    </button>
                  )}
                </>
              ) : (
                <span>All Indexed Contracts</span>
              )}
            </div>
          </div>
        </div>

        {/* Clean Header Actions (New Chat, History Dropdown, Export Dropdown & Clear) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* New Chat Button */}
          <button
            onClick={() => {
              onNewChat();
              setMessages([]);
            }}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-all cursor-pointer shadow-2xs"
            title="Start a fresh legal consultation"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline font-medium">New Chat</span>
          </button>

          {/* Chat History Dropdown */}
          <div className="relative z-50" ref={historyMenuRef}>
            <button
              onClick={() => setShowHistoryMenu(!showHistoryMenu)}
              className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                showHistoryMenu
                  ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300 shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 shadow-2xs"
              }`}
              title="Past Consultations & Chat History"
            >
              <History className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span className="hidden sm:inline font-medium">History</span>
              {sessions.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300">
                  {sessions.length}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showHistoryMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-[#090d24] border border-slate-200 dark:border-slate-700/80 shadow-2xl p-2 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-indigo-500" />
                    Saved History ({sessions.length})
                  </span>
                  <button
                    onClick={() => {
                      onNewChat();
                      setMessages([]);
                      setShowHistoryMenu(false);
                    }}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New</span>
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {sessions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
                      No saved chat history found. Start a consultation!
                    </div>
                  ) : (
                    sessions.map((sess) => {
                      const isActive = activeSessionId === sess.id;
                      const sessDoc = sess.doc_id ? documents.find((d) => d.doc_id === sess.doc_id) : null;
                      return (
                        <div
                          key={sess.id}
                          onClick={() => {
                            if (onSelectSession) onSelectSession(sess.id);
                            setShowHistoryMenu(false);
                          }}
                          className={`group p-2 rounded-xl flex items-center justify-between gap-2 text-xs transition-all cursor-pointer ${
                            isActive
                              ? "bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/40 text-indigo-900 dark:text-indigo-200"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <MessageSquare className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`} />
                            <div className="min-w-0 flex-1 text-left">
                              <div className="font-medium truncate text-xs">{sess.title}</div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>{new Date(sess.updated_at || sess.created_at).toLocaleDateString()}</span>
                                <span>•</span>
                                <span>{sess.message_count ?? 0} msgs</span>
                                {sessDoc && (
                                  <>
                                    <span>•</span>
                                    <span className="text-indigo-600 dark:text-sky-400 font-medium truncate max-w-[110px]">
                                      {sessDoc.filename}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {onDeleteSession && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(sess.id, e);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
                              title="Delete consultation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Export Dropdown - Always visible */}
          <div className="relative z-50" ref={exportMenuRef}>
            <button
              onClick={() => messages.length > 0 && setShowExportMenu(!showExportMenu)}
              disabled={messages.length === 0}
              className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${
                messages.length === 0
                  ? "bg-slate-100 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800/60 text-slate-400 cursor-not-allowed opacity-50"
                  : showExportMenu
                  ? "bg-sky-50 dark:bg-sky-500/20 border-sky-300 dark:border-sky-500/50 text-sky-700 dark:text-sky-300 cursor-pointer shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-300 cursor-pointer"
              }`}
              title={messages.length === 0 ? "Ask a question to enable export options" : "Export research options"}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-medium">Export</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showExportMenu && messages.length > 0 && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white dark:bg-[#090d24] border border-slate-200 dark:border-slate-700/80 shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1">
                  Export Research Transcript
                </div>

                <button
                  onClick={handleExportMarkdown}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-500/15 hover:text-sky-700 dark:hover:text-sky-300 transition-colors text-left cursor-pointer group"
                >
                  <FileDown className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                  <div>
                    <div className="font-medium leading-tight">Markdown (.md)</div>
                    <div className="text-[10px] text-slate-400">For Notion, Obsidian & Notes</div>
                  </div>
                </button>

                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors text-left cursor-pointer group"
                >
                  <Printer className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                  <div>
                    <div className="font-medium leading-tight">Print / Save as PDF</div>
                    <div className="text-[10px] text-slate-400">Formatted Report for sharing</div>
                  </div>
                </button>

                <button
                  onClick={handleCopyTranscript}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors text-left cursor-pointer group"
                >
                  {allCopied ? (
                    <CheckCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <ClipboardCopy className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <div className="font-medium leading-tight">
                      {allCopied ? "Copied to Clipboard!" : "Copy Full Transcript"}
                    </div>
                    <div className="text-[10px] text-slate-400">Copy text with citations</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                onNewChat();
              }}
              className="text-xs text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
              title="Clear current conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Thread */}
      <div ref={messagesContainerRef} className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-2 text-center max-w-lg mx-auto space-y-2.5 animate-in fade-in duration-200">
            <div className="w-11 h-11 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">Ask LexiGuard Legal Copilot</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm mx-auto">
                Retrieve exact contract clauses, verify liability limits, draft counter-clauses, and cite pinpoint page numbers.
              </p>
            </div>

            {documents.length > 0 && (
              <div className="w-full pt-1 space-y-1.5">
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                  Legal Consultation Quick Actions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                  {samplePrompts.map((prompt, idx) => {
                    const Icon = prompt.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSend(prompt.text)}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 hover:border-sky-400 hover:bg-sky-50/50 dark:hover:bg-slate-800/80 text-xs text-slate-700 dark:text-slate-300 transition-all text-left flex items-center gap-2 group cursor-pointer shadow-2xs"
                      >
                        <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 group-hover:bg-sky-100 dark:group-hover:bg-sky-500/20 transition-colors shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium truncate">{prompt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] min-w-0 rounded-2xl p-4 sm:p-5 text-sm group relative break-words overflow-hidden ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-indigo-600 via-indigo-700 to-sky-600 text-white rounded-tr-none shadow-md shadow-indigo-500/20"
                    : "bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed space-y-2 break-words overflow-hidden min-w-0">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed text-slate-800 dark:text-slate-200 break-words">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc ml-5 space-y-1.5 my-2.5 text-slate-700 dark:text-slate-300 break-words">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal ml-5 space-y-1.5 my-2.5 text-slate-700 dark:text-slate-300 break-words">{children}</ol>,
                        li: ({ children }) => <li className="text-slate-700 dark:text-slate-300 break-words pl-0.5">{children}</li>,
                        h1: ({ children }) => <h1 className="text-base font-bold text-slate-900 dark:text-sky-200 mt-3.5 mb-1.5 pb-1 border-b border-slate-200/80 dark:border-slate-800 break-words">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold text-indigo-950 dark:text-sky-200 mt-3.5 mb-1.5 break-words">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-sky-300 mt-3 mb-1.5 bg-indigo-50/90 dark:bg-indigo-500/10 px-2.5 py-0.5 rounded-md inline-block border border-indigo-200/60 dark:border-indigo-500/20 break-words">{children}</h3>,
                        strong: ({ children }) => <strong className="font-bold text-slate-900 dark:text-slate-100 break-words">{children}</strong>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-indigo-500 pl-3.5 py-2 my-2.5 bg-indigo-50/50 dark:bg-slate-800/60 rounded-r-xl text-slate-800 dark:text-slate-300 text-xs italic border border-indigo-100/60 dark:border-transparent break-words">
                            {children}
                          </blockquote>
                        ),
                        pre: ({ children }) => (
                          <pre className="overflow-x-auto max-w-full whitespace-pre-wrap break-words rounded-xl p-4 bg-slate-900 text-slate-100 dark:bg-slate-950 dark:text-sky-200 border border-slate-800 text-xs font-mono my-3 shadow-md">
                            {children}
                          </pre>
                        ),
                        code: ({ node, inline, className, children, ...props }: any) => {
                          if (inline) {
                            return (
                              <code className="bg-indigo-50 text-indigo-700 dark:bg-slate-950 dark:text-sky-300 px-1.5 py-0.5 rounded-md font-mono text-[11px] border border-indigo-200/60 dark:border-slate-800 font-semibold break-words">
                                {children}
                              </code>
                            );
                          }
                          return (
                            <code className="whitespace-pre-wrap break-words font-mono text-xs text-slate-100 dark:text-sky-200 block">
                              {children}
                            </code>
                          );
                        },
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-3 max-w-full">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs text-left border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">{children}</table>
                          </div>
                        ),
                        th: ({ children }) => <th className="px-3 py-2 bg-slate-100 dark:bg-slate-800/80 font-semibold text-slate-900 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 break-words">{children}</th>,
                        td: ({ children }) => <td className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/60 text-slate-700 dark:text-slate-300 break-words">{children}</td>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
                )}

                {msg.sources && msg.sources.length > 0 && (
                  <SourceBadge sources={msg.sources} />
                )}

                <div className="flex items-center justify-between mt-2 pt-1">
                  {msg.role === "assistant" ? (
                    <button
                      onClick={() => handleCopyMessage(msg.content, msg.id)}
                      className="text-[11px] text-slate-400 hover:text-indigo-600 dark:hover:text-sky-300 flex items-center gap-1 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  ) : <div />}

                  <div
                    className={`text-[10px] ${
                      msg.role === "user" ? "text-sky-100" : "text-slate-400"
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>

              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex gap-3.5 justify-start animate-fadeIn">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl rounded-tl-none bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-indigo-600 dark:text-sky-400 animate-spin" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Searching vector embeddings & formulating response...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Field & Prompt Chips */}
      <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/90 flex flex-col gap-2">
        {/* Attachment Error Banner */}
        {attachError && (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{attachError}</span>
            </div>
            <button
              onClick={() => setAttachError(null)}
              className="text-rose-600 dark:text-rose-400 hover:text-rose-800 p-1 rounded-md cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}



        {selectedDoc && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium shrink-0">Quick Ask:</span>
            <button
              onClick={() => handleSend("Give me a comprehensive executive summary of this document.")}
              disabled={isLoading}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800/60 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-300 dark:hover:border-sky-500/40 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[11px] whitespace-nowrap transition-all cursor-pointer shadow-2xs"
            >
              ⚡ Executive Summary
            </button>
            <button
              onClick={() => handleSend("List all important numbers, statistics, and metrics in bullet points.")}
              disabled={isLoading}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800/60 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-300 dark:hover:border-sky-500/40 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[11px] whitespace-nowrap transition-all cursor-pointer shadow-2xs"
            >
              📊 Key Metrics
            </button>
            <button
              onClick={() => handleSend("What are the key conclusions, action items, and next steps?")}
              disabled={isLoading}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800/60 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-300 dark:hover:border-sky-500/40 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[11px] whitespace-nowrap transition-all cursor-pointer shadow-2xs"
            >
              🎯 Next Steps
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="file"
            ref={chatFileInputRef}
            onChange={handleAttachFile}
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
          />

          {/* Attachment Paperclip Button */}
          <button
            type="button"
            onClick={() => chatFileInputRef.current?.click()}
            disabled={isUploadingAttach || isLoading}
            title="Attach a PDF or Word (.docx) document directly to chat"
            className="p-3 rounded-xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500/50 hover:bg-sky-50/50 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 transition-all cursor-pointer disabled:opacity-40 shadow-xs"
          >
            {isUploadingAttach ? (
              <Loader2 className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </button>

          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder={
              documents.length === 0
                ? "Please upload a document or attach PDF / Word doc to enable AI chat..."
                : selectedDoc
                ? `Ask anything about ${selectedDoc.filename}...`
                : "Ask a question across all documents in knowledge base..."
            }
            disabled={documents.length === 0 || isLoading}
            className="flex-1 bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50 shadow-xs"
          />
          <button
            type="submit"
            disabled={!inputPrompt.trim() || isLoading || documents.length === 0}
            className="p-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium transition-all shadow-md shadow-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
