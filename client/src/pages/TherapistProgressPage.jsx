import React, { useEffect, useMemo, useState } from "react";
import TherapistNavbar from "../components/TherapistNavbar";
import "../styles/TherapistProgressPage.css";
import { db } from "../firebase/config";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";

const TherapistDashboard = () => {
  return (
    <div className="therapist-dashboard-page">
      <TherapistNavbar />

      <div className="therapist-dashboard-container">
        {/* your existing therapist dashboard content here */}
      </div>
    </div>
  );
};

const TherapistProgressPage = () => {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [childrenList, setChildrenList] = useState([]);
  const [sessions, setSessions] = useState([]);

  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("all");

  useEffect(() => {
    loadChildrenAndSessions();
  }, []);

  const loadChildrenAndSessions = async () => {
    try {
      setLoading(true);
      setPageError("");

      const childrenSnap = await getDocs(collection(db, "children"));
      const childRows = childrenSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      setChildrenList(childRows);

      if (childRows.length > 0) {
        setSelectedChildId(childRows[0].id);
      }

      const sessionQuery = query(
        collection(db, "sessions"),
        orderBy("startedAt", "desc")
      );
      const sessionsSnap = await getDocs(sessionQuery);

      const sessionRows = sessionsSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const attemptsBySession = {};

      for (const session of sessionRows) {
        try {
          const attemptsSnap = await getDocs(
            query(collection(db, "sessions", session.id, "attempts"))
          );

          attemptsBySession[session.id] = attemptsSnap.docs.map((attemptDoc) => ({
            id: attemptDoc.id,
            ...attemptDoc.data(),
          }));
        } catch {
          attemptsBySession[session.id] = [];
        }
      }

      const merged = sessionRows.map((session) => ({
        ...session,
        attempts: attemptsBySession[session.id] || [],
      }));

      setSessions(merged);
      setLoading(false);
    } catch (error) {
      console.error("Therapist page load error:", error);
      setPageError(error.message || "Failed to load therapist progress.");
      setLoading(false);
    }
  };

  const selectedChild = useMemo(() => {
    return childrenList.find((child) => child.id === selectedChildId) || null;
  }, [childrenList, selectedChildId]);

  const childSessions = useMemo(() => {
    let filtered = sessions.filter((session) => session.childId === selectedChildId);

    if (selectedLevel !== "all") {
      filtered = filtered.filter(
        (session) => String(session.levelTitle || session.levelId || "") === selectedLevel
      );
    }

    return filtered;
  }, [sessions, selectedChildId, selectedLevel]);

  const availableLevels = useMemo(() => {
    const levelSet = new Set();

    sessions
      .filter((session) => session.childId === selectedChildId)
      .forEach((session) => {
        const levelName = String(session.levelTitle || session.levelId || "").trim();
        if (levelName) levelSet.add(levelName);
      });

    return Array.from(levelSet);
  }, [sessions, selectedChildId]);

  const summary = useMemo(() => {
    let totalSessions = childSessions.length;
    let totalItems = 0;
    let totalAttempted = 0;
    let totalExact = 0;
    let totalClose = 0;
    let totalPartial = 0;
    let totalIncorrect = 0;
    let scoreSum = 0;

    childSessions.forEach((session) => {
      totalItems += Number(session.totalItems || 0);
      totalAttempted += Number(session.attemptedItems || 0);
      totalExact += Number(session.exactCount || 0);
      totalClose += Number(session.closeCount || 0);
      totalPartial += Number(session.partialCount || 0);
      totalIncorrect += Number(session.incorrectCount || 0);
      scoreSum += Number(session.overallScore || 0);
    });

    const averageProgress =
      totalSessions > 0 ? Math.round(scoreSum / totalSessions) : 0;

    const completionRate =
      totalItems > 0 ? Math.round((totalAttempted / totalItems) * 100) : 0;

    let clinicalNote = "Needs more structured support.";
    if (averageProgress >= 80) clinicalNote = "Strong overall progress.";
    else if (averageProgress >= 60) clinicalNote = "Good improvement with continued support.";
    else if (averageProgress >= 40) clinicalNote = "Moderate progress; repeat targeted practice.";

    return {
      totalSessions,
      totalItems,
      totalAttempted,
      totalExact,
      totalClose,
      totalPartial,
      totalIncorrect,
      averageProgress,
      completionRate,
      clinicalNote,
    };
  }, [childSessions]);

  const levelBreakdown = useMemo(() => {
    const grouped = {};

    childSessions.forEach((session) => {
      const key = String(session.levelTitle || session.levelId || "Unassigned");

      if (!grouped[key]) {
        grouped[key] = {
          level: key,
          sessions: 0,
          items: 0,
          attempted: 0,
          exact: 0,
          close: 0,
          partial: 0,
          incorrect: 0,
          progressSum: 0,
        };
      }

      grouped[key].sessions += 1;
      grouped[key].items += Number(session.totalItems || 0);
      grouped[key].attempted += Number(session.attemptedItems || 0);
      grouped[key].exact += Number(session.exactCount || 0);
      grouped[key].close += Number(session.closeCount || 0);
      grouped[key].partial += Number(session.partialCount || 0);
      grouped[key].incorrect += Number(session.incorrectCount || 0);
      grouped[key].progressSum += Number(session.overallScore || 0);
    });

    return Object.values(grouped).map((row) => {
      const avgProgress =
        row.sessions > 0 ? Math.round(row.progressSum / row.sessions) : 0;

      let note = "Needs more practice";
      if (avgProgress >= 80) note = "Very good";
      else if (avgProgress >= 60) note = "Improving well";
      else if (avgProgress >= 40) note = "Moderate";

      return {
        ...row,
        avgProgress,
        note,
      };
    });
  }, [childSessions]);

  const itemBreakdown = useMemo(() => {
    const grouped = {};

    childSessions.forEach((session) => {
      (session.attempts || []).forEach((attempt) => {
        const key = attempt.itemId || attempt.itemText || "Unknown Item";

        if (!grouped[key]) {
          grouped[key] = {
            itemId: attempt.itemId || "",
            itemText: attempt.itemText || "Unnamed Item",
            itemType: attempt.itemType || "word",
            levelTitle: session.levelTitle || session.levelId || "Unassigned",
            totalAttempts: 0,
            exact: 0,
            close: 0,
            partial: 0,
            incorrect: 0,
            latestStatus: attempt.matchStatus || "incorrect",
          };
        }

        grouped[key].totalAttempts += 1;

        if (attempt.matchStatus === "exact") grouped[key].exact += 1;
        else if (attempt.matchStatus === "close") grouped[key].close += 1;
        else if (attempt.matchStatus === "partial") grouped[key].partial += 1;
        else grouped[key].incorrect += 1;

        grouped[key].latestStatus = attempt.matchStatus || grouped[key].latestStatus;
      });
    });

    return Object.values(grouped).map((row) => {
      let note = "Needs support";
      const strong = row.exact + row.close;
      if (strong >= row.totalAttempts * 0.7) note = "Stable response";
      else if (strong >= row.totalAttempts * 0.4) note = "Emerging skill";

      return {
        ...row,
        note,
      };
    });
  }, [childSessions]);

  const chartData = useMemo(() => {
    return [...childSessions]
      .slice()
      .reverse()
      .slice(-8)
      .map((session, index) => ({
        label: `S${index + 1}`,
        progress: Number(session.overallScore || 0),
        date: session.sessionDate || "-",
      }));
  }, [childSessions]);

  const recommendations = useMemo(() => {
    const list = [];

    if (summary.averageProgress < 50) {
      list.push("Repeat the current level before moving to a harder level.");
    }

    if (summary.totalPartial + summary.totalIncorrect > summary.totalExact + summary.totalClose) {
      list.push("Use more repetition-based practice for weak items.");
    }

    if (summary.completionRate < 60) {
      list.push("Reduce session load and focus on fewer items per session.");
    }

    if (summary.averageProgress >= 60) {
      list.push("Continue current level and gradually introduce longer words.");
    }

    if (list.length === 0) {
      list.push("Maintain the current therapy approach and monitor consistency.");
    }

    return list;
  }, [summary]);

  const formatDate = (value) => {
    if (!value) return "-";
    return String(value);
  };

  const handleDownloadReport = () => {
    const reportHtml = `
      <html>
        <head>
          <title>Pineda Patient's Progress Report</title>
          <style>
            body {
                font-family: "Segoe UI", Arial, sans-serif;
                padding: 40px;
                background: #f7fbff;
                color: #1e293b;
            }

            .report-shell {
                max-width: 1100px;
                margin: 0 auto;
            }

            .report-header {
                background: linear-gradient(135deg, #e8f8ff, #eefcf9);
                border: 1px solid #d8eaf5;
                border-radius: 18px;
                padding: 22px 24px;
                margin-bottom: 24px;
            }

            .report-header h1 {
                margin: 0 0 8px;
                font-size: 30px;
                color: #0f3254;
            }

            .report-header p {
                margin: 4px 0;
                color: #4f6b86;
                font-size: 14px;
            }

            h2 {
                margin: 0 0 14px;
                font-size: 20px;
                color: #17303d;
            }

            .section {
                margin-top: 24px;
            }

            .card {
                background: #ffffff;
                border: 1px solid #dbe8f3;
                border-radius: 16px;
                padding: 18px 20px;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
            }

            .summary-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 14px;
                margin-top: 14px;
            }

            .summary-item {
                background: #f8fbff;
                border: 1px solid #e3edf6;
                border-radius: 14px;
                padding: 14px;
            }

            .summary-item span {
                display: block;
                margin-bottom: 6px;
                color: #5d7691;
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
            }

            .summary-item strong {
                color: #0f3254;
                font-size: 20px;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 12px;
                background: #ffffff;
                border: 1px solid #dbe8f3;
                border-radius: 16px;
                overflow: hidden;
            }

            th, td {
                padding: 12px 14px;
                text-align: left;
                font-size: 14px;
                border-bottom: 1px solid #e8f0f7;
            }

            th {
                background: #f4f9fd;
                color: #4d6784;
                font-weight: 800;
            }

            tr:last-child td {
                border-bottom: none;
            }

            ul {
                margin: 0;
                padding-left: 20px;
            }

            li {
                margin-bottom: 8px;
                color: #4e6984;
                line-height: 1.6;
            }

            .note-box {
                margin-top: 14px;
                background: #eef8fd;
                border: 1px solid #cfe3f1;
                border-radius: 14px;
                padding: 14px 16px;
                color: #0f3254;
                font-weight: 600;
            }

            @media print {
                body {
                background: #ffffff;
                padding: 18px;
                }

                .card,
                table,
                .report-header {
                box-shadow: none;
                }
            }
            </style>
        </head>
        <body>
          <h1>Therapist Progress Report</h1>
          <p><strong>Child:</strong> ${selectedChild?.childName || "-"}</p>
          <p><strong>Code:</strong> ${selectedChild?.childCode || "-"}</p>
          <p><strong>Level Filter:</strong> ${selectedLevel === "all" ? "All Levels" : selectedLevel}</p>

          <div class="section">
            <h2>Summary</h2>
            <div class="card">
              <p><strong>Total Sessions:</strong> ${summary.totalSessions}</p>
              <p><strong>Total Items:</strong> ${summary.totalItems}</p>
              <p><strong>Attempted Items:</strong> ${summary.totalAttempted}</p>
              <p><strong>Average Progress:</strong> ${summary.averageProgress}%</p>
              <p><strong>Completion Rate:</strong> ${summary.completionRate}%</p>
              <p><strong>Clinical Note:</strong> ${summary.clinicalNote}</p>
            </div>
          </div>

          <div class="section">
            <h2>Recommendations</h2>
            <ul>
              ${recommendations.map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </div>

          <div class="section">
            <h2>Level-by-Level Review</h2>
            <table>
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Sessions</th>
                  <th>Items</th>
                  <th>Attempted</th>
                  <th>Average Progress</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                ${levelBreakdown
                  .map(
                    (row) => `
                  <tr>
                    <td>${row.level}</td>
                    <td>${row.sessions}</td>
                    <td>${row.items}</td>
                    <td>${row.attempted}</td>
                    <td>${row.avgProgress}%</td>
                    <td>${row.note}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Item-by-Item Review</h2>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Level</th>
                  <th>Total Attempts</th>
                  <th>Latest Status</th>
                  <th>Therapist Note</th>
                </tr>
              </thead>
              <tbody>
                ${itemBreakdown
                  .map(
                    (row) => `
                  <tr>
                    <td>${row.itemText}</td>
                    <td>${row.itemType}</td>
                    <td>${row.levelTitle}</td>
                    <td>${row.totalAttempts}</td>
                    <td>${row.latestStatus}</td>
                    <td>${row.note}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;

    const newWindow = window.open("", "_blank");
    newWindow.document.write(reportHtml);
    newWindow.document.close();
    newWindow.focus();
    newWindow.print();
  };

  if (loading) {
    return (
      <div className="therapist-progress-page">
        <div className="therapist-loading-box">Loading therapist progress...</div>
      </div>
    );
  }

  return (
    <div className="therapist-progress-page">
        <TherapistNavbar /> 
      <div className="therapist-progress-shell">
        <div className="therapist-top-header">
          <div>
            <span className="therapist-page-badge">Therapist Dashboard</span>
            <h1>Therapy Progress Review</h1>
            <p>
              Review child progress level by level and item by item with printable reports.
            </p>
          </div>

          <button className="download-report-btn" onClick={handleDownloadReport}>
            Download Report
          </button>
        </div>

        {pageError && <div className="therapist-error-banner">{pageError}</div>}

        <div className="therapist-filter-bar">
          <div className="filter-box">
            <label>Select Child</label>
            <select
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
            >
              {childrenList.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.childName || child.childCode || child.id}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-box">
            <label>Filter Level</label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
            >
              <option value="all">All Levels</option>
              {availableLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="child-overview-card">
          <div className="child-avatar-box">
            {(selectedChild?.childName || "C").charAt(0).toUpperCase()}
          </div>

          <div className="child-main-details">
            <h2>{selectedChild?.childName || "No Child Selected"}</h2>
            <p>
              Code: <strong>{selectedChild?.childCode || "-"}</strong>
            </p>
            <p>
              Assigned Level: <strong>{selectedChild?.assignedLevelName || "-"}</strong>
            </p>
          </div>

          <div className="child-note-box">
            <span>Clinical Summary</span>
            <strong>{summary.clinicalNote}</strong>
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <span>Total Sessions</span>
            <strong>{summary.totalSessions}</strong>
          </div>

          <div className="summary-card">
            <span>Average Progress</span>
            <strong>{summary.averageProgress}%</strong>
          </div>

          <div className="summary-card">
            <span>Completion Rate</span>
            <strong>{summary.completionRate}%</strong>
          </div>

          <div className="summary-card">
            <span>Attempted Items</span>
            <strong>{summary.totalAttempted}</strong>
          </div>
        </div>

        <div className="therapist-main-grid">
          <div className="chart-card">
            <div className="section-head">
              <h3>Progress Trend</h3>
              <p>Recent session progress overview</p>
            </div>

            <div className="chart-bars-wrap">
              {chartData.length === 0 ? (
                <div className="empty-therapist-box">No session trend data yet.</div>
              ) : (
                chartData.map((item) => (
                  <div className="chart-bar-col" key={`${item.label}-${item.date}`}>
                    <div className="chart-value">{item.progress}%</div>
                    <div className="chart-bar-bg">
                      <div
                        className="chart-bar-fill"
                        style={{ height: `${item.progress}%` }}
                      />
                    </div>
                    <span>{item.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="recommendation-card">
            <div className="section-head">
              <h3>Recommendations</h3>
              <p>Therapy-focused next steps</p>
            </div>

            <div className="recommendation-list">
              {recommendations.map((item, index) => (
                <div className="recommendation-item" key={index}>
                  <div className="recommendation-dot" />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="therapist-section-card">
          <div className="section-head">
            <h3>Level-by-Level Evaluation</h3>
            <p>Therapy performance grouped by level</p>
          </div>

          {levelBreakdown.length === 0 ? (
            <div className="empty-therapist-box">No level data available.</div>
          ) : (
            <div className="level-review-list">
              {levelBreakdown.map((level) => (
                <div className="level-review-card" key={level.level}>
                  <div className="level-review-top">
                    <div>
                      <h4>{level.level}</h4>
                      <p>{level.note}</p>
                    </div>
                    <div className="level-progress-pill">{level.avgProgress}%</div>
                  </div>

                  <div className="level-review-grid">
                    <div>
                      <small>Sessions</small>
                      <strong>{level.sessions}</strong>
                    </div>
                    <div>
                      <small>Total Items</small>
                      <strong>{level.items}</strong>
                    </div>
                    <div>
                      <small>Attempted</small>
                      <strong>{level.attempted}</strong>
                    </div>
                    <div>
                      <small>Strong Responses</small>
                      <strong>{level.exact + level.close}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="therapist-section-card">
          <div className="section-head">
            <h3>Item-by-Item Evaluation</h3>
            <p>Detailed review for therapist use</p>
          </div>

          {itemBreakdown.length === 0 ? (
            <div className="empty-therapist-box">No item data available.</div>
          ) : (
            <div className="item-review-table">
              <div className="item-review-head">
                <span>Item</span>
                <span>Type</span>
                <span>Level</span>
                <span>Attempts</span>
                <span>Status</span>
                <span>Note</span>
              </div>

              {itemBreakdown.map((item) => (
                <div className="item-review-row" key={`${item.levelTitle}-${item.itemId}-${item.itemText}`}>
                  <span>{item.itemText}</span>
                  <span>{item.itemType}</span>
                  <span>{item.levelTitle}</span>
                  <span>{item.totalAttempts}</span>
                  <span className={`status-tag ${item.latestStatus}`}>
                    {item.latestStatus}
                  </span>
                  <span>{item.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="therapist-section-card">
          <div className="section-head">
            <h3>Recent Sessions</h3>
            <p>Latest therapy sessions for this child</p>
          </div>

          {childSessions.length === 0 ? (
            <div className="empty-therapist-box">No sessions found.</div>
          ) : (
            <div className="recent-session-list">
              {childSessions.slice(0, 6).map((session) => (
                <div className="recent-session-card" key={session.id}>
                  <div>
                    <h4>{session.levelTitle || session.levelId || "Unassigned Level"}</h4>
                    <p>{formatDate(session.sessionDate)}</p>
                  </div>

                  <div className="recent-session-side">
                    <strong>{session.overallScore || 0}%</strong>
                    <span>{session.attemptedItems || 0} items attempted</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TherapistProgressPage;