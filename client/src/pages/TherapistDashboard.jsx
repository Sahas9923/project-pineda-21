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

const TherapistDashboard = () => {
  const [loading, setLoading] = useState(true);
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
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState("all");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [pageMessage, setPageMessage] = useState("");

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

      const patientList = [];
      const reportList = [];

      for (const childDoc of childSnapshot.docs) {
        const child = { id: childDoc.id, ...childDoc.data() };

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

        const patientItem = {
          ...child,
          overallProgress: Number(reportData?.overallProgress || 0),
          currentMode: reportData?.currentMode || "Therapy",
          totalCompletedItems: Number(reportData?.totalCompletedItems || 0),
          totalItems: Number(reportData?.totalItems || 0),
          strongestArea: reportData?.strongestArea || "",
          supportArea: reportData?.supportArea || "",
          reportStatus:
            reportData?.reportStatus ||
            (reportData ? "Completed" : "Pending"),
          therapistSummary: reportData?.therapistSummary || "",
          overallRecommendation: reportData?.overallRecommendation || "",
          homeAdvice: reportData?.homeAdvice || "",
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

  const levelOptions = useMemo(() => {
    const names = patients
      .map((p) => p.assignedLevelName)
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index);

    return names;
  }, [patients]);

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const searchValue = searchTerm.toLowerCase();

      const matchesSearch =
        (patient.childName || "").toLowerCase().includes(searchValue) ||
        (patient.childCode || "").toLowerCase().includes(searchValue) ||
        (patient.parentName || "").toLowerCase().includes(searchValue) ||
        (patient.parentEmail || "").toLowerCase().includes(searchValue);

      const matchesLevel =
        levelFilter === "all"
          ? true
          : (patient.assignedLevelName || "") === levelFilter;

      let matchesProgress = true;
      if (progressFilter === "low") {
        matchesProgress = Number(patient.overallProgress) < 40;
      } else if (progressFilter === "medium") {
        matchesProgress =
          Number(patient.overallProgress) >= 40 &&
          Number(patient.overallProgress) < 75;
      } else if (progressFilter === "high") {
        matchesProgress = Number(patient.overallProgress) >= 75;
      }

      return matchesSearch && matchesLevel && matchesProgress;
    });
  }, [patients, searchTerm, levelFilter, progressFilter]);

  const stats = useMemo(() => {
    const totalPatients = patients.length;
    const activePlans = patients.filter(
      (p) => p.assignedLevelId || p.assignedLevelName
    ).length;
    const pendingReports = reports.filter(
      (r) => r.reportStatus !== "Completed"
    ).length;
    const avgProgress =
      totalPatients > 0
        ? Math.round(
            patients.reduce(
              (sum, patient) => sum + Number(patient.overallProgress || 0),
              0
            ) / totalPatients
          )
        : 0;

    return {
      totalPatients,
      activePlans,
      pendingReports,
      avgProgress,
    };
  }, [patients, reports]);

  const reminders = useMemo(() => {
    return [
      `${stats.pendingReports} pending reports need attention.`,
      `${stats.totalPatients} assigned patients currently under review.`,
      `${patients.filter((p) => !p.deviceAssigned).length} children do not have an assigned device.`,
      `${patients.filter((p) => Number(p.overallProgress) < 40).length} children may need extra support.`,
    ];
  }, [stats, patients]);

  return (
    <div className="therapist-dashboard-page">
      <TherapistNavbar />

      <div className="therapist-dashboard-container">
        {pageMessage && <div className="dashboard-message">{pageMessage}</div>}

        {loading ? (
          <div className="dashboard-loading-card">
            Loading therapist dashboard...
          </div>
        ) : (
          <>
            <section className="dashboard-top-grid">
              <div className="dashboard-hero-card">
                <span className="hero-badge">🧑‍⚕️ Therapist Dashboard</span>
                <h1>Welcome back, {therapistData.name}</h1>
                <p>
                  Manage patients, monitor therapy progress, review reports, and
                  keep your professional details updated from one modern
                  dashboard.
                </p>

                <div className="hero-quick-actions">
                  <button className="hero-btn primary-btn">View Patients</button>
                  <button className="hero-btn secondary-btn">Review Reports</button>
                  <button className="hero-btn secondary-btn">View Profile</button>
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
                    <p>{therapistData.email || "No email"}</p>
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
                    <strong>Online Status</strong>
                    <span>
                      {therapistData.availableOnline
                        ? "Available Online"
                        : "Offline Only"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">👶</div>
                <div>
                  <h3>{stats.totalPatients}</h3>
                  <p>Assigned Patients</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">📘</div>
                <div>
                  <h3>{stats.activePlans}</h3>
                  <p>Active Therapy Plans</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">📝</div>
                <div>
                  <h3>{stats.pendingReports}</h3>
                  <p>Pending Reports</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">📈</div>
                <div>
                  <h3>{stats.avgProgress}%</h3>
                  <p>Average Progress</p>
                </div>
              </div>
            </section>

            <section className="dashboard-main-grid">
              <div className="patients-section-card">
                <div className="section-head">
                  <div>
                    <h2>Assigned Patients</h2>
                    <p>Search, filter, and review child therapy progress.</p>
                  </div>
                </div>

                <div className="filters-row">
                  <input
                    type="text"
                    placeholder="Search by child name, code, parent..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />

                  <select
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                  >
                    <option value="all">All Levels</option>
                    {levelOptions.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>

                  <select
                    value={progressFilter}
                    onChange={(e) => setProgressFilter(e.target.value)}
                  >
                    <option value="all">All Progress</option>
                    <option value="low">Below 40%</option>
                    <option value="medium">40% - 74%</option>
                    <option value="high">75% and above</option>
                  </select>
                </div>

                {filteredPatients.length === 0 ? (
                  <div className="empty-state-box">
                    No matching patients found.
                  </div>
                ) : (
                  <div className="patient-cards-grid">
                    {filteredPatients.map((patient) => (
                      <div
                        className="patient-card"
                        key={patient.id}
                        onClick={() => setSelectedPatient(patient)}
                      >
                        <div className="patient-card-top">
                          {patient.childImageUrl ? (
                            <img
                              src={patient.childImageUrl}
                              alt={patient.childName}
                              className="patient-image"
                            />
                          ) : (
                            <div className="patient-image-placeholder">🧒</div>
                          )}

                          <div className="patient-card-top-text">
                            <h3>{patient.childName || "Child"}</h3>
                            <p>{patient.childCode || "N/A"}</p>
                          </div>
                        </div>

                        <div className="patient-mini-grid">
                          <p>
                            <strong>Age</strong>
                            <span>{patient.age || "N/A"}</span>
                          </p>
                          <p>
                            <strong>Parent</strong>
                            <span>{patient.parentName || "N/A"}</span>
                          </p>
                          <p>
                            <strong>Level</strong>
                            <span>{patient.assignedLevelName || "Not assigned"}</span>
                          </p>
                          <p>
                            <strong>Device</strong>
                            <span>
                              {patient.deviceAssigned ? "Assigned" : "Not assigned"}
                            </span>
                          </p>
                        </div>

                        <div className="progress-block">
                          <div className="progress-label-row">
                            <span>Progress</span>
                            <strong>{patient.overallProgress || 0}%</strong>
                          </div>
                          <div className="progress-bar-bg">
                            <div
                              className="progress-bar-fill"
                              style={{
                                width: `${Math.min(
                                  Number(patient.overallProgress || 0),
                                  100
                                )}%`,
                              }}
                            ></div>
                          </div>
                        </div>

                        <div className="patient-card-actions">
                          <button type="button">View Details</button>
                          <button type="button">Write Report</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sidebar-column">
                <div className="side-card">
                  <div className="section-head small-head">
                    <h2>Reminders</h2>
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

                <div className="side-card">
                  <div className="section-head small-head">
                    <h2>Report Overview</h2>
                  </div>

                  <div className="report-summary-list">
                    {reports.length === 0 ? (
                      <p className="empty-side-text">No reports yet.</p>
                    ) : (
                      reports.slice(0, 5).map((report, index) => (
                        <div className="report-summary-item" key={index}>
                          <div>
                            <h4>{report.childName}</h4>
                            <p>{report.levelName}</p>
                          </div>
                          <span
                            className={`status-badge ${
                              report.reportStatus === "Completed"
                                ? "status-completed"
                                : "status-pending"
                            }`}
                          >
                            {report.reportStatus}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {selectedPatient && (
        <div
          className="patient-modal-overlay"
          onClick={() => setSelectedPatient(null)}
        >
          <div
            className="patient-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal-btn"
              onClick={() => setSelectedPatient(null)}
            >
              ✕
            </button>

            <div className="patient-modal-header">
              {selectedPatient.childImageUrl ? (
                <img
                  src={selectedPatient.childImageUrl}
                  alt={selectedPatient.childName}
                  className="patient-modal-image"
                />
              ) : (
                <div className="patient-modal-placeholder">🧒</div>
              )}

              <div>
                <h2>{selectedPatient.childName || "Child"}</h2>
                <p>{selectedPatient.childCode || "N/A"}</p>
                <span className="level-pill">
                  {selectedPatient.assignedLevelName || "No level assigned"}
                </span>
              </div>
            </div>

            <div className="patient-modal-grid">
              <div className="modal-info-card">
                <h4>Child Information</h4>
                <p><strong>Age:</strong> {selectedPatient.age || "N/A"}</p>
                <p><strong>Gender:</strong> {selectedPatient.gender || "N/A"}</p>
                <p><strong>Parent:</strong> {selectedPatient.parentName || "N/A"}</p>
                <p><strong>Parent Email:</strong> {selectedPatient.parentEmail || "N/A"}</p>
              </div>

              <div className="modal-info-card">
                <h4>Therapy Progress</h4>
                <p><strong>Progress:</strong> {selectedPatient.overallProgress || 0}%</p>
                <p><strong>Completed Items:</strong> {selectedPatient.totalCompletedItems || 0}</p>
                <p><strong>Total Items:</strong> {selectedPatient.totalItems || 0}</p>
                <p><strong>Current Mode:</strong> {selectedPatient.currentMode || "N/A"}</p>
              </div>

              <div className="modal-info-card">
                <h4>Support Notes</h4>
                <p><strong>Strongest Area:</strong> {selectedPatient.strongestArea || "N/A"}</p>
                <p><strong>Support Area:</strong> {selectedPatient.supportArea || "N/A"}</p>
                <p>
                  <strong>Recommendation:</strong>{" "}
                  {selectedPatient.overallRecommendation || "No recommendation yet"}
                </p>
              </div>

              <div className="modal-info-card">
                <h4>Device & Report</h4>
                <p>
                  <strong>Device:</strong>{" "}
                  {selectedPatient.deviceAssigned ? "Assigned" : "Not assigned"}
                </p>
                <p><strong>Device Name:</strong> {selectedPatient.deviceName || "N/A"}</p>
                <p><strong>Report Status:</strong> {selectedPatient.reportStatus || "Pending"}</p>
                <p><strong>Home Advice:</strong> {selectedPatient.homeAdvice || "N/A"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TherapistDashboard;