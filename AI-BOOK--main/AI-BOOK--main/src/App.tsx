import React, { useState, useEffect, useRef } from "react";
import { auth, db, googleProvider } from "./firebase";
import { signInWithPopup, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, getDocFromServer } from "firebase/firestore";
import { SUBJECTS, UserProfile, MCQQuestion } from "./types";
import { 
  MessageCircle, 
  BookOpen, 
  LogOut, 
  Send, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Award, 
  ChevronRight, 
  History, 
  Globe, 
  Scale, 
  TrendingUp, 
  Sparkles, 
  User as UserIcon,
  BrainCircuit,
  Target,
  ShieldCheck,
  Download,
  Plus,
  Minus,
  AlertTriangle
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong. Please refresh the page.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Firestore Error: ${parsed.error}`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-md w-full">
            <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-rose-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Application Error</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-200 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" /> Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const SUBJECT_ICONS: Record<string, React.ReactNode> = {
  History: <History className="w-5 h-5" />,
  Geography: <Globe className="w-5 h-5" />,
  "Political Science": <Scale className="w-5 h-5" />,
  Economics: <TrendingUp className="w-5 h-5" />
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [subject, setSubject] = useState<string>("");
  const [chapter, setChapter] = useState<string>("");
  const [mode, setMode] = useState<"chat" | "mcq" | "admin">("chat");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [mcqs, setMcqs] = useState<MCQQuestion[]>([]);
  const [currentMcqIndex, setCurrentMcqIndex] = useState(0);
  const [mcqScore, setMcqScore] = useState(0);
  const [mcqFinished, setMcqFinished] = useState(false);
  const [mcqLoading, setMcqLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        const profileRef = doc(db, "users", u.uid);
        // Use a small delay to ensure auth state is fully propagated to rules
        const timeoutId = setTimeout(() => {
          onSnapshot(profileRef, (snap) => {
            if (snap.exists()) {
              const data = snap.data() as UserProfile;
              // Force admin role for the specific email if it's not set
              if (u.email === "itdatadisha@gmail.com" && data.role !== "admin") {
                setDoc(profileRef, { role: "admin" }, { merge: true }).catch(console.error);
              }
              setProfile(data);
            } else {
              const newProfile: UserProfile = {
                uid: u.uid,
                email: u.email || "",
                displayName: u.displayName || "Student",
                tokensUsed: 0,
                dailyLimit: 50,
                lastResetDate: new Date().toISOString().split("T")[0],
                role: u.email === "itdatadisha@gmail.com" ? "admin" : "student"
              };
              setDoc(profileRef, newProfile).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`));
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
          });
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if ((profile?.role === "admin" || user?.email === "itdatadisha@gmail.com") && mode === "admin") {
      const usersRef = collection(db, "users");
      const unsubscribe = onSnapshot(usersRef, (snap) => {
        const users = snap.docs.map(doc => doc.data() as UserProfile);
        setAllUsers(users);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "users");
      });
      return unsubscribe;
    }
  }, [profile, mode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUpdateLimit = async (userId: string, newLimit: number) => {
    try {
      const userRef = doc(db, "users", userId);
      await setDoc(userRef, { dailyLimit: newLimit }, { merge: true });
    } catch (error) {
      console.error("Failed to update limit", error);
      alert("Failed to update limit. Check permissions.");
    }
  };

  const downloadCSV = () => {
    const headers = ["UID", "Name", "Email", "Tokens Used", "Daily Limit", "Role"];
    const rows = allUsers.map(u => [
      u.uid,
      u.displayName,
      u.email,
      u.tokensUsed,
      u.dailyLimit,
      u.role || "student"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `user_report_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogin = async () => {
    if (loginLoading) return;
    setLoginLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed", error);
      if (error.code === "auth/popup-closed-by-user") {
        alert("The login popup was closed before completion. Please try again and keep the popup open.");
      } else if (error.code === "auth/cancelled-popup-request") {
        // Ignore
      } else {
        alert("Login failed: " + error.message);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => auth.signOut();

  const sendMessage = async () => {
    if (!input.trim() || !subject || !chapter || chatLoading) return;
    
    if (profile && profile.tokensUsed >= profile.dailyLimit) {
      alert("Daily limit reached! Please try again tomorrow.");
      return;
    }

    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages);
    setInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, subject, chapter }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      if (data.content) {
        setMessages([...newMessages, { role: "assistant", content: data.content }]);
        if (profile) {
          const profileRef = doc(db, "users", profile.uid);
          setDoc(profileRef, { ...profile, tokensUsed: profile.tokensUsed + 1 }, { merge: true });
        }
      }
    } catch (error: any) {
      console.error("Chat error", error);
      alert(`Chat Error: ${error.message || "Failed to connect to the server. Please check your internet connection or try again later."}`);
    } finally {
      setChatLoading(false);
    }
  };

  const generateMcqs = async () => {
    if (!subject || !chapter || mcqLoading) return;
    setMcqLoading(true);
    setMcqs([]);
    setCurrentMcqIndex(0);
    setMcqScore(0);
    setMcqFinished(false);

    try {
      const response = await fetch("/api/generate-mcq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, chapter }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      if (data.mcqs) {
        setMcqs(data.mcqs);
      } else if (data.error) {
        alert("Error: " + data.error);
      } else {
        alert("Failed to generate MCQs. Please try again.");
      }
    } catch (error: any) {
      console.error("MCQ error", error);
      alert(`MCQ Error: ${error.message || "An unexpected error occurred while generating MCQs."}`);
    } finally {
      setMcqLoading(false);
    }
  };

  const handleMcqAnswer = (index: number) => {
    if (index === mcqs[currentMcqIndex].correctIndex) {
      setMcqScore(mcqScore + 1);
    }
    if (currentMcqIndex + 1 < mcqs.length) {
      setCurrentMcqIndex(currentMcqIndex + 1);
    } else {
      setMcqFinished(true);
      if (user) {
        addDoc(collection(db, "users", user.uid, "mcqResults"), {
          subject,
          chapter,
          score: mcqScore + (index === mcqs[currentMcqIndex].correctIndex ? 1 : 0),
          total: mcqs.length,
          timestamp: new Date().toISOString()
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-600 w-6 h-6" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 relative overflow-hidden p-4">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand-100 rounded-full blur-3xl opacity-50" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-50" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl border border-slate-100 text-slate-800 max-w-xl w-full text-center relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-600 text-xs font-bold tracking-wider uppercase mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            Powered by AI Smart Support
          </div>

          <div className="bg-brand-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-200">
            <BookOpen className="text-white w-10 h-10" />
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
            Where knowledge meets <span className="text-brand-600">intelligence.</span>
          </h1>

          <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-md mx-auto">
            Ask, explore, and master concepts instantly with a powerful AI designed to elevate your reading experience.
          </p>

          <div className="flex flex-col gap-4 mb-10">
            <div className="flex items-center justify-center gap-2 text-slate-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
              Learn faster. Understand deeper. Achieve more. 🚀
            </div>
          </div>

          <button 
            onClick={handleLogin}
            disabled={loginLoading}
            className="group relative w-full bg-slate-900 hover:bg-brand-600 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 shadow-xl shadow-slate-200 hover:shadow-brand-200 overflow-hidden disabled:opacity-70"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-brand-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10">
              {loginLoading ? "Opening Login..." : "Get Started Now"}
            </span>
            {!loginLoading && (
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="relative z-10"
              >
                <Send className="w-5 h-5" />
              </motion.div>
            )}
            {loginLoading && <Loader2 className="w-5 h-5 animate-spin relative z-10" />}
          </button>

          <p className="mt-8 text-sm text-slate-400">
            Join thousands of students mastering NCERT Class 10 Social Science.
          </p>
        </motion.div>
      </div>
    );
  }

  const isAdmin = profile?.role === "admin" || user?.email === "itdatadisha@gmail.com";

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="glass-panel sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-600 p-2 rounded-xl shadow-lg shadow-brand-200">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">DISHA AI</h1>
            <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">Class 10 Social Science</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 bg-slate-100/50 px-4 py-1.5 rounded-full border border-slate-200">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 leading-none">{profile?.displayName}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="h-1 w-16 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand-500" 
                    style={{ width: `${(profile?.tokensUsed || 0) / (profile?.dailyLimit || 50) * 100}%` }}
                  />
                </div>
                <p className="text-[9px] font-bold text-slate-500 uppercase">{profile?.tokensUsed}/{profile?.dailyLimit} Daily</p>
              </div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2.5 hover:bg-rose-50 hover:text-rose-600 rounded-xl text-slate-500 transition-all border border-transparent hover:border-rose-100"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Modern Sidebar */}
        <aside className="w-80 bg-white border-r border-slate-200 p-6 overflow-y-auto hidden lg:block">
          <div className="space-y-8">
            <div>
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Subjects</h2>
              <div className="grid grid-cols-1 gap-2">
                {Object.keys(SUBJECTS).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSubject(s); setChapter(""); }}
                    className={cn(
                      "group flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300",
                      subject === s 
                        ? "bg-brand-600 text-white shadow-xl shadow-brand-200" 
                        : "text-slate-600 hover:bg-slate-50 hover:text-brand-600"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-xl transition-colors",
                      subject === s ? "bg-white/20" : "bg-slate-100 group-hover:bg-brand-100"
                    )}>
                      {SUBJECT_ICONS[s]}
                    </div>
                    <span className="flex-1 text-left">{s}</span>
                    {subject === s && <motion.div layoutId="active-subject"><ChevronRight className="w-4 h-4" /></motion.div>}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {subject && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  key={subject}
                >
                  <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Chapters</h2>
                  <div className="space-y-1">
                    {SUBJECTS[subject as keyof typeof SUBJECTS].map((c) => (
                      <button
                        key={c}
                        onClick={() => setChapter(c)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs transition-all",
                          chapter === c 
                            ? "bg-brand-50 text-brand-700 font-bold border border-brand-100" 
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                        )}
                      >
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all",
                          chapter === c ? "bg-brand-500 scale-125" : "bg-slate-300"
                        )} />
                        <span className="flex-1 text-left line-clamp-2">{c}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

          {/* Mobile Selectors */}
          <div className="lg:hidden p-4 bg-white border-b border-slate-200 space-y-2 z-10">
            <div className="flex gap-2">
              <select 
                className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand-500/20"
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setChapter(""); }}
              >
                <option value="">Select Subject</option>
                {Object.keys(SUBJECTS).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {subject && (
                <select 
                  className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand-500/20"
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                >
                  <option value="">Select Chapter</option>
                  {SUBJECTS[subject as keyof typeof SUBJECTS].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="p-4 flex justify-center z-10 gap-2">
            <div className="bg-white p-1.5 rounded-2xl shadow-lg border border-slate-100 flex gap-1">
              <button 
                onClick={() => setMode("chat")}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
                  mode === "chat" ? "bg-brand-600 text-white shadow-lg shadow-brand-200" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <MessageCircle className="w-4 h-4" /> Doubt Solver
              </button>
              <button 
                onClick={() => setMode("mcq")}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
                  mode === "mcq" ? "bg-brand-600 text-white shadow-lg shadow-brand-200" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <BrainCircuit className="w-4 h-4" /> MCQ Practice
              </button>
            </div>
            {isAdmin && (
              <button 
                onClick={() => setMode("admin")}
                className={cn(
                  "px-6 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg",
                  mode === "admin" ? "bg-slate-900 text-white shadow-slate-200" : "bg-white text-slate-600 border border-slate-100 hover:bg-slate-50"
                )}
              >
                <ShieldCheck className="w-4 h-4" /> Admin Panel
              </button>
            )}
          </div>

          {mode === "admin" && isAdmin ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 overflow-y-auto p-6 relative z-10"
            >
              <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900">Admin Console</h2>
                    <p className="text-slate-500">Manage users and monitor platform usage.</p>
                  </div>
                  <button 
                    onClick={downloadCSV}
                    className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-brand-200 transition-all"
                  >
                    <Download className="w-4 h-4" /> Download Report (CSV)
                  </button>
                </div>

                <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usage</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Limit</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {allUsers.map((u) => (
                        <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                                {u.displayName.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">{u.displayName}</p>
                                <p className="text-xs text-slate-500">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-brand-500" 
                                  style={{ width: `${Math.min(100, (u.tokensUsed / u.dailyLimit) * 100)}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-700">{u.tokensUsed} / {u.dailyLimit}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600">
                              {u.dailyLimit} tokens
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => handleUpdateLimit(u.uid, u.dailyLimit - 5)}
                                className="p-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all border border-slate-100"
                                title="Decrease Limit"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleUpdateLimit(u.uid, u.dailyLimit + 5)}
                                className="p-2 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-all border border-slate-100"
                                title="Increase Limit"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : !subject || !chapter ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md"
              >
                <div className="w-24 h-24 bg-brand-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-12 h-12 text-brand-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Ready to start?</h2>
                <p className="text-slate-500">Pick a subject and chapter from the sidebar to begin your interactive learning journey.</p>
              </motion.div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col relative z-10">
              <AnimatePresence mode="wait">
                {mode === "chat" ? (
                  <motion.div 
                    key="chat"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {messages.length === 0 && (
                        <div className="max-w-2xl mx-auto">
                          <div className="bg-brand-600 rounded-3xl p-8 text-white shadow-2xl shadow-brand-200 relative overflow-hidden">
                            <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                            <h3 className="text-2xl font-bold mb-2">Hello, Scholar! 👋</h3>
                            <p className="text-brand-100 mb-6">I'm your AI tutor for <strong>{chapter}</strong>. Ask me anything about this chapter, and I'll help you understand it deeper.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {[
                                "Explain the main concept",
                                "Summary of this chapter",
                                "Important dates to remember",
                                "Key terms and definitions"
                              ].map(q => (
                                <button 
                                  key={q}
                                  onClick={() => { setInput(q); }}
                                  className="text-left px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-medium transition-all border border-white/10"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {messages.map((m, i) => (
                        <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[85%] p-4 text-sm",
                            m.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
                          )}>
                            <div className="prose prose-sm max-w-none prose-slate">
                              <ReactMarkdown>
                                {m.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="chat-bubble-ai p-4 flex items-center gap-2">
                            <div className="flex gap-1">
                              <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" />
                              <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="p-6 bg-white/50 backdrop-blur-sm border-t border-slate-200">
                      <div className="max-w-4xl mx-auto flex gap-3">
                        <input 
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                          placeholder="Ask a doubt..."
                          className="flex-1 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium"
                        />
                        <button 
                          onClick={sendMessage}
                          disabled={chatLoading || !input.trim()}
                          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-6 rounded-2xl transition-all shadow-lg shadow-brand-200 flex items-center justify-center"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="mcq"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 overflow-y-auto p-6 flex flex-col items-center"
                  >
                    {mcqs.length === 0 ? (
                      <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 text-center">
                        <div className="w-20 h-20 bg-brand-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
                          <Target className="w-10 h-10 text-brand-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-3">Challenge Yourself</h3>
                        <p className="text-slate-500 mb-8 leading-relaxed">We'll generate 5 high-quality MCQs based on <strong>{chapter}</strong> to test your understanding.</p>
                        <button 
                          onClick={generateMcqs}
                          disabled={mcqLoading}
                          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-brand-200 transition-all disabled:opacity-70"
                        >
                          {mcqLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <><Sparkles className="w-5 h-5" /> Generate Quiz</>}
                        </button>
                      </div>
                    ) : mcqFinished ? (
                      <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 text-center"
                      >
                        <div className="relative w-32 h-32 mx-auto mb-8">
                          <svg className="w-full h-full" viewBox="0 0 100 100">
                            <circle className="text-slate-100 stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50" />
                            <circle 
                              className="text-brand-600 stroke-current transition-all duration-1000 ease-out" 
                              strokeWidth="8" 
                              strokeDasharray={251.2} 
                              strokeDashoffset={251.2 - (251.2 * mcqScore) / mcqs.length} 
                              strokeLinecap="round" 
                              fill="transparent" 
                              r="40" cx="50" cy="50" 
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black text-slate-900">{mcqScore}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Score</span>
                          </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-3">Great Job!</h3>
                        <p className="text-slate-500 mb-8">You've mastered {Math.round((mcqScore / mcqs.length) * 100)}% of this chapter's key concepts.</p>
                        <div className="flex flex-col gap-3">
                          <button 
                            onClick={generateMcqs}
                            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-brand-200"
                          >
                            <RefreshCw className="w-4 h-4" /> Try Different Questions
                          </button>
                          <button 
                            onClick={() => setMode("chat")}
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-4 rounded-2xl transition-all"
                          >
                            Back to Doubt Solver
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="max-w-2xl w-full">
                        <div className="flex justify-between items-end mb-8">
                          <div>
                            <p className="text-[10px] font-black text-brand-600 uppercase tracking-[0.2em] mb-1">In Progress</p>
                            <h3 className="text-xl font-bold text-slate-900">Question {currentMcqIndex + 1} of {mcqs.length}</h3>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Progress</p>
                            <div className="h-2 w-32 bg-slate-200 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${((currentMcqIndex + 1) / mcqs.length) * 100}%` }}
                                className="h-full bg-brand-600" 
                              />
                            </div>
                          </div>
                        </div>
                        <motion.div 
                          key={currentMcqIndex}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-white p-8 md:p-10 rounded-[2rem] shadow-xl border border-slate-100 mb-6"
                        >
                          <h3 className="text-xl font-bold text-slate-800 mb-10 leading-relaxed">{mcqs[currentMcqIndex].question}</h3>
                          <div className="grid grid-cols-1 gap-4">
                            {mcqs[currentMcqIndex].options.map((opt, i) => (
                              <button
                                key={i}
                                onClick={() => handleMcqAnswer(i)}
                                className="mcq-option group"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:text-brand-600 transition-colors">
                                    {String.fromCharCode(65 + i)}
                                  </div>
                                  <span className="flex-1 text-slate-700 font-medium">{opt}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
