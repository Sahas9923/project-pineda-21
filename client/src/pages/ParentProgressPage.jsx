import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ParentNavbar from "../components/ParentNavbar";
import "../styles/ParentProgressPage.css";

import { auth, db } from "../firebase/config";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";

const ParentProgressPage = () => {
  const location = useLocation();
  const passedState = location.state || {};

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [childrenList, setChildrenList] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedChild, setSelectedChild] = useState(null);
  const [childSessions, setChildSessions] = useState([]);

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (childrenList.length === 0) return;

    let initialChildId = "";

    if (passedState.childId) {
      const matchedChild = childrenList.find((child) => child.id === passedState.childId);
      initialChildId = matchedChild ? matchedChild.id : childrenList[0].id;
    } else if (!selectedChildId) {
      initialChildId = childrenList[0].id;
    }

    if (initialChildId && !selectedChildId) {
      setSelectedChildId(initialChildId);
    }
  }, [childrenList, passedState.childId, selectedChildId]);

  useEffect(() => {
    if (!selectedChildId) return;

    const child = childrenList.find((item) => item.id === selectedChildId) || null;
    setSelectedChild(child);

    fetchChildSessions(selectedChildId);
  }, [selectedChildId, childrenList]);

  const fetchChildren = async () => {
    try {
      setLoading(true);
      setPageError("");

      const user = auth.currentUser;
      if (!user) {
        setPageError("Parent account not found.");
        setLoading(false);
        return;
      }

      const childQuery = query(
        collection(db, "children"),
        where("parentUid", "==", user.uid)
      );

      const childSnapshot = await getDocs(childQuery);

      const childData = childSnapshot.docs.map((childDoc) => ({
        id: childDoc.id,
        ...childDoc.data(),
      }));

      setChildrenList(childData);

      if (childData.length === 0) {
        setPageError("No child records found for this parent.");
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching children:", error);
      setPageError(error.message || "Failed to load children.");
      setLoading(false);
    }
  };

  const fetchChildSessions = async (childId) => {
    try {
      setLoading(true);

      const sessionsQuery = query(
        collection(db, "sessions"),
        where("childId", "==", childId)
      );

      const sessionsSnapshot = await getDocs(sessionsQuery);

      const sessions = sessionsSnapshot.docs.map((sessionDoc) => ({
        id: sessionDoc.id,
        ...sessionDoc.data(),
      }));

      const sortedSessions = [...sessions].sort((a, b) => {
        const aTime = a.startedAt?.seconds || 0;
        const bTime = b.startedAt?.seconds || 0;
        return aTime - bTime;
      });

      setChildSessions(sortedSessions);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching child sessions:", error);
      setPageError(error.message || "Failed to load child progress.");
      setLoading(false);
    }
  };

  const weeklyJourney = useMemo(() => {
    if (childSessions.length === 0) {
      return [
        { day: "S1", progress: 0 },
        { day: "S2", progress: 0 },
        { day: "S3", progress: 0 },
        { day: "S4", progress: 0 },
        { day: "S5", progress: 0 },
      ];
    }

    const recentSessions = childSessions.slice(-7);

    return recentSessions.map((session, index) => ({
      day: `S${index + 1}`,
      progress: Number(session.overallScore || 0),
    }));
  }, [childSessions]);

  const overallProgress = useMemo(() => {
    if (childSessions.length === 0) return "0%";

    const total = childSessions.reduce(
      (sum, session) => sum + Number(session.overallScore || 0),
      0
    );

    const avg = Math.round(total / childSessions.length);
    return `${avg}%`;
  }, [childSessions]);

  const currentLevel = useMemo(() => {
    return (
      selectedChild?.assignedLevelName ||
      selectedChild?.assignedLevelId ||
      "No Level Assigned"
    );
  }, [selectedChild]);

  const latestSummary = useMemo(() => {
    const avg = Number(overallProgress.replace("%", ""));

    if (avg >= 80) {
      return "Your child is showing very strong progress and is becoming more confident during guided speech activities.";
    }
    if (avg >= 60) {
      return "Your child is showing steady improvement with guided practice and repeated support.";
    }
    if (avg >= 40) {
      return "Your child is progressing gradually and may benefit from continued short, supportive sessions.";
    }
    return "Your child is still building confidence, and regular gentle practice can help improve familiarity and comfort.";
  }, [overallProgress]);

  const recommendation = useMemo(() => {
    const avg = Number(overallProgress.replace("%", ""));

    if (avg >= 80) {
      return "Continue regular home practice and slowly introduce longer words while keeping sessions enjoyable and encouraging.";
    }
    if (avg >= 60) {
      return "Practice in a calm environment for 5 to 10 minutes daily and repeat words slowly together.";
    }
    if (avg >= 40) {
      return "Keep sessions short, repeat familiar words often, and use positive encouragement after each attempt.";
    }
    return "Focus on short, gentle sessions in a quiet environment and help your child repeat simple familiar words with confidence.";
  }, [overallProgress]);

  const activitySummary = useMemo(() => {
    const totalSessions = childSessions.length;

    let engagement = "Starting";
    if (totalSessions >= 6) engagement = "High";
    else if (totalSessions >= 3) engagement = "Good";

    return [
      {
        title: "Sessions Completed",
        value: String(totalSessions),
        note: "Recent guided therapy sessions",
        icon: "🗓️",
      },
      {
        title: "Engagement",
        value: engagement,
        note: "Participation during practice sessions",
        icon: "🌟",
      },
      {
        title: "Current Focus",
        value:
          selectedChild?.assignedLevelName ||
          selectedChild?.assignedLevelId ||
          "Speech Practice",
        note: "Current practice area",
        icon: "🗣️",
      },
      {
        title: "Experience",
        value: "Supportive",
        note: "Parent-friendly progress view",
        icon: "😊",
      },
    ];
  }, [childSessions, selectedChild]);

  const highlights = useMemo(() => {
    const avg = Number(overallProgress.replace("%", ""));

    if (avg >= 70) {
      return [
        "Shows positive response during guided sessions",
        "Appears more comfortable with familiar items",
        "Benefits well from repeated structured practice",
      ];
    }

    if (avg >= 40) {
      return [
        "Participates in guided therapy sessions",
        "Responds better with repeated support",
        "Shows gradual improvement with familiar practice items",
      ];
    }

    return [
      "Is beginning to engage with practice sessions",
      "Can benefit from repeated encouragement",
      "May respond better with shorter sessions and simple words",
    ];
  }, [overallProgress]);

  const supportAreas = useMemo(() => {
    return [
      "Needs more support with longer or unfamiliar words",
      "May benefit from slower repetition and more pauses",
      "Practice is most effective in a quiet environment",
    ];
  }, []);

  const sessionTimeline = useMemo(() => {
    if (childSessions.length === 0) {
      return [
        {
          date: "No sessions yet",
          title: "Progress timeline will appear here",
          detail: "Once therapy sessions are completed, you will see a simple learning timeline here.",
        },
      ];
    }

    const recent = [...childSessions].slice(-3).reverse();

    return recent.map((session, index) => {
      let label = "Recent Session";
      if (index === 0) label = "Latest Session";
      else if (index === 1) label = "Previous Session";
      else if (index === 2) label = "Earlier Session";

      return {
        date: session.sessionDate || label,
        title: `${session.levelTitle || session.levelId || "Practice Session"} completed`,
        detail: `Your child practiced ${session.attemptedItems || 0} activities and continued building confidence through guided speech interaction.`,
      };
    });
  }, [childSessions]);

  if (loading) {
    return (
      <div className="parent-progress-page">
        <ParentNavbar />
        <div className="parent-progress-container">
          <div className="parent-progress-loading">Loading progress...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="parent-progress-page">
      <ParentNavbar />

      <div className="parent-progress-container">
        {pageError && <div className="parent-progress-error">{pageError}</div>}

        <div className="parent-progress-hero">
          <div className="hero-left">
            <span className="hero-badge">Parent Progress Overview</span>
            <h1>{selectedChild?.childName || "Child"}'s Journey</h1>
            <p>
              A simple view of your child’s learning experience, progress, and
              helpful recommendations for home practice.
            </p>

            {childrenList.length > 1 && (
              <div className="child-selector-wrap">
                <label>Select Child</label>
                <select
                  value={selectedChildId}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                  className="child-selector"
                >
                  {childrenList.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.childName || child.childCode || "Child"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="hero-meta">
              <div className="hero-meta-card">
                <span>Current Level</span>
                <strong>{currentLevel}</strong>
              </div>
              <div className="hero-meta-card">
                <span>Overall Progress</span>
                <strong>{overallProgress}</strong>
              </div>
            </div>
          </div>

          <div className="hero-right">
            <div className="hero-illustration-card">
              <div className="hero-emoji">🧸</div>
              <h3>Learning with Confidence</h3>
              <p>{latestSummary}</p>
            </div>
          </div>
        </div>

        <div className="summary-grid">
          {activitySummary.map((item, index) => (
            <div className="summary-card" key={index}>
              <div className="summary-icon">{item.icon}</div>
              <div className="summary-content">
                <span>{item.title}</span>
                <strong>{item.value}</strong>
                <p>{item.note}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="progress-main-grid">
          <div className="chart-card large-card">
            <div className="section-header">
              <h2>Weekly Progress</h2>
              <p>Shows how your child’s learning journey has developed over recent sessions.</p>
            </div>

            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={weeklyJourney}>
                  <defs>
                    <linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#42c2ff" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#42c2ff" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="day" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="progress"
                    stroke="#42c2ff"
                    fillOpacity={1}
                    fill="url(#progressFill)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="recommendation-card">
            <div className="section-header">
              <h2>Recommendation</h2>
              <p>Helpful guidance for supporting your child at home.</p>
            </div>

            <div className="recommendation-box">
              <div className="recommendation-icon">💡</div>
              <p>{recommendation}</p>
            </div>

            <div className="mini-progress-box">
              <span>Current Journey Progress</span>
              <div className="mini-progress-bar">
                <div
                  className="mini-progress-fill"
                  style={{ width: overallProgress }}
                />
              </div>
              <strong>{overallProgress}</strong>
            </div>
          </div>
        </div>

        <div className="insight-grid">
          <div className="insight-card">
            <div className="section-header">
              <h2>What is Going Well</h2>
              <p>Positive signs seen during recent sessions.</p>
            </div>

            <div className="insight-list">
              {highlights.map((item, index) => (
                <div className="insight-item success" key={index}>
                  <span className="insight-dot">✓</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="insight-card">
            <div className="section-header">
              <h2>Needs More Support</h2>
              <p>Areas where extra practice may help.</p>
            </div>

            <div className="insight-list">
              {supportAreas.map((item, index) => (
                <div className="insight-item support" key={index}>
                  <span className="insight-dot">•</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="timeline-card">
          <div className="section-header">
            <h2>Learning Timeline</h2>
            <p>A simple summary of your child’s recent progress experience.</p>
          </div>

          <div className="timeline-list">
            {sessionTimeline.map((item, index) => (
              <div className="timeline-item" key={index}>
                <div className="timeline-marker" />
                <div className="timeline-content">
                  <span className="timeline-date">{item.date}</span>
                  <h4>{item.title}</h4>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="experience-card">
          <div className="section-header">
            <h2>Experience Summary</h2>
            <p>A parent-friendly overview instead of technical evaluation details.</p>
          </div>

          <div className="experience-content">
            <div className="experience-text">
              <h3>How the sessions are going</h3>
              <p>
                Your child is gradually becoming more comfortable with guided
                speaking activities. Participation appears positive, and repeated
                practice is helping build confidence over time.
              </p>
            </div>

            <div className="experience-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={weeklyJourney}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="progress"
                    stroke="#00b894"
                    strokeWidth={4}
                    dot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentProgressPage;