import React, { useState, useEffect } from "react";
import LandingPage from "./components/LandingPage";
import Dashboard from "./components/Dashboard";
import GoalWorkspace from "./components/GoalWorkspace";
import CalendarPage from "./components/CalendarPage";
import NotificationsPage from "./components/NotificationsPage";
import SettingsPage from "./components/SettingsPage";
import { Goal, Task } from "./types";
import { Target, Search, Sparkles, Loader2, LogOut, ChevronDown } from "lucide-react";
import { API_URL } from "./api";

interface UserProfile {
  name: string;
  email: string;
  picture: string;
}

export default function App() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("cos_logged_in") === "true" && !!localStorage.getItem("cos_jwt_token");
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("cos_user_profile");
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activePage, setActivePage] = useState<"dashboard" | "calendar" | "notifications" | "settings" | "workspace" >("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);

  // Fetch all goals
  const fetchGoals = async () => {
    try {
      const response = await fetch(API_URL + "/api/goals");
      if (response.ok) {
        const data = await response.json();
        setGoals(data);
        
        // Match currently selected goal to keep it fresh
        if (selectedGoal) {
          const updated = data.find((g: Goal) => g.id === selectedGoal.id);
          if (updated) setSelectedGoal(updated);
        }
      }
    } catch (err) {
      console.error("Failed to fetch goals:", err);
    }
  };

  const checkUserProfile = async () => {
    try {
      const response = await fetch(API_URL + "/api/user/profile");
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          setIsLoggedIn(true);
          setUserProfile(data.user);
          localStorage.setItem("cos_logged_in", "true");
          return true;
        }
      }
      setIsLoggedIn(false);
      setUserProfile(null);
      localStorage.removeItem("cos_logged_in");
      localStorage.removeItem("cos_jwt_token");
      localStorage.removeItem("cos_user_profile");
    } catch (err) {
      console.error("Failed to check user profile:", err);
      setIsLoggedIn(false);
      setUserProfile(null);
      localStorage.removeItem("cos_logged_in");
      localStorage.removeItem("cos_jwt_token");
      localStorage.removeItem("cos_user_profile");
    }
    return false;
  };

  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      await checkUserProfile();
      await fetchGoals();
      setLoading(false);
    };

    initApp();

    // Initialize and apply persistent theme on mount
    const savedTheme = localStorage.getItem("cos_theme") || "light";
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    
    if (savedTheme === "dark") {
      root.classList.add("dark");
    } else if (savedTheme === "light") {
      root.classList.add("light");
    } else {
      const systemPref = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemPref);
    }
  }, []);

  const handleStartWithGoal = async (_goalText: string) => {
    window.location.href = API_URL + "/auth/google";
  };

  const handleDemoLogin = async () => {
    window.location.href = API_URL + "/auth/google?mock=true";
  };

  const handleCreateGoal = async (title: string, deadline: string, context: string) => {
    const response = await fetch(API_URL + "/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, deadline, context }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to create goal");
    }

    const newGoal = await response.json();
    setGoals(prev => [newGoal, ...prev]);
    setSelectedGoal(newGoal);
    setActivePage("workspace");
  };

  const handleDeleteGoal = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm("Are you sure you want to delete this strategic goal from active tracking?");
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/api/goals/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setGoals(prev => prev.filter(g => g.id !== id));
        if (selectedGoal?.id === id) {
          setSelectedGoal(null);
          setActivePage("dashboard");
        }
      }
    } catch (err) {
      console.error("Failed to delete goal:", err);
    }
  };

  const handleToggleTask = async (taskId: string, isCompleted: boolean) => {
    if (!selectedGoal) return;
    await handleToggleGoalTask(selectedGoal.id, taskId, isCompleted);
  };

  const handleToggleGoalTask = async (goalId: string, taskId: string, isCompleted: boolean) => {
    try {
      const response = await fetch(`${API_URL}/api/goals/${goalId}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted }),
      });

      if (response.ok) {
        const updatedGoal = await response.json();
        if (selectedGoal?.id === goalId) {
          setSelectedGoal(updatedGoal);
        }
        setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
      }
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  };

  const handleExecuteTask = async (taskId: string, userPrompt?: string) => {
    if (!selectedGoal) return;

    const response = await fetch(`${API_URL}/api/goals/${selectedGoal.id}/tasks/${taskId}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPrompt }),
    });

    if (response.ok) {
      const updatedGoal = await response.json();
      setSelectedGoal(updatedGoal);
      setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    } else {
      throw new Error("Failed execution assistance step.");
    }
  };

  const handleSyncCalendar = async (goalId: string, sessionIds: string[]) => {
    const response = await fetch(`${API_URL}/api/goals/${goalId}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds }),
    });

    if (response.ok) {
      const updatedGoal = await response.json();
      if (selectedGoal?.id === goalId) {
        setSelectedGoal(updatedGoal);
      }
      setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    }
  };

  const handleTriggerRecovery = async () => {
    if (!selectedGoal) return;

    const response = await fetch(`${API_URL}/api/goals/${selectedGoal.id}/apply-recovery`, {
      method: "POST",
    });

    if (response.ok) {
      const updatedGoal = await response.json();
      setSelectedGoal(updatedGoal);
      setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(API_URL + "/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("[Logout] Failed to clean up cookies:", err);
    }
    localStorage.removeItem("cos_logged_in");
    localStorage.removeItem("cos_jwt_token");
    localStorage.removeItem("cos_user_profile");
    setIsLoggedIn(false);
    setUserProfile(null);
    setSelectedGoal(null);
    setActivePage("dashboard");
  };

  const filteredGoals = goals.filter(g => 
    g.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // If loading, show the full-screen loading screen
  if (loading) {
    return (
      <div className="min-h-screen bg-apple-canvas-parchment flex flex-col items-center justify-center dark:bg-[#1a1a1c]">
        <Loader2 className="w-8 h-8 text-apple-blue animate-spin animate-duration-1000" />
        <p className="text-[14px] text-gray-400 font-light mt-3">Synthesizing workspace dashboard...</p>
      </div>
    );
  }

  // If not logged in, show the pure landing experience
  if (!isLoggedIn) {
    return <LandingPage onStartWithGoal={handleStartWithGoal} onDemoLogin={handleDemoLogin} />;
  }

  return (
    <div id="chief-of-staff-root" className="min-h-screen bg-apple-canvas-parchment flex flex-col font-sans text-apple-ink selection:bg-apple-blue selection:text-white dark:bg-[#1a1a1c] dark:text-white">
      
      {/* Dynamic Top Navigation Bar (Receding chrome, no shadows, simple elegant hair-line border) */}
      <nav className="sticky top-0 bg-white/90 dark:bg-[#1d1d1f]/95 backdrop-blur-md border-b border-apple-hairline dark:border-zinc-800 z-50">
        <div className="w-full max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          
          {/* Logo element */}
          <div
            onClick={() => { setActivePage("dashboard"); setSelectedGoal(null); }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-apple-blue flex items-center justify-center text-white shadow-sm">
              <Target className="w-4.5 h-4.5" />
            </div>
            <span className="text-[17px] font-semibold text-apple-ink dark:text-white tracking-tight font-display">
              Guardian Core
            </span>
          </div>

          {/* Center navigation tabs */}
          <div className="hidden md:flex items-center bg-apple-canvas-parchment dark:bg-zinc-800/80 p-0.5 rounded-full border border-apple-hairline/80 dark:border-zinc-700">
            {[
              { id: "dashboard", label: "Dashboard" },
              { id: "calendar", label: "Calendar" },
              { id: "notifications", label: "Notifications" },
              { id: "settings", label: "Settings" }
            ].map(tab => (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => {
                  setActivePage(tab.id as any);
                  setSelectedGoal(null);
                }}
                className={`px-4.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all cursor-pointer ${
                  activePage === tab.id && !selectedGoal
                    ? "bg-white dark:bg-zinc-700 text-apple-ink dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-apple-ink dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right section with Search filter and avatar dropdown */}
          <div className="flex items-center gap-4">
            
            {/* Nav Search query */}
            <div className="relative hidden sm:block">
              <input
                id="navbar-search"
                type="text"
                placeholder="Search targets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-40 focus:w-56 bg-apple-canvas-parchment dark:bg-zinc-800/80 border border-apple-hairline dark:border-zinc-700 rounded-full pl-8 pr-3.5 py-1.5 text-[12px] placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-apple-blue transition-all"
              />
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
            </div>

            {/* Profile avatar switcher */}
            <div className="relative">
              <button
                id="avatar-dropdown-toggle"
                onClick={() => setIsAvatarOpen(!isAvatarOpen)}
                className="flex items-center gap-1 focus:outline-none cursor-pointer"
              >
                {userProfile?.picture ? (
                  <img
                    src={userProfile.picture}
                    alt={userProfile.name}
                    className="w-8 h-8 rounded-full shadow-sm hover:opacity-90 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-apple-blue text-white flex items-center justify-center font-bold text-xs shadow-sm hover:opacity-90">
                    {userProfile ? userProfile.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "GM"}
                  </div>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {isAvatarOpen && (
                <div className="absolute right-0 mt-2.5 w-48 bg-white dark:bg-zinc-800 border border-apple-hairline dark:border-zinc-700 rounded-[14px] shadow-xl py-1.5 z-50 animate-in fade-in duration-150">
                  <div className="px-4 py-2 border-b border-apple-hairline dark:border-zinc-700 text-left">
                    <p className="text-[12px] font-semibold text-apple-ink dark:text-white truncate">
                      {userProfile ? userProfile.name : "Geetansh Malik"}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {userProfile ? userProfile.email : "Premium Co-pilot"}
                    </p>
                  </div>
                  <button
                    id="avatar-logout"
                    onClick={() => { setIsAvatarOpen(false); handleLogout(); }}
                    className="w-full text-left px-4 py-2 text-[12px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main app viewport */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 relative">
        {selectedGoal ? (
          <GoalWorkspace
            goal={selectedGoal}
            onBack={() => { setSelectedGoal(null); setActivePage("dashboard"); }}
            onToggleTask={handleToggleTask}
            onExecuteTask={handleExecuteTask}
            onTriggerRecovery={handleTriggerRecovery}
            onRefreshGoal={fetchGoals}
          />
        ) : activePage === "dashboard" ? (
          <Dashboard
            goals={filteredGoals}
            onSelectGoal={(g) => setSelectedGoal(g)}
            onDeleteGoal={handleDeleteGoal}
            onCreateGoal={handleCreateGoal}
            userName={userProfile?.name ? userProfile.name.split(" ")[0] : undefined}
          />
        ) : activePage === "calendar" ? (
          <CalendarPage
            goals={goals}
            onToggleTask={handleToggleGoalTask}
            onSyncCalendar={handleSyncCalendar}
          />
        ) : activePage === "notifications" ? (
          <NotificationsPage
            goals={goals}
            onSelectGoal={(g) => setSelectedGoal(g)}
          />
        ) : activePage === "settings" ? (
          <SettingsPage onLogout={handleLogout} userProfile={userProfile} />
        ) : null}
      </main>

      {/* Footer chrome */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-apple-hairline dark:border-zinc-800 text-center text-gray-400 dark:text-gray-500 text-[11px] font-light">
        <p>© 2026 Guardian Core AI Corporation. All rights reserved.</p>
      </footer>
    </div>
  );
}
