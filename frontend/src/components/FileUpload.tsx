"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { uploadBatchDocuments, DocumentMeta } from "../lib/api";

interface FileUploadProps {
  onUploadSuccess?: (doc: DocumentMeta) => void;
  onBatchUploadSuccess?: (docs: DocumentMeta[]) => void;
}

export default function FileUpload({ onUploadSuccess, onBatchUploadSuccess }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ 
    type: "success" | "error" | "warning" | null; 
    message: string;
    details?: string[];
  }>({
    type: null,
    message: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    if (!fileArray || fileArray.length === 0) return;

    // Filter for PDFs and Word documents (.docx)
    const allowedExtensions = [".pdf", ".docx"];
    const validFormatFiles = fileArray.filter((file) => {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      return allowedExtensions.includes(ext);
    });

    if (validFormatFiles.length === 0) {
      setUploadStatus({
        type: "error",
        message: "Please upload PDF (.pdf) or Word (.docx) documents.",
      });
      return;
    }

    // Check size limit (max 20MB each)
    const validFiles = validFormatFiles.filter((file) => file.size <= 20 * 1024 * 1024);
    if (validFiles.length === 0) {
      setUploadStatus({
        type: "error",
        message: "All selected files exceed the 20MB limit.",
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus({ 
      type: null, 
      message: `Processing & indexing ${validFiles.length} document(s)...` 
    });

    try {
      const result = await uploadBatchDocuments(validFiles);

      if (result.successful_documents && result.successful_documents.length > 0) {
        setUploadStatus({
          type: result.failed_files && result.failed_files.length > 0 ? "warning" : "success",
          message: `Successfully indexed ${result.successful_documents.length} document(s)${
            result.failed_files && result.failed_files.length > 0 ? ` (${result.failed_files.length} failed)` : ""
          }.`,
        });

        if (onBatchUploadSuccess) {
          onBatchUploadSuccess(result.successful_documents);
        } else if (onUploadSuccess) {
          result.successful_documents.forEach((doc) => onUploadSuccess(doc));
        }
      } else {
        setUploadStatus({
          type: "error",
          message: result.message || "Failed to process uploaded files.",
        });
      }
    } catch (error: any) {
      setUploadStatus({
        type: "error",
        message: error.response?.data?.detail || "Failed to process PDFs. Please check backend server.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 scale-[1.01]"
            : "border-slate-300 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/40 hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:bg-indigo-50/30 dark:hover:bg-slate-900/60"
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center gap-2.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-md group-hover:scale-110 transition-transform">
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-1.5">
              {isUploading ? (
                "Processing & Indexing Clauses into ChromaDB..."
              ) : (
                <>
                  <span>Drop your agreements here, or</span>
                  <span className="text-indigo-600 dark:text-indigo-400 underline decoration-indigo-400/50 underline-offset-2">browse</span>
                </>
              )}
            </h4>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
              Supports PDF & Word (.docx) up to 20MB
            </p>
          </div>
        </div>
      </div>

      {uploadStatus.type && (
        <div
          className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2 animate-fadeIn ${
            uploadStatus.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300"
              : uploadStatus.type === "warning"
              ? "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300"
              : "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-300"
          }`}
        >
          {uploadStatus.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : uploadStatus.type === "warning" ? (
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span className="truncate">{uploadStatus.message}</span>
        </div>
      )}
    </div>
  );
}
