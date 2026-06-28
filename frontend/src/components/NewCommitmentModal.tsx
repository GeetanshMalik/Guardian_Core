import React, { useState } from "react";
import { Plus, Calendar, AlertCircle, Sparkles, Loader2, X } from "lucide-react";

interface NewCommitmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, deadline: string, context: string) => Promise<void>;
}

export default function NewCommitmentModal({
  isOpen,
  onClose,
  onSubmit,
}: NewCommitmentModalProps) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [context, setContext] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !deadline.trim()) {
      setError("Please provide a goal and a deadline.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(title, deadline, context);
      setTitle("");
      setDeadline("");
      setContext("");
      onClose();
    } catch (err: any) {
      if (err.message && err.message.includes("high demand")) {
        setError("Our AI is currently experiencing high demand. Please try again in a few moments.");
      } else {
        setError(err.message || "Failed to create goal.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExampleSelect = (exTitle: string, exDeadline: string, exContext: string) => {
    setTitle(exTitle);
    setDeadline(exDeadline);
    setContext(exContext);
  };

  return (
    <div id="new-commitment-modal" className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 transition-all duration-300">
      <div className="bg-white border border-apple-hairline rounded-[24px] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-apple-hairline bg-white">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-apple-ink font-display tracking-tight">New Goal</h2>
          </div>
          <button
            id="close-modal-btn"
            onClick={onClose}
            className="text-gray-400 hover:text-apple-ink transition-colors p-1.5 hover:bg-apple-canvas-parchment rounded-full"
            disabled={isSubmitting}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 p-4 bg-red-50 border border-red-200 rounded-[14px] text-red-700 text-xs leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {isSubmitting ? (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center space-y-4 bg-apple-surface-tile-1 text-white rounded-[18px]">
              <Loader2 className="w-8 h-8 text-apple-blue-on-dark animate-spin" />
              <div className="space-y-1">
                <p className="text-[14px] font-semibold tracking-tight text-white">Creating your roadmap...</p>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto leading-relaxed font-sans font-normal">
                  Analyzing timeline and drafting the initial plan.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
                  GOAL
                </label>
                <input
                  id="commitment-title-input"
                  type="text"
                  placeholder="e.g., Run a half marathon, Apply to Google, Write a book..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white border border-apple-hairline rounded-[12px] px-3.5 py-2.5 text-apple-ink placeholder-gray-400 focus:outline-none focus:border-apple-blue text-xs transition-colors"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
                  TARGET DEADLINE
                </label>
                <div className="relative">
                  <input
                    id="commitment-deadline-input"
                    type="text"
                    placeholder="e.g., Friday 5 PM, or 2026-06-27"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-white border border-apple-hairline rounded-[12px] pl-10 pr-3.5 py-2.5 text-apple-ink placeholder-gray-400 focus:outline-none focus:border-apple-blue text-xs transition-colors"
                  />
                  <Calendar className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
                  CONTEXT & CONSTRAINTS (OPTIONAL)
                </label>
                <textarea
                  id="commitment-context-input"
                  placeholder="e.g., This SOP counts for 15% of the portfolio. Need statement proofread by two seniors. Must use custom latex template."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-apple-hairline rounded-[12px] px-3.5 py-2.5 text-apple-ink placeholder-gray-400 focus:outline-none focus:border-apple-blue text-xs transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* Examples Helper */}
              <div className="pt-4 border-t border-apple-hairline">
                <p className="text-[9px] uppercase font-mono font-bold text-gray-400 mb-2.5">Or select a quick template:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    id="template-study-btn"
                    type="button"
                    onClick={() => handleExampleSelect(
                      "Prepare for DBMS Interview",
                      "In 7 Days",
                      "Targeting junior backend developer. Highlights: ACID, Indexing, Joins, Normalization."
                    )}
                    className="text-left bg-apple-canvas-parchment hover:bg-gray-100 border border-apple-hairline rounded-[14px] p-3 transition-all text-xs cursor-pointer"
                  >
                    <p className="font-semibold text-apple-ink">Prepare for DBMS Interview</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">In 7 Days • Backend specs</p>
                  </button>
                  <button
                    id="template-exam-btn"
                    type="button"
                    onClick={() => handleExampleSelect(
                      "Submit Master SOP Application",
                      "This Friday",
                      "Requires editing statement of purpose, requesting 2 LORs from professors, and attaching resume."
                    )}
                    className="text-left bg-apple-canvas-parchment hover:bg-gray-100 border border-apple-hairline rounded-[14px] p-3 transition-all text-xs cursor-pointer"
                  >
                    <p className="font-semibold text-apple-ink">Submit Master SOP Application</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">This Friday • SOP & LOR docs</p>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-apple-hairline">
                <button
                  id="cancel-modal-btn"
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-gray-500 hover:text-apple-ink hover:bg-apple-canvas-parchment rounded-full transition-colors font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="submit-modal-btn"
                  type="submit"
                  className="bg-apple-blue hover:bg-apple-blue-focus active:scale-95 text-white font-medium px-5 py-2 rounded-full text-[14px] tracking-[-0.224px] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  Create Goal
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
