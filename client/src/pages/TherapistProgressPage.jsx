import React, { useEffect, useMemo, useState } from "react";
import TherapistNavbar from "../components/TherapistNavbar";
import "../styles/TherapistProgressPage.css";
import { db } from "../firebase/config";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

const TherapistProgressPage = () => {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [childrenList, setChildrenList] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [levels, setLevels] = useState([]);

  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("all");

  useEffect(() => {
    loadChildrenAndSessions();
  }, []);

  const loadChildrenAndSessions = async () => {
    try {
      setLoading(true);
      setPageError("");

      const [childrenSnap, sessionsSnap, levelsSnap] = await Promise.all([
        getDocs(collection(db, "children")),
        getDocs(query(collection(db, "sessions"), orderBy("startedAt", "desc"))),
        getDocs(collection(db, "levels")),
      ]);

      const childRows = childrenSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const sessionRows = sessionsSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const levelRows = levelsSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const attemptsBySession = {};

      for (const session of sessionRows) {
        try {
          const attemptsSnap = await getDocs(
            collection(db, "sessions", session.id, "attempts")
          );

          attemptsBySession[session.id] = attemptsSnap.docs.map((attemptDoc) => ({
            id: attemptDoc.id,
            ...attemptDoc.data(),
          }));
        } catch {
          attemptsBySession[session.id] = [];
        }
      }

      const mergedSessions = sessionRows.map((session) => ({
        ...session,
        attempts: attemptsBySession[session.id] || [],
      }));

      setChildrenList(childRows);
      setSessions(mergedSessions);
      setLevels(levelRows);

      if (childRows.length > 0) {
        setSelectedChildId(childRows[0].id);
      }

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
        (session) => String(session.levelId || "") === String(selectedLevel)
      );
    }

    return filtered;
  }, [sessions, selectedChildId, selectedLevel]);

  const availableLevels = useMemo(() => {
    const levelMap = new Map();

    sessions
      .filter((session) => session.childId === selectedChildId)
      .forEach((session) => {
        if (session.levelId) {
          levelMap.set(session.levelId, session.levelTitle || session.levelId);
        }
      });

    return Array.from(levelMap.entries()).map(([id, title]) => ({
      id,
      title,
    }));
  }, [sessions, selectedChildId]);

  const getLevelTargets = (levelId) => {
    return levels.find((lvl) => lvl.id === levelId) || null;
  };

  const summary = useMemo(() => {
    const totalSessions = childSessions.length;

    let totalItems = 0;
    let totalAttempted = 0;
    let overallSum = 0;
    let initialSum = 0;
    let middleSum = 0;
    let endSum = 0;

    childSessions.forEach((session) => {
      totalItems += Number(session.totalItems || 0);
      totalAttempted += Number(session.attemptedItems || 0);
      overallSum += Number(session.overallScore || 0);
      initialSum += Number(session.initialAverage || 0);
      middleSum += Number(session.middleAverage || 0);
      endSum += Number(session.endAverage || 0);
    });

    const averageProgress = totalSessions > 0 ? Math.round(overallSum / totalSessions) : 0;
    const averageInitial = totalSessions > 0 ? Math.round(initialSum / totalSessions) : 0;
    const averageMiddle = totalSessions > 0 ? Math.round(middleSum / totalSessions) : 0;
    const averageEnd = totalSessions > 0 ? Math.round(endSum / totalSessions) : 0;

    const completionRate =
      totalItems > 0 ? Math.round((totalAttempted / totalItems) * 100) : 0;

    const weakestArea = [
      { key: "Initial", value: averageInitial },
      { key: "Middle", value: averageMiddle },
      { key: "End", value: averageEnd },
    ].sort((a, b) => a.value - b.value)[0];

    let clinicalNote = "Needs more structured therapy and repeated guided practice.";
    if (averageProgress >= 85) {
      clinicalNote = "Excellent performance. Child is ready for more advanced speech practice.";
    } else if (averageProgress >= 70) {
      clinicalNote = "Good progress with stable performance. Continue level and gradually increase complexity.";
    } else if (averageProgress >= 55) {
      clinicalNote = "Moderate progress. Maintain the level and focus on weak phoneme positions.";
    }

    let recommendation = "Use more therapist-guided repetition and shorter item groups.";
    if (weakestArea.key === "Initial") {
      recommendation = "Focus on initial sound production with repeated cue-based starts and simple sound drills.";
    } else if (weakestArea.key === "Middle") {
      recommendation = "Focus on middle sound consistency using segmented word practice and slower repetition.";
    } else if (weakestArea.key === "End") {
      recommendation = "Focus on final sound closure using end-position word drills and corrective repetition.";
    }

    return {
      totalSessions,
      totalItems,
      totalAttempted,
      averageProgress,
      averageInitial,
      averageMiddle,
      averageEnd,
      weakestArea: weakestArea?.key || "-",
      weakestScore: weakestArea?.value || 0,
      completionRate,
      clinicalNote,
      recommendation,
    };
  }, [childSessions]);

  const levelBreakdown = useMemo(() => {
    const grouped = {};

    childSessions.forEach((session) => {
      const key = session.levelId || "unassigned";

      if (!grouped[key]) {
        grouped[key] = {
          levelId: key,
          level: session.levelTitle || "Unassigned",
          sessions: 0,
          items: 0,
          attempted: 0,
          overallSum: 0,
          initialSum: 0,
          middleSum: 0,
          endSum: 0,
        };
      }

      grouped[key].sessions += 1;
      grouped[key].items += Number(session.totalItems || 0);
      grouped[key].attempted += Number(session.attemptedItems || 0);
      grouped[key].overallSum += Number(session.overallScore || 0);
      grouped[key].initialSum += Number(session.initialAverage || 0);
      grouped[key].middleSum += Number(session.middleAverage || 0);
      grouped[key].endSum += Number(session.endAverage || 0);
    });

    return Object.values(grouped).map((row) => {
      const avgProgress = row.sessions > 0 ? Math.round(row.overallSum / row.sessions) : 0;
      const avgInitial = row.sessions > 0 ? Math.round(row.initialSum / row.sessions) : 0;
      const avgMiddle = row.sessions > 0 ? Math.round(row.middleSum / row.sessions) : 0;
      const avgEnd = row.sessions > 0 ? Math.round(row.endSum / row.sessions) : 0;

      const weakest = [
        { key: "Initial", value: avgInitial },
        { key: "Middle", value: avgMiddle },
        { key: "End", value: avgEnd },
      ].sort((a, b) => a.value - b.value)[0];

      let note = "Needs more practice";
      if (avgProgress >= 85) note = "Excellent";
      else if (avgProgress >= 70) note = "Improving well";
      else if (avgProgress >= 55) note = "Moderate progress";

      return {
        ...row,
        avgProgress,
        avgInitial,
        avgMiddle,
        avgEnd,
        weakestArea: weakest?.key || "-",
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
            levelTitle: session.levelTitle || "Unassigned",
            totalAttempts: 0,
            overallSum: 0,
            initialSum: 0,
            middleSum: 0,
            endSum: 0,
            latestFeedback: attempt.feedback || "",
          };
        }

        grouped[key].totalAttempts += 1;
        grouped[key].overallSum += Number(attempt.score || 0);
        grouped[key].initialSum += Number(attempt?.phonemePositionScores?.initial || 0);
        grouped[key].middleSum += Number(attempt?.phonemePositionScores?.middle || 0);
        grouped[key].endSum += Number(attempt?.phonemePositionScores?.end || 0);
        grouped[key].latestFeedback = attempt.feedback || grouped[key].latestFeedback;
      });
    });

    return Object.values(grouped).map((row) => {
      const avgOverall = row.totalAttempts > 0 ? Math.round(row.overallSum / row.totalAttempts) : 0;
      const avgInitial = row.totalAttempts > 0 ? Math.round(row.initialSum / row.totalAttempts) : 0;
      const avgMiddle = row.totalAttempts > 0 ? Math.round(row.middleSum / row.totalAttempts) : 0;
      const avgEnd = row.totalAttempts > 0 ? Math.round(row.endSum / row.totalAttempts) : 0;

      const weakest = [
        { key: "Initial", value: avgInitial },
        { key: "Middle", value: avgMiddle },
        { key: "End", value: avgEnd },
      ].sort((a, b) => a.value - b.value)[0];

      let note = "Needs therapist support";
      if (avgOverall >= 85) note = "Stable response";
      else if (avgOverall >= 70) note = "Emerging stability";
      else if (avgOverall >= 55) note = `Practice weak ${weakest.key.toLowerCase()} position`;

      return {
        ...row,
        avgOverall,
        avgInitial,
        avgMiddle,
        avgEnd,
        weakestArea: weakest?.key || "-",
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

    if (summary.averageProgress < 55) {
      list.push("Repeat the same level before introducing harder tasks.");
    }

    if (summary.weakestArea === "Initial") {
      list.push("Add more initial-sound drills with clear therapist modelling.");
    }

    if (summary.weakestArea === "Middle") {
      list.push("Use segmented word practice to improve middle-position production.");
    }

    if (summary.weakestArea === "End") {
      list.push("Use final-sound closure drills and slower repetition tasks.");
    }

    if (summary.completionRate < 60) {
      list.push("Reduce the number of items per session and use shorter guided therapy blocks.");
    }

    if (summary.averageProgress >= 70) {
      list.push("Gradually introduce more complex words, sentence tasks, or advanced items.");
    }

    if (list.length === 0) {
      list.push("Maintain the current therapy plan and continue monitoring consistency.");
    }

    return list;
  }, [summary]);

  const formatDate = (value) => {
    if (!value) return "-";
    return String(value);
  };

  const handleDownloadReport = () => {
    const targetLevel = selectedLevel !== "all" ? getLevelTargets(selectedLevel) : null;

    const reportHtml = `
      <html>
        <head>
          <title>🧸 PINEDA - Therapist Progress Report</title>
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
            .section {
              margin-top: 24px;
            }
            .card {
              background: #ffffff;
              border: 1px solid #dbe8f3;
              border-radius: 16px;
              padding: 18px 20px;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
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
            ul {
              margin: 0;
              padding-left: 20px;
            }
            li {
              margin-bottom: 8px;
              color: #4e6984;
              line-height: 1.6;
            }
          </style>
        </head>
        <body>
          <div class="report-shell">
            <div class="report-header">
              <h1>🧸 PINEDA - Therapist Progress Report</h1>
              <p><strong>Child:</strong> ${selectedChild?.childName || "-"}</p>
              <p><strong>Code:</strong> ${selectedChild?.childCode || "-"}</p>
              <p><strong>Level Filter:</strong> ${selectedLevel === "all" ? "All Levels" : availableLevels.find(l => l.id === selectedLevel)?.title || "-"}</p>
            </div>

            <div class="section">
              <div class="card">
                <h2>Overall Summary</h2>
                <div class="summary-grid">
                  <div class="summary-item"><span>Total Sessions</span><strong>${summary.totalSessions}</strong></div>
                  <div class="summary-item"><span>Overall Avg</span><strong>${summary.averageProgress}%</strong></div>
                  <div class="summary-item"><span>Initial Avg</span><strong>${summary.averageInitial}%</strong></div>
                  <div class="summary-item"><span>Middle Avg</span><strong>${summary.averageMiddle}%</strong></div>
                  <div class="summary-item"><span>End Avg</span><strong>${summary.averageEnd}%</strong></div>
                  <div class="summary-item"><span>Weakest Area</span><strong>${summary.weakestArea}</strong></div>
                  <div class="summary-item"><span>Weakest Score</span><strong>${summary.weakestScore}%</strong></div>
                  <div class="summary-item"><span>Completion</span><strong>${summary.completionRate}%</strong></div>
                </div>
                <p style="margin-top:14px;"><strong>Clinical Note:</strong> ${summary.clinicalNote}</p>
                <p><strong>Main Recommendation:</strong> ${summary.recommendation}</p>
              </div>
            </div>

            ${
              targetLevel
                ? `
              <div class="section">
                <div class="card">
                  <h2>Target Comparison</h2>
                  <p><strong>Target Overall:</strong> ${targetLevel.targetOverallScore || 0}%</p>
                  <p><strong>Target Initial:</strong> ${targetLevel.targetInitialScore || 0}%</p>
                  <p><strong>Target Middle:</strong> ${targetLevel.targetMiddleScore || 0}%</p>
                  <p><strong>Target End:</strong> ${targetLevel.targetEndScore || 0}%</p>
                </div>
              </div>
            `
                : ""
            }

            <div class="section">
              <div class="card">
                <h2>Recommendations</h2>
                <ul>
                  ${recommendations.map((item) => `<li>${item}</li>`).join("")}
                </ul>
              </div>
            </div>

            <div class="section">
              <h2>Level-by-Level Review</h2>
              <table>
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Sessions</th>
                    <th>Overall Avg</th>
                    <th>Initial Avg</th>
                    <th>Middle Avg</th>
                    <th>End Avg</th>
                    <th>Weakest Area</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  ${levelBreakdown.map((row) => `
                    <tr>
                      <td>${row.level}</td>
                      <td>${row.sessions}</td>
                      <td>${row.avgProgress}%</td>
                      <td>${row.avgInitial}%</td>
                      <td>${row.avgMiddle}%</td>
                      <td>${row.avgEnd}%</td>
                      <td>${row.weakestArea}</td>
                      <td>${row.note}</td>
                    </tr>
                  `).join("")}
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
                    <th>Attempts</th>
                    <th>Overall Avg</th>
                    <th>Weakest Area</th>
                    <th>Therapist Note</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemBreakdown.map((row) => `
                    <tr>
                      <td>${row.itemText}</td>
                      <td>${row.itemType}</td>
                      <td>${row.levelTitle}</td>
                      <td>${row.totalAttempts}</td>
                      <td>${row.avgOverall}%</td>
                      <td>${row.weakestArea}</td>
                      <td>${row.note}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
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
            <p>Review progress using overall, initial, middle, and end speech averages.</p>
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
                <option key={level.id} value={level.id}>
                  {level.title}
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
            <p>Code: <strong>{selectedChild?.childCode || "-"}</strong></p>
            <p>Assigned Level: <strong>{selectedChild?.assignedLevelName || "-"}</strong></p>
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
            <span>Overall Average</span>
            <strong>{summary.averageProgress}%</strong>
          </div>
          <div className="summary-card">
            <span>Initial Average</span>
            <strong>{summary.averageInitial}%</strong>
          </div>
          <div className="summary-card">
            <span>Middle Average</span>
            <strong>{summary.averageMiddle}%</strong>
          </div>
          <div className="summary-card">
            <span>End Average</span>
            <strong>{summary.averageEnd}%</strong>
          </div>
          <div className="summary-card">
            <span>Weakest Area</span>
            <strong>{summary.weakestArea}</strong>
          </div>
          <div className="summary-card">
            <span>Weakest Score</span>
            <strong>{summary.weakestScore}%</strong>
          </div>
          <div className="summary-card">
            <span>Completion Rate</span>
            <strong>{summary.completionRate}%</strong>
          </div>
        </div>

        <div className="therapist-main-grid">
          <div className="chart-card">
            <div className="section-head">
              <h3>Progress Trend</h3>
              <p>Recent session overall score trend</p>
            </div>

            <div className="chart-bars-wrap">
              {chartData.length === 0 ? (
                <div className="empty-therapist-box">No session trend data yet.</div>
              ) : (
                chartData.map((item) => (
                  <div className="chart-bar-col" key={`${item.label}-${item.date}`}>
                    <div className="chart-value">{item.progress}%</div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ height: `${item.progress}%` }} />
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
              <p>Average-based next steps</p>
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
            <p>Grouped by speech averages</p>
          </div>

          {levelBreakdown.length === 0 ? (
            <div className="empty-therapist-box">No level data available.</div>
          ) : (
            <div className="level-review-list">
              {levelBreakdown.map((level) => (
                <div className="level-review-card" key={level.levelId}>
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
                      <small>Initial</small>
                      <strong>{level.avgInitial}%</strong>
                    </div>
                    <div>
                      <small>Middle</small>
                      <strong>{level.avgMiddle}%</strong>
                    </div>
                    <div>
                      <small>End</small>
                      <strong>{level.avgEnd}%</strong>
                    </div>
                  </div>

                  <div className="level-extra-note">
                    Weakest area: <strong>{level.weakestArea}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="therapist-section-card">
          <div className="section-head">
            <h3>Item-by-Item Evaluation</h3>
            <p>Detailed review using latest averages</p>
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
                <span>Overall Avg</span>
                <span>Weakest Area</span>
                <span>Note</span>
              </div>

              {itemBreakdown.map((item) => (
                <div
                  className="item-review-row item-review-row-7"
                  key={`${item.levelTitle}-${item.itemId}-${item.itemText}`}
                >
                  <span>{item.itemText}</span>
                  <span>{item.itemType}</span>
                  <span>{item.levelTitle}</span>
                  <span>{item.totalAttempts}</span>
                  <span>{item.avgOverall}%</span>
                  <span>{item.weakestArea}</span>
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
                    <span>
                      I {session.initialAverage || 0}% | M {session.middleAverage || 0}% | E {session.endAverage || 0}%
                    </span>
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