import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";

import TherapistHeader from "../../components/TherapistHeader";
import { auth, db } from "../../firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { colors, shadows } from "../../styles/theme";

export default function TherapistDashboard() {
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [pageMessage, setPageMessage] = useState("");

  const [therapistData, setTherapistData] = useState({
    name: "Therapist",
    email: "",
    therapistId: "",
    contact: "",
    slmcNumber: "",
    experience: "",
    specialization: "",
    imageUrl: "",
    availableOnline: false,
  });

  const [patients, setPatients] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;

      if (!user) {
        setPageMessage("No logged in therapist found.");
        setLoading(false);
        return;
      }

      const therapistRef = doc(db, "therapists", user.uid);
      const therapistSnap = await getDoc(therapistRef);

      if (therapistSnap.exists()) {
        const data = therapistSnap.data();
        setTherapistData({
          name: data.name || "Therapist",
          email: data.email || user.email || "",
          therapistId: data.therapistId || "",
          contact: data.contact || "",
          slmcNumber: data.slmcNumber || "",
          experience: data.experience || "",
          specialization: data.specialization || "",
          imageUrl: data.imageUrl || "",
          availableOnline: data.availableOnline || false,
        });
      }

      const childQuery = query(
        collection(db, "children"),
        where("therapistUid", "==", user.uid)
      );
      const childSnapshot = await getDocs(childQuery);
      const childDocs = childSnapshot.docs.map((childDoc) => ({
        id: childDoc.id,
        ...childDoc.data(),
      }));

      const sessionsSnapshot = await getDocs(collection(db, "sessions"));
      const allSessions = sessionsSnapshot.docs.map((sessionDoc) => ({
        id: sessionDoc.id,
        ...sessionDoc.data(),
      }));

      const patientList = [];
      const reportList = [];

      for (const child of childDocs) {
        let reportData = null;

        try {
          const reportSnap = await getDoc(
            doc(db, "children", child.id, "report", "main")
          );
          if (reportSnap.exists()) {
            reportData = reportSnap.data();
          }
        } catch (error) {
          console.log("No report found for child:", child.id);
        }

        const childSessions = allSessions.filter(
          (session) => session.childId === child.id
        );

        const sessionCount = childSessions.length;

        const sessionAverageProgress =
          sessionCount > 0
            ? Math.round(
                childSessions.reduce(
                  (sum, session) => sum + Number(session.overallScore || 0),
                  0
                ) / sessionCount
              )
            : 0;

        const totalCompletedItemsFromSessions = childSessions.reduce(
          (sum, session) => sum + Number(session.attemptedItems || 0),
          0
        );

        const totalItemsFromSessions = childSessions.reduce(
          (sum, session) =>
            sum +
            Number(
              session.totalItems ||
                session.totalLevelItems ||
                session.assignedItemsCount ||
                0
            ),
          0
        );

        const latestSession =
          childSessions.length > 0
            ? [...childSessions].sort((a, b) => {
                const aTime = a.startedAt?.seconds || 0;
                const bTime = b.startedAt?.seconds || 0;
                return bTime - aTime;
              })[0]
            : null;

        const patientItem = {
          ...child,
          overallProgress:
            sessionAverageProgress > 0
              ? sessionAverageProgress
              : Number(reportData?.overallProgress || 0),
          currentMode:
            latestSession?.sessionMode ||
            latestSession?.mode ||
            latestSession?.currentMode ||
            reportData?.currentMode ||
            "Therapy",
          totalCompletedItems:
            totalCompletedItemsFromSessions > 0
              ? totalCompletedItemsFromSessions
              : Number(reportData?.totalCompletedItems || 0),
          totalItems:
            totalItemsFromSessions > 0
              ? totalItemsFromSessions
              : Number(reportData?.totalItems || 0),
          reportStatus:
            reportData?.reportStatus || (reportData ? "Completed" : "Pending"),
          sessionCount,
        };

        patientList.push(patientItem);

        reportList.push({
          childId: child.id,
          childName: child.childName || "Child",
          childCode: child.childCode || "N/A",
          reportStatus: patientItem.reportStatus,
          overallProgress: patientItem.overallProgress,
          levelName: child.assignedLevelName || "Not assigned",
        });
      }

      setPatients(patientList);
      setReports(reportList);
    } catch (error) {
      console.log("Error loading therapist dashboard:", error);
      setPageMessage("Failed to load therapist dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalPatients = patients.length;

    const activePlans = patients.filter(
      (p) => p.assignedLevelId || p.assignedLevelName
    ).length;

    const assignedDevices = patients.filter((p) => p.deviceAssigned).length;

    const pendingReports = reports.filter(
      (r) => r.reportStatus !== "Completed"
    ).length;

    const patientsWithProgress = patients.filter(
      (patient) => Number(patient.overallProgress || 0) > 0
    );

    const avgProgress =
      patientsWithProgress.length > 0
        ? Math.round(
            patientsWithProgress.reduce(
              (sum, patient) => sum + Number(patient.overallProgress || 0),
              0
            ) / patientsWithProgress.length
          )
        : 0;

    return {
      totalPatients,
      activePlans,
      assignedDevices,
      pendingReports,
      avgProgress,
    };
  }, [patients, reports]);

  const reminders = useMemo(() => {
    return [
      `${stats.pendingReports} reports still need review.`,
      `${stats.totalPatients} patients are currently assigned to you.`,
      `${patients.filter((p) => !p.deviceAssigned).length} children do not have assigned devices.`,
      `${patients.filter((p) => Number(p.overallProgress) < 40).length} children may need additional support.`,
    ];
  }, [stats, patients]);

  const quickOverview = useMemo(() => {
    return [
      {
        title: "Assigned Patients",
        value: stats.totalPatients,
        note: "Children currently linked to your profile",
        icon: "👶",
      },
      {
        title: "Average Progress",
        value: `${stats.avgProgress}%`,
        note: "Average from child session scores",
        icon: "📈",
      },
      {
        title: "Pending Reports",
        value: stats.pendingReports,
        note: "Reports that still need therapist attention",
        icon: "📝",
      },
      {
        title: "Device Coverage",
        value: `${stats.assignedDevices}/${stats.totalPatients}`,
        note: "Assigned devices across current children",
        icon: "🧸",
      },
    ];
  }, [stats]);

  const topPatients = useMemo(() => {
    if (patients.length === 0) return [];

    return patients
      .slice()
      .sort(
        (a, b) => Number(b.overallProgress || 0) - Number(a.overallProgress || 0)
      )
      .slice(0, 5);
  }, [patients]);

  if (loading) {
    return (
      <View style={styles.page}>
        <TherapistHeader />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading therapist dashboard...</Text>
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
        {!!pageMessage && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{pageMessage}</Text>
          </View>
        )}

        {!pageMessage && (
          <>
            <LinearGradient
              colors={["#f4fbfa", "#eef7ff"]}
              style={styles.heroCard}
            >
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>🧑‍⚕️ Therapist Dashboard</Text>
              </View>

              <Text style={styles.heroTitle}>
                Welcome back, {therapistData.name}
              </Text>

              <Text style={styles.heroSubtitle}>
                A modern overview of your therapy work, patient progress,
                report activity, and professional profile — all in one place.
              </Text>

              <View style={styles.heroStatsWrap}>
                <MiniStat label="Patients" value={stats.totalPatients} />
                <MiniStat label="Average Progress" value={`${stats.avgProgress}%`} />
                <MiniStat label="Pending Reports" value={stats.pendingReports} />
              </View>
            </LinearGradient>

            {/* NEW: QUICK ACCESS */}
            <View style={styles.quickAccessCard}>
              <Text style={styles.sectionTitle}>Quick Access</Text>
              <Text style={styles.sectionSubtitle}>
                Open the most important therapist pages directly from here.
              </Text>

              <View style={styles.quickAccessGrid}>
                <TouchableOpacity
                  style={styles.quickNavCard}
                  onPress={() => navigation.navigate("PatientsScreen")}
                >
                  <View style={styles.quickNavIconWrap}>
                    <Text style={styles.quickNavIcon}>👶</Text>
                  </View>
                  <Text style={styles.quickNavTitle}>Patients</Text>
                  <Text style={styles.quickNavText}>
                    Assign patients, manage levels, devices, and therapy plans.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickNavCard}
                  onPress={() => navigation.navigate("TherapistProgressScreen")}
                >
                  <View style={styles.quickNavIconWrap}>
                    <Text style={styles.quickNavIcon}>📊</Text>
                  </View>
                  <Text style={styles.quickNavTitle}>Progress Review</Text>
                  <Text style={styles.quickNavText}>
                    Review therapy progress, item analysis, and reports.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickNavCard}
                  onPress={() => navigation.navigate("TherapistSettings")}
                >
                  <View style={styles.quickNavIconWrap}>
                    <Text style={styles.quickNavIcon}>⚙️</Text>
                  </View>
                  <Text style={styles.quickNavTitle}>Settings</Text>
                  <Text style={styles.quickNavText}>
                    Update profile, availability, and location details.
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.profileCard}>
              <View style={styles.profileTop}>
                {therapistData.imageUrl ? (
                  <Image
                    source={{ uri: therapistData.imageUrl }}
                    style={styles.profileImage}
                  />
                ) : (
                  <View style={styles.profilePlaceholder}>
                    <Text style={styles.profilePlaceholderText}>🧑‍⚕️</Text>
                  </View>
                )}

                <View style={styles.profileText}>
                  <Text style={styles.profileName}>{therapistData.name}</Text>
                  <Text style={styles.profileEmail}>
                    {therapistData.email || "No email added"}
                  </Text>
                  <Text style={styles.profileId}>
                    {therapistData.therapistId || "No ID"}
                  </Text>
                </View>
              </View>

              <ProfileRow
                label="Specialization"
                value={therapistData.specialization || "Not added"}
              />
              <ProfileRow
                label="SLMC Number"
                value={therapistData.slmcNumber || "Not added"}
              />
              <ProfileRow
                label="Experience"
                value={therapistData.experience || "Not added"}
              />
              <ProfileRow
                label="Status"
                value={
                  therapistData.availableOnline ? "Available Online" : "Offline Only"
                }
              />
            </View>

            <View style={styles.overviewGrid}>
              {quickOverview.map((item, index) => (
                <View style={styles.overviewCard} key={index}>
                  <View style={styles.overviewIconWrap}>
                    <Text style={styles.overviewIcon}>{item.icon}</Text>
                  </View>
                  <Text style={styles.overviewLabel}>{item.title}</Text>
                  <Text style={styles.overviewValue}>{item.value}</Text>
                  <Text style={styles.overviewNote}>{item.note}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Patient Progress Overview</Text>
              <Text style={styles.sectionSubtitle}>
                Average progress across assigned children from sessions.
              </Text>

              {topPatients.length === 0 ? (
                <Text style={styles.emptyText}>No patient progress data available yet.</Text>
              ) : (
                topPatients.map((patient) => (
                  <View style={styles.progressItem} key={patient.id}>
                    <View style={styles.progressTopRow}>
                      <Text style={styles.progressName}>
                        {patient.childName || "Child"}
                      </Text>
                      <Text style={styles.progressPercent}>
                        {Number(patient.overallProgress || 0)}%
                      </Text>
                    </View>

                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${Math.min(Number(patient.overallProgress || 0), 100)}%` },
                        ]}
                      />
                    </View>

                    <Text style={styles.progressMeta}>
                      {patient.assignedLevelName || "Not assigned"} • {patient.sessionCount || 0} sessions
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Reminders</Text>
              <Text style={styles.sectionSubtitle}>
                Quick therapist action points.
              </Text>

              <View style={styles.reminderList}>
                {reminders.map((item, index) => (
                  <View style={styles.reminderItem} key={index}>
                    <View style={styles.reminderDot} />
                    <Text style={styles.reminderText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MiniStat({ label, value }) {
  return (
    <View style={styles.heroMiniStat}>
      <Text style={styles.heroMiniLabel}>{label}</Text>
      <Text style={styles.heroMiniValue}>{value}</Text>
    </View>
  );
}

function ProfileRow({ label, value }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileRowLabel}>{label}</Text>
      <Text style={styles.profileRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#eef7ff",
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
    fontSize: 18,
    fontWeight: "800",
    color: "#20496a",
  },

  messageBox: {
    backgroundColor: "#fff6f6",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    ...shadows.card,
  },
  messageText: {
    color: "#b42318",
    fontWeight: "800",
    lineHeight: 20,
  },

  heroCard: {
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    ...shadows.card,
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ecfeff",
    borderWidth: 1,
    borderColor: "#a5f3fc",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  heroBadgeText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#14213d",
    marginBottom: 10,
  },
  heroSubtitle: {
    color: "#5b6472",
    lineHeight: 23,
    fontSize: 14,
    marginBottom: 18,
  },

  heroStatsWrap: {
    gap: 12,
  },
  heroMiniStat: {
    backgroundColor: "#f4fbff",
    borderWidth: 1,
    borderColor: "#d9edf1",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  heroMiniLabel: {
    color: "#667085",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 6,
  },
  heroMiniValue: {
    color: "#14213d",
    fontSize: 20,
    fontWeight: "900",
  },

  quickAccessCard: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    ...shadows.card,
  },
  quickAccessGrid: {
    gap: 12,
    marginTop: 6,
  },
  quickNavCard: {
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#dceaf5",
    borderRadius: 22,
    padding: 18,
  },
  quickNavIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#ecfeff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  quickNavIcon: {
    fontSize: 24,
  },
  quickNavTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#14213d",
    marginBottom: 6,
  },
  quickNavText: {
    color: "#667085",
    lineHeight: 20,
    fontSize: 13,
  },

  profileCard: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    ...shadows.card,
  },
  profileTop: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginBottom: 18,
  },
  profileImage: {
    width: 82,
    height: 82,
    borderRadius: 22,
    backgroundColor: "#eef2f3",
  },
  profilePlaceholder: {
    width: 82,
    height: 82,
    borderRadius: 22,
    backgroundColor: "#dffaf7",
    alignItems: "center",
    justifyContent: "center",
  },
  profilePlaceholderText: {
    fontSize: 30,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#14213d",
    marginBottom: 4,
  },
  profileEmail: {
    color: "#667085",
    marginBottom: 4,
  },
  profileId: {
    color: "#0f766e",
    fontWeight: "800",
    fontSize: 13,
  },

  profileRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#edf2f7",
  },
  profileRowLabel: {
    color: "#334155",
    fontWeight: "800",
    marginBottom: 4,
    fontSize: 13,
  },
  profileRowValue: {
    color: "#667085",
    lineHeight: 20,
  },

  overviewGrid: {
    gap: 14,
    marginBottom: 16,
  },
  overviewCard: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 24,
    padding: 18,
    ...shadows.card,
  },
  overviewIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#ecfeff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  overviewIcon: {
    fontSize: 24,
  },
  overviewLabel: {
    color: "#667085",
    fontWeight: "800",
    fontSize: 13,
    marginBottom: 8,
  },
  overviewValue: {
    color: "#14213d",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 6,
  },
  overviewNote: {
    color: "#667085",
    lineHeight: 20,
    fontSize: 13,
  },

  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#14213d",
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: "#667085",
    lineHeight: 21,
    fontSize: 13,
    marginBottom: 16,
  },

  progressItem: {
    marginBottom: 16,
  },
  progressTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  progressName: {
    color: "#14213d",
    fontWeight: "800",
    flex: 1,
  },
  progressPercent: {
    color: "#0f766e",
    fontWeight: "900",
  },
  progressBarBg: {
    height: 12,
    borderRadius: 999,
    backgroundColor: "#e8f1f7",
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  progressMeta: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },

  reminderList: {
    gap: 12,
  },
  reminderItem: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: "#f8fbfc",
    borderWidth: 1,
    borderColor: "#e4eef4",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  reminderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  reminderText: {
    flex: 1,
    color: "#5a6473",
    lineHeight: 21,
  },

  emptyText: {
    color: "#667085",
    lineHeight: 20,
  },
});