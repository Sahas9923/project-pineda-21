import React, { useEffect, useMemo, useState } from "react";
import TherapistNavbar from "../components/TherapistNavbar";
import "../styles/TherapistDashboard.css";

import { auth, db } from "../firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const TherapistDashboard = () => {
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
      console.error("Error loading therapist dashboard:", error);
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

  const progressTrendData = useMemo(() => {
    if (patients.length === 0) {
      return [
        { name: "P1", progress: 0 },
        { name: "P2", progress: 0 },
        { name: "P3", progress: 0 },
        { name: "P4", progress: 0 },
        { name: "P5", progress: 0 },
      ];
    }

    return patients
      .slice()
      .sort(
        (a, b) => Number(b.overallProgress || 0) - Number(a.overallProgress || 0)
      )
      .slice(0, 7)
      .map((patient, index) => ({
        name: patient.childName
          ? patient.childName.split(" ")[0]
          : `P${index + 1}`,
        progress: Number(patient.overallProgress || 0),
      }));
  }, [patients]);

  const levelDistributionData = useMemo(() => {
    const levelMap = {};

    patients.forEach((patient) => {
      const level = patient.assignedLevelName || "Not Assigned";
      levelMap[level] = (levelMap[level] || 0) + 1;
    });

    const result = Object.entries(levelMap).map(([name, count]) => ({
      name,
      count,
    }));

    return result.length > 0
      ? result
      : [
          { name: "No Level", count: 0 },
          { name: "Level A", count: 0 },
        ];
  }, [patients]);

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

  if (loading) {
    return (
      <div className="therapist-dashboard-page">
        <TherapistNavbar />
        <div className="therapist-dashboard-container">
          <div className="dashboard-loading-card">
            Loading therapist dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="therapist-dashboard-page">
      <TherapistNavbar />

      <div className="therapist-dashboard-container">
        {pageMessage && <div className="dashboard-message">{pageMessage}</div>}

        {!pageMessage && (
          <>
            <section className="dashboard-top-grid">
              <div className="dashboard-hero-card">
                <span className="hero-badge">🧑‍⚕️ Therapist Dashboard</span>
                <h1>Welcome back, {therapistData.name}</h1>
                <p>
                  A modern overview of your therapy work, patient progress,
                  report activity, and professional profile — all in one place.
                </p>

                <div className="hero-stats-inline">
                  <div className="hero-mini-stat">
                    <span>Patients</span>
                    <strong>{stats.totalPatients}</strong>
                  </div>
                  <div className="hero-mini-stat">
                    <span>Average Progress</span>
                    <strong>{stats.avgProgress}%</strong>
                  </div>
                  <div className="hero-mini-stat">
                    <span>Pending Reports</span>
                    <strong>{stats.pendingReports}</strong>
                  </div>
                </div>
              </div>

              <div className="profile-summary-card">
                <div className="profile-summary-top">
                  {therapistData.imageUrl ? (
                    <img
                      src={therapistData.imageUrl}
                      alt={therapistData.name}
                      className="profile-summary-image"
                    />
                  ) : (
                    <div className="profile-summary-placeholder">🧑‍⚕️</div>
                  )}

                  <div className="profile-summary-text">
                    <h3>{therapistData.name}</h3>
                    <p>{therapistData.email || "No email added"}</p>
                    <span>{therapistData.therapistId || "No ID"}</span>
                  </div>
                </div>

                <div className="profile-summary-list">
                  <div className="summary-item">
                    <strong>Specialization</strong>
                    <span>{therapistData.specialization || "Not added"}</span>
                  </div>
                  <div className="summary-item">
                    <strong>SLMC Number</strong>
                    <span>{therapistData.slmcNumber || "Not added"}</span>
                  </div>
                  <div className="summary-item">
                    <strong>Experience</strong>
                    <span>{therapistData.experience || "Not added"}</span>
                  </div>
                  <div className="summary-item">
                    <strong>Status</strong>
                    <span>
                      {therapistData.availableOnline
                        ? "Available Online"
                        : "Offline Only"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="overview-grid">
              {quickOverview.map((item, index) => (
                <div className="overview-card" key={index}>
                  <div className="overview-icon">{item.icon}</div>
                  <div className="overview-content">
                    <span>{item.title}</span>
                    <strong>{item.value}</strong>
                    <p>{item.note}</p>
                  </div>
                </div>
              ))}
            </section>

            <section className="charts-grid two-chart-grid">
              <div className="chart-card chart-card-large">
                <div className="section-head">
                  <h2>Patient Progress Overview</h2>
                  <p>Average progress across assigned children from sessions.</p>
                </div>

                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={progressTrendData}>
                      <defs>
                        <linearGradient
                          id="progressOverviewFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#2ec4b6"
                            stopOpacity={0.45}
                          />
                          <stop
                            offset="95%"
                            stopColor="#2ec4b6"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="progress"
                        stroke="#2ec4b6"
                        fill="url(#progressOverviewFill)"
                        strokeWidth={3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card chart-card-large">
                <div className="section-head">
                  <h2>Level Distribution</h2>
                  <p>How children are spread across assigned levels.</p>
                </div>

                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={levelDistributionData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        radius={[10, 10, 0, 0]}
                        fill="#42c2ff"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="bottom-grid single-bottom-grid">
              <div className="side-card">
                <div className="section-head small-head">
                  <h2>Reminders</h2>
                  <p>Quick therapist action points.</p>
                </div>

                <div className="reminders-list">
                  {reminders.map((item, index) => (
                    <div className="reminder-item" key={index}>
                      <span className="reminder-dot"></span>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default TherapistDashboard;