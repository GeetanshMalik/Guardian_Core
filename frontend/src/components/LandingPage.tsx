import React, { useState } from "react";
import { Sparkles, ArrowRight, CheckCircle2, ShieldCheck, Target, Loader2, User } from "lucide-react";

interface LandingPageProps {
  onStartWithGoal: (goalText: string) => Promise<void>;
  onDemoLogin: () => Promise<void>;
}

export default function LandingPage({ onStartWithGoal, onDemoLogin }: LandingPageProps) {
  const [goalInput, setGoalInput] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim()) return;
    setShowLoginModal(true);
  };

  const handleDemoSelect = (text: string) => {
    setGoalInput(text);
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await onStartWithGoal(goalInput || "");
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setShowLoginModal(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    try {
      await onDemoLogin();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDemoLoading(false);
      setShowLoginModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-apple-canvas-parchment flex flex-col font-sans selection:bg-apple-blue selection:text-white">
      {/* Navbar */}
      <nav className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between border-b border-apple-hairline/60 bg-transparent">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-apple-blue flex items-center justify-center text-white shadow-md">
            <Target className="w-5 h-5" />
          </div>
          <span className="text-[19px] font-semibold text-apple-ink tracking-tight font-display">
            Guardian Core
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-[14px] text-gray-500 font-medium">
          <a href="#features" className="hover:text-apple-ink transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-apple-ink transition-colors">How It Works</a>
        </div>
        <button
          id="landing-signin-btn"
          onClick={() => setShowLoginModal(true)}
          className="text-[14px] font-medium text-apple-blue hover:text-apple-blue-focus transition-colors px-4 py-2 hover:bg-white/60 rounded-full"
        >
          Sign In
        </button>
      </nav>

      {/* Main Hero Container */}
      <main className="flex-1 max-w-5xl mx-auto px-6 pt-16 pb-24 flex flex-col items-center justify-center text-center">
        {/* Banner Announcement */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/80 border border-apple-hairline rounded-full shadow-sm text-[12px] font-medium text-apple-blue mb-8 animate-fade-in">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Next-Gen Autonomous Agentic Guardian Core</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl font-semibold tracking-[-0.03em] leading-[1.08] text-apple-ink font-display max-w-4xl mb-6">
          Never Miss Another Important Deadline.
        </h1>
        
        {/* Subhead */}
        <p className="text-[18px] md:text-[21px] text-gray-500 font-normal leading-relaxed max-w-2xl mb-12">
          An AI Guardian Core that plans, prioritizes, schedules, and actively helps complete your goals before time runs out.
        </p>

        {/* Interactive Command Center Input */}
        <div className="w-full max-w-2xl bg-white border border-apple-hairline rounded-[24px] p-2 shadow-xl hover:shadow-2xl transition-all duration-300 mb-6">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-2">
            <input
              id="landing-hero-input"
              type="text"
              placeholder="Prepare for my Google interview by July 1st..."
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="w-full flex-1 bg-transparent border-0 px-5 py-4 text-[16px] text-apple-ink placeholder-gray-400 focus:outline-none"
            />
            <button
              id="landing-submit-btn"
              type="submit"
              className="w-full sm:w-auto bg-apple-blue hover:bg-apple-blue-focus text-white font-medium px-6 py-4 rounded-[18px] text-[15px] tracking-tight transition-all flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg active:scale-98 cursor-pointer"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Demo Quick Select tags */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl">
          <span className="text-[12px] text-gray-400 uppercase tracking-wider font-semibold mr-1.5">Try:</span>
          {[
            "Complete internship report before Friday",
            "Prepare for TCS interview by July 1st",
            "Research AI Agents and draft notes",
            "Apply to 50 jobs this week"
          ].map((demo, idx) => (
            <button
              key={idx}
              id={`landing-demo-${idx}`}
              onClick={() => handleDemoSelect(demo)}
              className="text-[13px] text-gray-500 hover:text-apple-ink bg-white hover:bg-gray-50 border border-apple-hairline px-3.5 py-1.5 rounded-full transition-all cursor-pointer shadow-sm"
            >
              {demo}
            </button>
          ))}
        </div>
      </main>

      {/* Simplified How It Works & Features */}
      <section id="features" className="bg-white border-t border-apple-hairline py-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-apple-blue/5 border border-apple-blue/10 flex items-center justify-center text-apple-blue">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-[18px] font-semibold text-apple-ink font-display">Conversational Planning</h3>
            <p className="text-[14px] text-gray-500 leading-relaxed font-light">
              Just talk to Guardian Core. Tell it what you need to achieve and watch it compose a comprehensive, calibrated timeline automatically.
            </p>
          </div>
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-apple-blue/5 border border-apple-blue/10 flex items-center justify-center text-apple-blue">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-[18px] font-semibold text-apple-ink font-display">Active Risk Mitigation</h3>
            <p className="text-[14px] text-gray-500 leading-relaxed font-light">
              Procrastination warnings, deadline evaluations, and dynamic scope compression are engineered to guarantee you complete the objective on schedule.
            </p>
          </div>
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-apple-blue/5 border border-apple-blue/10 flex items-center justify-center text-apple-blue">
              <Target className="w-5 h-5" />
            </div>
            <h3 className="text-[18px] font-semibold text-apple-ink font-display">Asset Drafting Co-pilot</h3>
            <p className="text-[14px] text-gray-500 leading-relaxed font-light">
              Get immediate draft structures, research papers, email drafts, or starter code. Guardian Core handles the heavy lifting directly.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-apple-canvas-parchment border-t border-apple-hairline py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-apple-ink font-display mb-4">
              How It Works
            </h2>
            <p className="text-[16px] text-gray-500 max-w-xl mx-auto font-light">
              Guardian Core acts as your autonomous Chief of Staff, handling the planning, scheduling, and tracking so you can focus on execution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="bg-white border border-apple-hairline rounded-[20px] p-6 shadow-sm hover:shadow-md transition-all">
              <div className="w-8 h-8 rounded-full bg-apple-blue text-white flex items-center justify-center text-[14px] font-semibold mb-4">
                1
              </div>
              <h4 className="text-[16px] font-semibold text-apple-ink font-display mb-2">Set Your Goal</h4>
              <p className="text-[13px] text-gray-500 leading-relaxed font-light">
                Write your objective in plain natural language. The AI parses your intent, target dates, and key constraints.
              </p>
            </div>

            <div className="bg-white border border-apple-hairline rounded-[20px] p-6 shadow-sm hover:shadow-md transition-all">
              <div className="w-8 h-8 rounded-full bg-apple-blue text-white flex items-center justify-center text-[14px] font-semibold mb-4">
                2
              </div>
              <h4 className="text-[16px] font-semibold text-apple-ink font-display mb-2">Auto-Decompose</h4>
              <p className="text-[13px] text-gray-500 leading-relaxed font-light">
                Our multi-agent system breaks down your goal into logical, chronological milestones and estimates task effort.
              </p>
            </div>

            <div className="bg-white border border-apple-hairline rounded-[20px] p-6 shadow-sm hover:shadow-md transition-all">
              <div className="w-8 h-8 rounded-full bg-apple-blue text-white flex items-center justify-center text-[14px] font-semibold mb-4">
                3
              </div>
              <h4 className="text-[16px] font-semibold text-apple-ink font-display mb-2">Shield Your Calendar</h4>
              <p className="text-[13px] text-gray-500 leading-relaxed font-light">
                Guardian Core syncs with Google Calendar, finding optimal free blocks for deep work and avoiding meeting conflicts.
              </p>
            </div>

            <div className="bg-white border border-apple-hairline rounded-[20px] p-6 shadow-sm hover:shadow-md transition-all">
              <div className="w-8 h-8 rounded-full bg-apple-blue text-white flex items-center justify-center text-[14px] font-semibold mb-4">
                4
              </div>
              <h4 className="text-[16px] font-semibold text-apple-ink font-display mb-2">Active Assistance</h4>
              <p className="text-[13px] text-gray-500 leading-relaxed font-light">
                The background engine monitors your progress, flags delays, and reschedules tasks automatically to protect your deadline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-8 border-t border-apple-hairline text-center text-gray-400 text-[12px] font-light">
        <p>© 2026 Guardian Core AI Corporation. All rights reserved.</p>
      </footer>

      {/* Custom Auth Modal Popup */}
      {showLoginModal && (
        <div id="landing-auth-modal" className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-apple-hairline rounded-[24px] w-full max-w-sm p-8 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 rounded-full bg-apple-blue flex items-center justify-center text-white mx-auto mb-5 shadow-lg">
              <Target className="w-6 h-6" />
            </div>
            <h2 className="text-[20px] font-semibold text-apple-ink tracking-tight font-display mb-2">
              Welcome to Guardian Core
            </h2>
            <p className="text-[14px] text-gray-500 mb-8 max-w-xs mx-auto">
              {goalInput ? "Create your account to secure and build your execution plan." : "Sign in to access your Guardian Core dashboard."}
            </p>

            <button
              id="auth-google-btn"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 border border-apple-hairline text-[15px] font-medium text-apple-ink py-3 px-4 rounded-full transition-all shadow-sm active:scale-98 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-apple-blue" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-[12px] text-gray-400 font-medium">or</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            <button
              id="auth-demo-btn"
              onClick={handleDemoLogin}
              disabled={isDemoLoading || isLoading}
              className="w-full flex items-center justify-center gap-3 bg-gray-50 hover:bg-gray-100 border border-apple-hairline text-[15px] font-medium text-gray-600 py-3 px-4 rounded-full transition-all shadow-sm active:scale-98 cursor-pointer"
            >
              {isDemoLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
              ) : (
                <>
                  <User className="w-5 h-5 text-gray-500" />
                  <span>Try Demo Account</span>
                </>
              )}
            </button>

            <button
              id="auth-cancel-btn"
              onClick={() => setShowLoginModal(false)}
              className="text-[13px] text-gray-400 hover:text-apple-ink mt-4 transition-colors font-medium cursor-pointer"
              disabled={isLoading || isDemoLoading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
