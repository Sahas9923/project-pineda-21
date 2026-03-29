import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import { LinearGradient } from "expo-linear-gradient";

import ParentHeader from "../../components/ParentHeader";
import { auth, db } from "../../firebase/config";
import { collection, getDocs, query, where } from "firebase/firestore";
import { colors, radius, shadows } from "../../styles/theme";

const screenWidth = Dimensions.get("window").width;

export default function ProgressScreen() {
  const route = useRoute();
  const passedState = route.params || {};

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
      console.log("Error fetching children:", error);
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
      console.log("Error fetching child sessions:", error);
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

  const chartData = useMemo(() => {
    return {
      labels: weeklyJourney.map((item) => item.day),
      datasets: [
        {
          data: weeklyJourney.map((item) => item.progress),
        },
      ],
    };
  }, [weeklyJourney]);

  if (loading) {
    return (
      <View style={styles.page}>
        <ParentHeader />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading progress...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ParentHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!!pageError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{pageError}</Text>
          </View>
        )}

        <LinearGradient
          colors={["rgba(255,255,255,0.9)", "#f1fbff"]}
          style={styles.heroCard}
        >
          <View style={styles.heroLeft}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>Parent Progress Overview</Text>
            </View>

            <Text style={styles.heroTitle}>
              {selectedChild?.childName || "Child"}'s Journey
            </Text>

            <Text style={styles.heroSubtitle}>
              A simple view of your child’s learning experience, progress, and
              helpful recommendations for home practice.
            </Text>

            {childrenList.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.childSelectorRow}
              >
                {childrenList.map((child) => {
                  const active = selectedChildId === child.id;
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childChip,
                        active && styles.childChipActive,
                      ]}
                      onPress={() => setSelectedChildId(child.id)}
                    >
                      <Text
                        style={[
                          styles.childChipText,
                          active && styles.childChipTextActive,
                        ]}
                      >
                        {child.childName || child.childCode || "Child"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.heroMeta}>
              <View style={styles.heroMetaCard}>
                <Text style={styles.heroMetaLabel}>Current Level</Text>
                <Text style={styles.heroMetaValue}>{currentLevel}</Text>
              </View>

              <View style={styles.heroMetaCard}>
                <Text style={styles.heroMetaLabel}>Overall Progress</Text>
                <Text style={styles.heroMetaValue}>{overallProgress}</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroIllustrationCard}>
            <Text style={styles.heroEmoji}>🧸</Text>
            <Text style={styles.heroIllustrationTitle}>Learning with Confidence</Text>
            <Text style={styles.heroIllustrationText}>{latestSummary}</Text>
          </View>
        </LinearGradient>

        <View style={styles.summaryGrid}>
          {activitySummary.map((item, index) => (
            <View style={styles.summaryCard} key={index}>
              <View style={styles.summaryIconWrap}>
                <Text style={styles.summaryIcon}>{item.icon}</Text>
              </View>
              <Text style={styles.summaryLabel}>{item.title}</Text>
              <Text style={styles.summaryValue}>{item.value}</Text>
              <Text style={styles.summaryNote}>{item.note}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Weekly Progress</Text>
          <Text style={styles.sectionSubtitle}>
            Shows how your child’s learning journey has developed over recent sessions.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={chartData}
              width={Math.max(screenWidth - 40, 340)}
              height={260}
              yAxisSuffix="%"
              fromZero
              withShadow
              withInnerLines
              withOuterLines={false}
              chartConfig={{
                backgroundGradientFrom: "#ffffff",
                backgroundGradientTo: "#ffffff",
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(66, 194, 255, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(22, 50, 75, ${opacity})`,
                propsForDots: {
                  r: "4",
                  strokeWidth: "2",
                  stroke: "#42c2ff",
                },
                propsForBackgroundLines: {
                  strokeDasharray: "",
                  stroke: "#e7f1f7",
                },
              }}
              bezier
              style={styles.chartStyle}
            />
          </ScrollView>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recommendation</Text>
          <Text style={styles.sectionSubtitle}>
            Helpful guidance for supporting your child at home.
          </Text>

          <View style={styles.recommendationBox}>
            <Text style={styles.recommendationIcon}>💡</Text>
            <Text style={styles.recommendationText}>{recommendation}</Text>
          </View>

          <View style={styles.miniProgressBox}>
            <Text style={styles.miniProgressLabel}>Current Journey Progress</Text>
            <View style={styles.miniProgressBar}>
              <View
                style={[
                  styles.miniProgressFill,
                  { width: overallProgress },
                ]}
              />
            </View>
            <Text style={styles.miniProgressValue}>{overallProgress}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>What is Going Well</Text>
          <Text style={styles.sectionSubtitle}>
            Positive signs seen during recent sessions.
          </Text>

          {highlights.map((item, index) => (
            <View style={[styles.insightItem, styles.insightSuccess]} key={index}>
              <Text style={styles.insightDot}>✓</Text>
              <Text style={styles.insightText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Needs More Support</Text>
          <Text style={styles.sectionSubtitle}>
            Areas where extra practice may help.
          </Text>

          {supportAreas.map((item, index) => (
            <View style={[styles.insightItem, styles.insightSupport]} key={index}>
              <Text style={[styles.insightDot, styles.supportDot]}>•</Text>
              <Text style={styles.insightText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Learning Timeline</Text>
          <Text style={styles.sectionSubtitle}>
            A simple summary of your child’s recent progress experience.
          </Text>

          {sessionTimeline.map((item, index) => (
            <View style={styles.timelineItem} key={index}>
              <View style={styles.timelineMarker} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineDate}>{item.date}</Text>
                <Text style={styles.timelineTitle}>{item.title}</Text>
                <Text style={styles.timelineDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Experience Summary</Text>
          <Text style={styles.sectionSubtitle}>
            A parent-friendly overview instead of technical evaluation details.
          </Text>

          <View style={styles.experienceBox}>
            <Text style={styles.experienceTitle}>How the sessions are going</Text>
            <Text style={styles.experienceText}>
              Your child is gradually becoming more comfortable with guided
              speaking activities. Participation appears positive, and repeated
              practice is helping build confidence over time.
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={chartData}
              width={Math.max(screenWidth - 40, 340)}
              height={220}
              fromZero
              withShadow={false}
              withInnerLines
              withOuterLines={false}
              chartConfig={{
                backgroundGradientFrom: "#fcfeff",
                backgroundGradientTo: "#fcfeff",
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(0, 184, 148, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(22, 50, 75, ${opacity})`,
                propsForDots: {
                  r: "4",
                  strokeWidth: "2",
                  stroke: "#00b894",
                },
                propsForBackgroundLines: {
                  stroke: "#e7f1f7",
                },
              }}
              bezier
              style={styles.chartStyle}
            />
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f4fbff",
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
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#20496a",
  },

  errorBox: {
    backgroundColor: "#ffe7e7",
    borderWidth: 1,
    borderColor: "#efb7b7",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    color: "#b23d3d",
    fontWeight: "700",
    lineHeight: 20,
  },

  heroCard: {
    borderRadius: 30,
    padding: 20,
    marginBottom: 18,
    ...shadows.card,
  },
  heroLeft: {
    marginBottom: 16,
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dff5ff",
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  heroBadgeText: {
    color: "#0f7894",
    fontSize: 12,
    fontWeight: "800",
  },
  heroTitle: {
    fontSize: 31,
    fontWeight: "900",
    color: "#153756",
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: "#67839b",
  },

  childSelectorRow: {
    paddingTop: 18,
    gap: 10,
  },
  childChip: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cfe3ef",
  },
  childChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  childChipText: {
    color: "#52728f",
    fontWeight: "700",
  },
  childChipTextActive: {
    color: "#ffffff",
  },

  heroMeta: {
    gap: 12,
    marginTop: 18,
  },
  heroMetaCard: {
    backgroundColor: "#edf8ff",
    borderWidth: 1,
    borderColor: "#d4eaf7",
    borderRadius: 20,
    padding: 16,
  },
  heroMetaLabel: {
    color: "#62809b",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  heroMetaValue: {
    color: "#163552",
    fontSize: 22,
    fontWeight: "900",
  },

  heroIllustrationCard: {
    backgroundColor: "#f1fbff",
    borderWidth: 1,
    borderColor: "#d7ecf7",
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
  },
  heroEmoji: {
    fontSize: 54,
    marginBottom: 10,
  },
  heroIllustrationTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#173852",
    marginBottom: 10,
    textAlign: "center",
  },
  heroIllustrationText: {
    color: "#68859d",
    lineHeight: 22,
    fontSize: 14,
    textAlign: "center",
  },

  summaryGrid: {
    gap: 14,
    marginBottom: 18,
  },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#d9ebf6",
    borderRadius: 24,
    padding: 18,
    ...shadows.card,
  },
  summaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#dff7ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  summaryIcon: {
    fontSize: 26,
  },
  summaryLabel: {
    color: "#64819b",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: "900",
    color: "#143652",
    marginBottom: 6,
  },
  summaryNote: {
    color: "#6f8da4",
    lineHeight: 20,
    fontSize: 13,
  },

  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "#d9ebf6",
    borderRadius: 28,
    padding: 18,
    marginBottom: 18,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#173852",
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: "#68859d",
    lineHeight: 21,
    marginBottom: 16,
    fontSize: 14,
  },

  chartStyle: {
    marginTop: 4,
    borderRadius: 20,
  },

  recommendationBox: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: "#effbff",
    borderWidth: 1,
    borderColor: "#dceef8",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  recommendationIcon: {
    fontSize: 26,
  },
  recommendationText: {
    flex: 1,
    color: "#46657f",
    lineHeight: 22,
    fontSize: 14,
  },

  miniProgressBox: {
    backgroundColor: "#f8fcff",
    borderWidth: 1,
    borderColor: "#e0eef7",
    borderRadius: 20,
    padding: 16,
  },
  miniProgressLabel: {
    color: "#66839b",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 12,
  },
  miniProgressBar: {
    height: 14,
    borderRadius: 999,
    backgroundColor: "#e7f1f7",
    overflow: "hidden",
    marginBottom: 12,
  },
  miniProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  miniProgressValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#173852",
  },

  insightItem: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  insightSuccess: {
    backgroundColor: "#eefcf7",
    borderColor: "#d7efe4",
  },
  insightSupport: {
    backgroundColor: "#fff8ee",
    borderColor: "#f2e6d0",
  },
  insightDot: {
    color: "#1e7a58",
    fontWeight: "900",
    marginTop: 1,
    fontSize: 16,
  },
  supportDot: {
    color: "#b17a1a",
  },
  insightText: {
    flex: 1,
    color: "#4b6780",
    lineHeight: 21,
    fontSize: 14,
  },

  timelineItem: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 16,
  },
  timelineMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  timelineContent: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e0edf6",
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#fbfdff",
  },
  timelineDate: {
    color: "#68859d",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  timelineTitle: {
    color: "#173852",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 8,
  },
  timelineDetail: {
    color: "#6d8aa1",
    lineHeight: 21,
    fontSize: 14,
  },

  experienceBox: {
    backgroundColor: "#f5fbff",
    borderWidth: 1,
    borderColor: "#e0edf6",
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
  },
  experienceTitle: {
    color: "#173852",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 10,
  },
  experienceText: {
    color: "#647f97",
    lineHeight: 22,
    fontSize: 14,
  },
});