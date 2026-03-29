import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";

import TherapistHeader from "../../components/TherapistHeader";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { colors, shadows } from "../../styles/theme";

export default function TherapistProgressScreen() {
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
      console.log("Therapist page load error:", error);
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

  const handleDownloadReport = async () => {
    const reportHtml = `
      <html>
        <head>
          <title>Pineda Therapist Progress Report</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 32px;
              color: #1e293b;
              background: #ffffff;
            }
            h1, h2 { color: #0f3254; }
            .section { margin-top: 24px; }
            .card {
              border: 1px solid #dbe8f3;
              border-radius: 12px;
              padding: 16px;
              margin-top: 10px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
            }
            .item {
              border: 1px solid #e5edf6;
              border-radius: 10px;
              padding: 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
            }
            th, td {
              border: 1px solid #dbe8f3;
              padding: 10px;
              text-align: left;
              font-size: 13px;
            }
            th {
              background: #f4f9fd;
            }
            ul {
              padding-left: 20px;
            }
          </style>
        </head>
        <body>
          <h1>Therapist Progress Report</h1>
          <p><strong>Child:</strong> ${selectedChild?.childName || "-"}</p>
          <p><strong>Code:</strong> ${selectedChild?.childCode || "-"}</p>
          <p><strong>Level Filter:</strong> ${
            selectedLevel === "all" ? "All Levels" : selectedLevel
          }</p>

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
                  <th>Attempts</th>
                  <th>Status</th>
                  <th>Note</th>
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

    await Print.printAsync({ html: reportHtml });
  };

  if (loading) {
    return (
      <View style={styles.page}>
        <TherapistHeader />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading therapist progress...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <TherapistHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Therapist Dashboard</Text>
            </View>
            <Text style={styles.pageTitle}>Therapy Progress Review</Text>
            <Text style={styles.pageSubtitle}>
              Review child progress level by level and item by item with printable reports.
            </Text>
          </View>

          <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadReport}>
            <Text style={styles.downloadBtnText}>Download Report</Text>
          </TouchableOpacity>
        </View>

        {!!pageError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{pageError}</Text>
          </View>
        )}

        <View style={styles.filterGrid}>
          <View style={styles.filterCard}>
            <Text style={styles.filterLabel}>Select Child</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.choiceRow}
            >
              {childrenList.map((child) => {
                const active = selectedChildId === child.id;
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => setSelectedChildId(child.id)}
                  >
                    <Text
                      style={[styles.choiceText, active && styles.choiceTextActive]}
                    >
                      {child.childName || child.childCode || child.id}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.filterCard}>
            <Text style={styles.filterLabel}>Filter Level</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.choiceRow}
            >
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  selectedLevel === "all" && styles.choiceChipActive,
                ]}
                onPress={() => setSelectedLevel("all")}
              >
                <Text
                  style={[
                    styles.choiceText,
                    selectedLevel === "all" && styles.choiceTextActive,
                  ]}
                >
                  All Levels
                </Text>
              </TouchableOpacity>

              {availableLevels.map((level) => {
                const active = selectedLevel === level;
                return (
                  <TouchableOpacity
                    key={level}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => setSelectedLevel(level)}
                  >
                    <Text
                      style={[styles.choiceText, active && styles.choiceTextActive]}
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <View style={styles.childOverviewCard}>
          <View style={styles.childAvatarBox}>
            <Text style={styles.childAvatarText}>
              {(selectedChild?.childName || "C").charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.childMainDetails}>
            <Text style={styles.childName}>
              {selectedChild?.childName || "No Child Selected"}
            </Text>
            <Text style={styles.childMeta}>
              Code: {selectedChild?.childCode || "-"}
            </Text>
            <Text style={styles.childMeta}>
              Assigned Level: {selectedChild?.assignedLevelName || "-"}
            </Text>
          </View>

          <View style={styles.noteBox}>
            <Text style={styles.noteLabel}>Clinical Summary</Text>
            <Text style={styles.noteValue}>{summary.clinicalNote}</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard label="Total Sessions" value={summary.totalSessions} />
          <SummaryCard label="Average Progress" value={`${summary.averageProgress}%`} />
          <SummaryCard label="Completion Rate" value={`${summary.completionRate}%`} />
          <SummaryCard label="Attempted Items" value={summary.totalAttempted} />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Progress Trend</Text>
          <Text style={styles.sectionSubtitle}>Recent session progress overview</Text>

          {chartData.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No session trend data yet.</Text>
            </View>
          ) : (
            <View style={styles.chartBarsWrap}>
              {chartData.map((item) => (
                <View style={styles.chartBarCol} key={`${item.label}-${item.date}`}>
                  <Text style={styles.chartValue}>{item.progress}%</Text>
                  <View style={styles.chartBarBg}>
                    <LinearGradient
                      colors={["#7be0d6", "#3b82f6"]}
                      style={[styles.chartBarFill, { height: `${item.progress}%` }]}
                    />
                  </View>
                  <Text style={styles.chartLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recommendations</Text>
          <Text style={styles.sectionSubtitle}>Therapy-focused next steps</Text>

          <View style={styles.recommendationList}>
            {recommendations.map((item, index) => (
              <View style={styles.recommendationItem} key={index}>
                <View style={styles.recommendationDot} />
                <Text style={styles.recommendationText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Level-by-Level Evaluation</Text>
          <Text style={styles.sectionSubtitle}>Therapy performance grouped by level</Text>

          {levelBreakdown.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No level data available.</Text>
            </View>
          ) : (
            levelBreakdown.map((level) => (
              <View style={styles.levelCard} key={level.level}>
                <View style={styles.levelTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.levelTitle}>{level.level}</Text>
                    <Text style={styles.levelNote}>{level.note}</Text>
                  </View>
                  <View style={styles.levelProgressPill}>
                    <Text style={styles.levelProgressText}>{level.avgProgress}%</Text>
                  </View>
                </View>

                <View style={styles.levelGrid}>
                  <MiniData label="Sessions" value={level.sessions} />
                  <MiniData label="Total Items" value={level.items} />
                  <MiniData label="Attempted" value={level.attempted} />
                  <MiniData label="Strong Responses" value={level.exact + level.close} />
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Item-by-Item Evaluation</Text>
          <Text style={styles.sectionSubtitle}>Detailed review for therapist use</Text>

          {itemBreakdown.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No item data available.</Text>
            </View>
          ) : (
            itemBreakdown.map((item) => (
              <View
                style={styles.itemCard}
                key={`${item.levelTitle}-${item.itemId}-${item.itemText}`}
              >
                <Text style={styles.itemName}>{item.itemText}</Text>
                <Text style={styles.itemMeta}>
                  {item.itemType} • {item.levelTitle}
                </Text>
                <Text style={styles.itemMeta}>Attempts: {item.totalAttempts}</Text>

                <View style={styles.statusTagWrap}>
                  <View style={[styles.statusTag, statusStyles(item.latestStatus)]}>
                    <Text style={[styles.statusTagText, statusTextStyles(item.latestStatus)]}>
                      {item.latestStatus}
                    </Text>
                  </View>
                </View>

                <Text style={styles.itemNote}>{item.note}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          <Text style={styles.sectionSubtitle}>Latest therapy sessions for this child</Text>

          {childSessions.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No sessions found.</Text>
            </View>
          ) : (
            childSessions.slice(0, 6).map((session) => (
              <View style={styles.recentSessionCard} key={session.id}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentSessionTitle}>
                    {session.levelTitle || session.levelId || "Unassigned Level"}
                  </Text>
                  <Text style={styles.recentSessionDate}>
                    {formatDate(session.sessionDate)}
                  </Text>
                </View>

                <View style={styles.recentSessionSide}>
                  <Text style={styles.recentSessionScore}>
                    {session.overallScore || 0}%
                  </Text>
                  <Text style={styles.recentSessionItems}>
                    {session.attemptedItems || 0} items attempted
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryCard({ label, value }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function MiniData({ label, value }) {
  return (
    <View style={styles.miniDataCard}>
      <Text style={styles.miniDataLabel}>{label}</Text>
      <Text style={styles.miniDataValue}>{value}</Text>
    </View>
  );
}

const statusStyles = (status) => {
  if (status === "exact") return { backgroundColor: "rgba(34,197,94,0.12)" };
  if (status === "close") return { backgroundColor: "rgba(59,130,246,0.12)" };
  if (status === "partial") return { backgroundColor: "rgba(245,158,11,0.12)" };
  return { backgroundColor: "rgba(239,68,68,0.12)" };
};

const statusTextStyles = (status) => {
  if (status === "exact") return { color: "#15803d" };
  if (status === "close") return { color: "#2563eb" };
  if (status === "partial") return { color: "#b45309" };
  return { color: "#b91c1c" };
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f7fbff",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    color: "#17303d",
    fontSize: 18,
    fontWeight: "800",
  },

  topHeader: {
    gap: 14,
    marginBottom: 18,
  },
  badge: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(46,196,182,0.12)",
    marginBottom: 10,
  },
  badgeText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#0f3254",
    marginBottom: 8,
  },
  pageSubtitle: {
    color: "#5d7691",
    fontSize: 14,
    lineHeight: 22,
  },

  downloadBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    ...shadows.soft,
  },
  downloadBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  errorBanner: {
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#fff4f4",
    borderWidth: 1,
    borderColor: "#ffd6d6",
  },
  errorText: {
    color: "#b42318",
    fontWeight: "800",
  },

  filterGrid: {
    gap: 14,
    marginBottom: 16,
  },
  filterCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "#dbe8f3",
    borderRadius: 24,
    padding: 16,
    ...shadows.card,
  },
  filterLabel: {
    color: "#4f6b86",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },

  choiceRow: {
    gap: 10,
    paddingBottom: 4,
  },
  choiceChip: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#c8d8e8",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  choiceChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceText: {
    color: "#17303d",
    fontWeight: "700",
    fontSize: 13,
  },
  choiceTextActive: {
    color: "#ffffff",
  },

  childOverviewCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "#dbe8f3",
    borderRadius: 28,
    padding: 18,
    marginBottom: 16,
    ...shadows.card,
  },
  childAvatarBox: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  childAvatarText: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
  },
  childMainDetails: {
    marginBottom: 14,
  },
  childName: {
    color: "#17303d",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  childMeta: {
    color: "#58708b",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
  noteBox: {
    borderRadius: 20,
    backgroundColor: "#eef8fd",
    borderWidth: 1,
    borderColor: "#cfe3f1",
    padding: 16,
  },
  noteLabel: {
    color: "#58708b",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  noteValue: {
    color: "#0f3254",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },

  summaryGrid: {
    gap: 14,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "#dbe8f3",
    borderRadius: 22,
    padding: 18,
    ...shadows.card,
  },
  summaryLabel: {
    color: "#5d7691",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  summaryValue: {
    color: "#0f3254",
    fontSize: 28,
    fontWeight: "900",
  },

  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "#dbe8f3",
    borderRadius: 26,
    padding: 18,
    marginBottom: 16,
    ...shadows.card,
  },
  sectionTitle: {
    color: "#17303d",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: "#647c95",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },

  chartBarsWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 250,
    paddingTop: 8,
  },
  chartBarCol: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  chartValue: {
    color: "#17303d",
    fontSize: 13,
    fontWeight: "900",
  },
  chartBarBg: {
    width: "100%",
    maxWidth: 40,
    height: 160,
    borderRadius: 999,
    backgroundColor: "#dfeefa",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartBarFill: {
    width: "100%",
    borderRadius: 999,
    minHeight: 8,
  },
  chartLabel: {
    color: "#58708b",
    fontSize: 12,
    fontWeight: "800",
  },

  recommendationList: {
    gap: 12,
  },
  recommendationItem: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#e4edf6",
  },
  recommendationDot: {
    width: 10,
    height: 10,
    marginTop: 7,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  recommendationText: {
    flex: 1,
    color: "#4e6984",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },

  levelCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: "#f5faff",
    borderWidth: 1,
    borderColor: "#e1ebf5",
    marginBottom: 14,
  },
  levelTop: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  levelTitle: {
    color: "#17303d",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  levelNote: {
    color: "#627b96",
    fontSize: 13,
  },
  levelProgressPill: {
    borderRadius: 999,
    backgroundColor: "rgba(46,196,182,0.16)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  levelProgressText: {
    color: "#0f3254",
    fontWeight: "900",
  },
  levelGrid: {
    gap: 10,
  },
  miniDataCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5edf6",
  },
  miniDataLabel: {
    color: "#7088a0",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  miniDataValue: {
    color: "#17303d",
    fontSize: 20,
    fontWeight: "900",
  },

  itemCard: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e1ebf5",
    backgroundColor: "#ffffff",
    marginBottom: 12,
  },
  itemName: {
    color: "#17303d",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  itemMeta: {
    color: "#58708b",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  statusTagWrap: {
    marginTop: 6,
    marginBottom: 8,
  },
  statusTag: {
    alignSelf: "flex-start",
    minWidth: 82,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  statusTagText: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  itemNote: {
    color: "#4e6984",
    lineHeight: 20,
  },

  recentSessionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#f5faff",
    borderWidth: 1,
    borderColor: "#e2ebf5",
    marginBottom: 12,
  },
  recentSessionTitle: {
    color: "#17303d",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  recentSessionDate: {
    color: "#647c95",
    fontSize: 13,
  },
  recentSessionSide: {
    alignItems: "flex-end",
  },
  recentSessionScore: {
    color: "#0f3254",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4,
  },
  recentSessionItems: {
    color: "#627b96",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },

  emptyBox: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#cfe0ef",
    borderStyle: "dashed",
  },
  emptyText: {
    color: "#607992",
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 20,
  },
});