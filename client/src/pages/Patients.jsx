import React, { useEffect, useMemo, useState } from "react";
import TherapistNavbar from "../components/TherapistNavbar";
import "../styles/Patients.css";

import { auth, db } from "../firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const TherapistPatients = () => {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [therapistData, setTherapistData] = useState(null);
  const [allChildren, setAllChildren] = useState([]);
  const [assignedPatients, setAssignedPatients] = useState([]);
  const [levels, setLevels] = useState([]);

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [therapyPlan, setTherapyPlan] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [patientTimeline, setPatientTimeline] = useState([]);

  const [searchText, setSearchText] = useState("");
  const [selectedTab, setSelectedTab] = useState("overview");

  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [assigningPatient, setAssigningPatient] = useState(false);

  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [assigningDevice, setAssigningDevice] = useState(false);

  const [showLevelEditDialog, setShowLevelEditDialog] = useState(false);
  const [showDeviceEditDialog, setShowDeviceEditDialog] = useState(false);
  const [showPlanEditDialog, setShowPlanEditDialog] = useState(false);

  const [savingLevelEdit, setSavingLevelEdit] = useState(false);
  const [savingDeviceEdit, setSavingDeviceEdit] = useState(false);
  const [savingPlanEdit, setSavingPlanEdit] = useState(false);

  const [assignPatientForm, setAssignPatientForm] = useState({
    childId: "",
    therapistId: "",
    therapistName: "",
    levelId: "",
    levelName: "",
  });

  const [deviceForm, setDeviceForm] = useState({
    deviceName: "Pineda Companion Device",
    maxSessionsPerDay: 3,
    sessionDurationMinutes: 20,
    minimumGapBetweenSessionsMinutes: 30,
    lockTherapyAfterLimit: true,
    therapyStartTime: "",
    therapyEndTime: "",
    fallbackMode: "companion",
  });

  const [levelEditForm, setLevelEditForm] = useState({
    levelId: "",
    levelName: "",
  });

  const [deviceEditForm, setDeviceEditForm] = useState({
    deviceName: "",
    deviceStatus: "Assigned",
  });

  const [planEditForm, setPlanEditForm] = useState({
    maxSessionsPerDay: 3,
    sessionDurationMinutes: 20,
    minimumGapBetweenSessionsMinutes: 30,
    lockTherapyAfterLimit: true,
    therapyStartTime: "",
    therapyEndTime: "",
    fallbackMode: "companion",
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  };

  const formatDate = (value) => {
    if (!value) return "No date";
    try {
      const date = value?.toDate ? value.toDate() : new Date(value);
      return date.toLocaleDateString();
    } catch {
      return "Invalid date";
    }
  };

  const generateDeviceCodeFromCounter = async () => {
    const counterRef = doc(db, "counters", "devices");

    const nextCount = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);

      if (!counterSnap.exists()) {
        transaction.set(counterRef, {
          currentCount: 1,
          prefix: "DEV",
          updatedAt: serverTimestamp(),
        });
        return 1;
      }

      const currentCount = counterSnap.data().currentCount || 0;
      const newCount = currentCount + 1;

      transaction.update(counterRef, {
        currentCount: newCount,
        updatedAt: serverTimestamp(),
      });

      return newCount;
    });

    return `DEV-${String(nextCount).padStart(4, "0")}`;
  };

  const fetchInitialData = async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) {
        showMessage("❌ Therapist account not found.");
        setLoading(false);
        return;
      }

      const therapistRef = doc(db, "therapists", user.uid);
      const therapistSnap = await getDoc(therapistRef);

      const therapist = therapistSnap.exists()
        ? { id: therapistSnap.id, ...therapistSnap.data() }
        : null;

      setTherapistData(therapist);

      if (therapist) {
        setAssignPatientForm((prev) => ({
          ...prev,
          therapistId: therapist.therapistId || "",
          therapistName: therapist.name || "Therapist",
        }));
      }

      const assignedQuery = query(
        collection(db, "children"),
        where("therapistUid", "==", user.uid)
      );
      const assignedSnap = await getDocs(assignedQuery);
      const assignedChildren = assignedSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const sessionsSnap = await getDocs(collection(db, "sessions"));
      const allSessions = sessionsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const assignedData = assignedChildren.map((child) => {
        const childSessions = allSessions.filter(
          (session) => session.childId === child.id
        );

        const validScoreSessions = childSessions.filter(
          (session) =>
            session.overallScore !== undefined &&
            session.overallScore !== null
        );

        const calculatedProgress =
          validScoreSessions.length > 0
            ? Math.round(
                validScoreSessions.reduce(
                  (sum, session) => sum + Number(session.overallScore || 0),
                  0
                ) / validScoreSessions.length
              )
            : Number(child.overallProgress || 0);

        return {
          ...child,
          overallProgress: calculatedProgress,
          totalSessionsCompleted: childSessions.length,
        };
      });

      setAssignedPatients(assignedData);

      const childrenSnap = await getDocs(collection(db, "children"));
      const childrenData = childrenSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setAllChildren(childrenData);

      const levelsSnap = await getDocs(collection(db, "levels"));
      const levelsData = levelsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setLevels(levelsData);

      if (assignedData.length > 0) {
        await handleSelectPatient(assignedData[0], assignedData, false);
      } else {
        setSelectedPatient(null);
        setTherapyPlan(null);
        setReportData(null);
        setPatientTimeline([]);
      }
    } catch (error) {
      console.error("Error fetching patients data:", error);
      showMessage("❌ Failed to load patients.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = async (
    patient,
    sourceAssignedPatients = null,
    openDialog = false
  ) => {
    try {
      const freshPatient =
        sourceAssignedPatients?.find((p) => p.id === patient.id) || patient;

      setSelectedPatient(freshPatient);
      setSelectedTab("overview");

      const planSnap = await getDoc(doc(db, "therapyPlans", freshPatient.id));
      const planData = planSnap.exists() ? planSnap.data() : null;
      setTherapyPlan(planData);

      const reportSnap = await getDoc(
        doc(db, "children", freshPatient.id, "report", "main")
      );
      const reportDocData = reportSnap.exists() ? reportSnap.data() : null;

      const sessionsSnap = await getDocs(
        query(collection(db, "sessions"), where("childId", "==", freshPatient.id))
      );

      const childSessions = sessionsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const validScoreSessions = childSessions.filter(
        (session) =>
          session.overallScore !== undefined &&
          session.overallScore !== null
      );

      const calculatedProgress =
        validScoreSessions.length > 0
          ? Math.round(
              validScoreSessions.reduce(
                (sum, session) => sum + Number(session.overallScore || 0),
                0
              ) / validScoreSessions.length
            )
          : Number(reportDocData?.overallProgress || 0);

      const calculatedCompletedItems = childSessions.reduce(
        (sum, session) => sum + Number(session.attemptedItems || 0),
        0
      );

      const calculatedTotalItems = childSessions.reduce(
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

      setReportData({
        ...reportDocData,
        overallProgress: calculatedProgress,
        totalSessionsCompleted: childSessions.length,
        totalCompletedItems:
          calculatedCompletedItems > 0
            ? calculatedCompletedItems
            : Number(reportDocData?.totalCompletedItems || 0),
        totalItems:
          calculatedTotalItems > 0
            ? calculatedTotalItems
            : Number(reportDocData?.totalItems || 0),
      });

      const timelineQuery = query(
        collection(db, "children", freshPatient.id, "timeline"),
        orderBy("createdAt", "desc"),
        limit(6)
      );
      const timelineSnap = await getDocs(timelineQuery);
      const timelineData = timelineSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setPatientTimeline(timelineData);

      setDeviceForm({
        deviceName: freshPatient.deviceName || "Pineda Companion Device",
        maxSessionsPerDay: planData ? Number(planData.maxSessionsPerDay || 3) : 3,
        sessionDurationMinutes: planData
          ? Number(planData.sessionDurationMinutes || 20)
          : 20,
        minimumGapBetweenSessionsMinutes: planData
          ? Number(planData.minimumGapBetweenSessionsMinutes || 30)
          : 30,
        lockTherapyAfterLimit: planData
          ? !!planData.lockTherapyAfterLimit
          : true,
        therapyStartTime: planData?.therapyStartTime || "",
        therapyEndTime: planData?.therapyEndTime || "",
        fallbackMode: planData?.fallbackMode || "companion",
      });

      setLevelEditForm({
        levelId: freshPatient.assignedLevelId || "",
        levelName: freshPatient.assignedLevelName || "",
      });

      setDeviceEditForm({
        deviceName: freshPatient.deviceName || "Pineda Companion Device",
        deviceStatus: freshPatient.deviceStatus || "Assigned",
      });

      setPlanEditForm({
        maxSessionsPerDay: planData ? Number(planData.maxSessionsPerDay || 3) : 3,
        sessionDurationMinutes: planData
          ? Number(planData.sessionDurationMinutes || 20)
          : 20,
        minimumGapBetweenSessionsMinutes: planData
          ? Number(planData.minimumGapBetweenSessionsMinutes || 30)
          : 30,
        lockTherapyAfterLimit: planData
          ? !!planData.lockTherapyAfterLimit
          : true,
        therapyStartTime: planData?.therapyStartTime || "",
        therapyEndTime: planData?.therapyEndTime || "",
        fallbackMode: planData?.fallbackMode || "companion",
      });

      if (openDialog) setShowPatientDialog(true);
    } catch (error) {
      console.error("Error selecting patient:", error);
      showMessage("❌ Failed to load patient details.");
    }
  };

  const handleAssignPatientFormChange = (e) => {
    const { name, value } = e.target;
    setAssignPatientForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLevelChange = (e) => {
    const levelId = e.target.value;
    const selectedLevel = levels.find((level) => level.id === levelId);

    setAssignPatientForm((prev) => ({
      ...prev,
      levelId,
      levelName:
        selectedLevel?.title ||
        selectedLevel?.levelName ||
        selectedLevel?.name ||
        "",
    }));
  };

  const handleDeviceFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setDeviceForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleLevelEditChange = (e) => {
    const levelId = e.target.value;
    const selectedLevel = levels.find((level) => level.id === levelId);

    setLevelEditForm({
      levelId,
      levelName:
        selectedLevel?.title ||
        selectedLevel?.levelName ||
        selectedLevel?.name ||
        "",
    });
  };

  const handleDeviceEditChange = (e) => {
    const { name, value } = e.target;
    setDeviceEditForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePlanEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPlanEditForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const filteredAssignedPatients = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return assignedPatients;

    return assignedPatients.filter((patient) => {
      const childName = patient.childName?.toLowerCase() || "";
      const childCode = patient.childCode?.toLowerCase() || "";
      const parentId = patient.parentId?.toLowerCase() || "";
      const parentEmail = patient.parentEmail?.toLowerCase() || "";

      return (
        childName.includes(keyword) ||
        childCode.includes(keyword) ||
        parentId.includes(keyword) ||
        parentEmail.includes(keyword)
      );
    });
  }, [assignedPatients, searchText]);

  const availableChildrenToAssign = useMemo(() => {
    return allChildren.filter((child) => !child.therapistUid);
  }, [allChildren]);

  const stats = useMemo(() => {
    const totalAssigned = assignedPatients.length;
    const withDevice = assignedPatients.filter((p) => p.deviceAssigned).length;
    const withLevel = assignedPatients.filter((p) => p.assignedLevelId).length;

    const patientsWithProgress = assignedPatients.filter(
      (p) => Number(p.overallProgress || 0) > 0
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
      totalAssigned,
      withDevice,
      withLevel,
      avgProgress,
    };
  }, [assignedPatients]);

  const handleAssignPatient = async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user || !therapistData) {
      showMessage("❌ Therapist account not found.");
      return;
    }

    if (!assignPatientForm.childId) {
      showMessage("❌ Please select a patient.");
      return;
    }

    if (!assignPatientForm.levelId) {
      showMessage("❌ Please select a level.");
      return;
    }

    try {
      setAssigningPatient(true);

      await updateDoc(doc(db, "children", assignPatientForm.childId), {
        therapistUid: user.uid,
        therapistName: therapistData.name || "Therapist",
        therapistEmail: therapistData.email || user.email || "",
        therapistContact: therapistData.contact || "",
        therapistId: therapistData.therapistId || "",
        therapistImageUrl: therapistData.imageUrl || "",
        assignedLevelId: assignPatientForm.levelId,
        assignedLevelName: assignPatientForm.levelName,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "children", assignPatientForm.childId, "timeline"), {
        title: "Patient assigned by therapist",
        description: `${
          therapistData.name || "Therapist"
        } assigned level ${assignPatientForm.levelName}.`,
        createdAt: serverTimestamp(),
      });

      setAssignPatientForm({
        childId: "",
        therapistId: therapistData.therapistId || "",
        therapistName: therapistData.name || "Therapist",
        levelId: "",
        levelName: "",
      });

      setShowAssignPanel(false);
      showMessage("✅ Patient assigned successfully.");
      await fetchInitialData();
    } catch (error) {
      console.error("Error assigning patient:", error);
      showMessage("❌ Failed to assign patient.");
    } finally {
      setAssigningPatient(false);
    }
  };

  const openAssignDeviceDialog = () => {
    if (!selectedPatient) {
      showMessage("⚠️ Please select a patient first.");
      return;
    }

    if (!selectedPatient.therapistUid) {
      showMessage("⚠️ Assign the patient to a therapist first.");
      return;
    }

    if (!selectedPatient.assignedLevelId) {
      showMessage("⚠️ Assign a level before assigning a device.");
      return;
    }

    setShowDeviceDialog(true);
  };

  const handleAssignDevice = async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user || !therapistData || !selectedPatient) {
      showMessage("❌ Missing therapist or patient details.");
      return;
    }

    if (!deviceForm.deviceName.trim()) {
      showMessage("❌ Please enter device name.");
      return;
    }

    if (Number(deviceForm.maxSessionsPerDay) < 1) {
      showMessage("❌ Max sessions per day must be at least 1.");
      return;
    }

    if (Number(deviceForm.sessionDurationMinutes) < 1) {
      showMessage("❌ Session duration must be at least 1 minute.");
      return;
    }

    if (Number(deviceForm.minimumGapBetweenSessionsMinutes) < 0) {
      showMessage("❌ Minimum gap between sessions is invalid.");
      return;
    }

    try {
      setAssigningDevice(true);

      const generatedDeviceCode = await generateDeviceCodeFromCounter();

      await updateDoc(doc(db, "children", selectedPatient.id), {
        deviceAssigned: true,
        deviceId: generatedDeviceCode,
        deviceCode: generatedDeviceCode,
        deviceName: deviceForm.deviceName.trim(),
        deviceStatus: "Assigned",
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "therapyPlans", selectedPatient.id),
        {
          childId: selectedPatient.id,
          therapistUid: user.uid,
          therapistName: therapistData.name || "Therapist",
          levelId: selectedPatient.assignedLevelId || "",
          levelName: selectedPatient.assignedLevelName || "",
          maxSessionsPerDay: Number(deviceForm.maxSessionsPerDay),
          sessionDurationMinutes: Number(deviceForm.sessionDurationMinutes),
          minimumGapBetweenSessionsMinutes: Number(
            deviceForm.minimumGapBetweenSessionsMinutes
          ),
          lockTherapyAfterLimit: !!deviceForm.lockTherapyAfterLimit,
          therapyStartTime: deviceForm.therapyStartTime || "",
          therapyEndTime: deviceForm.therapyEndTime || "",
          fallbackMode: deviceForm.fallbackMode || "companion",
          modesAllowed: ["therapy", "companion"],
          modeSelectionAtDevice: true,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "devices", generatedDeviceCode),
        {
          deviceId: generatedDeviceCode,
          deviceCode: generatedDeviceCode,
          deviceName: deviceForm.deviceName.trim(),
          deviceStatus: "Assigned",
          childId: selectedPatient.id,
          childName: selectedPatient.childName || "",
          childCode: selectedPatient.childCode || "",
          therapistUid: user.uid,
          therapistName: therapistData.name || "Therapist",
          therapistId: therapistData.therapistId || "",
          parentId: selectedPatient.parentId || "",
          parentEmail: selectedPatient.parentEmail || "",
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          modesAllowed: ["therapy", "companion"],
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", selectedPatient.id, "timeline"), {
        title: "Device assigned",
        description: `Device ${generatedDeviceCode} assigned with therapy rules.`,
        createdAt: serverTimestamp(),
      });

      setShowDeviceDialog(false);
      showMessage(`✅ Device assigned successfully. Device ID: ${generatedDeviceCode}`);
      await fetchInitialData();
    } catch (error) {
      console.error("Error assigning device:", error);
      showMessage("❌ Failed to assign device.");
    } finally {
      setAssigningDevice(false);
    }
  };

  const handleSaveLevelEdit = async (e) => {
    e.preventDefault();

    if (!selectedPatient) return;
    if (!levelEditForm.levelId) {
      showMessage("❌ Please select a level.");
      return;
    }

    try {
      setSavingLevelEdit(true);

      await updateDoc(doc(db, "children", selectedPatient.id), {
        assignedLevelId: levelEditForm.levelId,
        assignedLevelName: levelEditForm.levelName,
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "therapyPlans", selectedPatient.id),
        {
          levelId: levelEditForm.levelId,
          levelName: levelEditForm.levelName,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", selectedPatient.id, "timeline"), {
        title: "Level updated",
        description: `Assigned level changed to ${levelEditForm.levelName}.`,
        createdAt: serverTimestamp(),
      });

      setShowLevelEditDialog(false);
      showMessage("✅ Level assignment updated.");
      await fetchInitialData();
    } catch (error) {
      console.error("Error updating level:", error);
      showMessage("❌ Failed to update level.");
    } finally {
      setSavingLevelEdit(false);
    }
  };

  const handleSaveDeviceEdit = async (e) => {
    e.preventDefault();

    if (!selectedPatient) return;
    if (!selectedPatient.deviceId && !selectedPatient.deviceCode) {
      showMessage("⚠️ No device assigned yet.");
      return;
    }

    if (!deviceEditForm.deviceName.trim()) {
      showMessage("❌ Please enter device name.");
      return;
    }

    try {
      setSavingDeviceEdit(true);

      const deviceDocId = selectedPatient.deviceId || selectedPatient.deviceCode;

      await updateDoc(doc(db, "children", selectedPatient.id), {
        deviceName: deviceEditForm.deviceName.trim(),
        deviceStatus: deviceEditForm.deviceStatus,
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "devices", deviceDocId),
        {
          deviceId: deviceDocId,
          deviceCode: deviceDocId,
          deviceName: deviceEditForm.deviceName.trim(),
          deviceStatus: deviceEditForm.deviceStatus,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", selectedPatient.id, "timeline"), {
        title: "Device info updated",
        description: `Device information updated for ${deviceDocId}.`,
        createdAt: serverTimestamp(),
      });

      setShowDeviceEditDialog(false);
      showMessage("✅ Device info updated.");
      await fetchInitialData();
    } catch (error) {
      console.error("Error updating device info:", error);
      showMessage("❌ Failed to update device info.");
    } finally {
      setSavingDeviceEdit(false);
    }
  };

  const handleSavePlanEdit = async (e) => {
    e.preventDefault();

    if (!selectedPatient) return;

    if (Number(planEditForm.maxSessionsPerDay) < 1) {
      showMessage("❌ Max sessions per day must be at least 1.");
      return;
    }

    if (Number(planEditForm.sessionDurationMinutes) < 1) {
      showMessage("❌ Session duration must be at least 1 minute.");
      return;
    }

    if (Number(planEditForm.minimumGapBetweenSessionsMinutes) < 0) {
      showMessage("❌ Minimum gap between sessions is invalid.");
      return;
    }

    try {
      setSavingPlanEdit(true);

      await setDoc(
        doc(db, "therapyPlans", selectedPatient.id),
        {
          childId: selectedPatient.id,
          therapistUid: selectedPatient.therapistUid || "",
          therapistName: selectedPatient.therapistName || "",
          levelId: selectedPatient.assignedLevelId || "",
          levelName: selectedPatient.assignedLevelName || "",
          maxSessionsPerDay: Number(planEditForm.maxSessionsPerDay),
          sessionDurationMinutes: Number(planEditForm.sessionDurationMinutes),
          minimumGapBetweenSessionsMinutes: Number(
            planEditForm.minimumGapBetweenSessionsMinutes
          ),
          lockTherapyAfterLimit: !!planEditForm.lockTherapyAfterLimit,
          therapyStartTime: planEditForm.therapyStartTime || "",
          therapyEndTime: planEditForm.therapyEndTime || "",
          fallbackMode: planEditForm.fallbackMode || "companion",
          modesAllowed: ["therapy", "companion"],
          modeSelectionAtDevice: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", selectedPatient.id, "timeline"), {
        title: "Therapy plan updated",
        description: "Therapy plan values were updated by therapist.",
        createdAt: serverTimestamp(),
      });

      setShowPlanEditDialog(false);
      showMessage("✅ Therapy plan updated.");
      await fetchInitialData();
    } catch (error) {
      console.error("Error updating therapy plan:", error);
      showMessage("❌ Failed to update therapy plan.");
    } finally {
      setSavingPlanEdit(false);
    }
  };

  return (
    <div className="therapist-patients-page">
      <TherapistNavbar />

      <div className="therapist-patients-container">
        <section className="patients-hero-card">
          <div className="hero-copy">
            <span className="patients-badge">👩‍⚕️ Patient Management</span>
            <h1>Therapist Patients</h1>
            <p>
              Manage assigned children, review progress, assign levels and devices,
              and update therapy plans from one modern workspace.
            </p>
          </div>

          <div className="patients-hero-actions">
            <button
              className="assign-patient-btn"
              onClick={() => setShowAssignPanel(!showAssignPanel)}
            >
              {showAssignPanel ? "Close Assign Panel" : "+ Assign Patient"}
            </button>
          </div>
        </section>

        <section className="patients-stats-grid">
          <div className="patients-stat-card">
            <div className="patients-stat-icon">👶</div>
            <div>
              <h3>{stats.totalAssigned}</h3>
              <p>Assigned Patients</p>
            </div>
          </div>

          <div className="patients-stat-card">
            <div className="patients-stat-icon">📘</div>
            <div>
              <h3>{stats.withLevel}</h3>
              <p>With Assigned Level</p>
            </div>
          </div>

          <div className="patients-stat-card">
            <div className="patients-stat-icon">🧸</div>
            <div>
              <h3>{stats.withDevice}</h3>
              <p>With Assigned Device</p>
            </div>
          </div>

          <div className="patients-stat-card">
            <div className="patients-stat-icon">📈</div>
            <div>
              <h3>{stats.avgProgress}%</h3>
              <p>Average Progress</p>
            </div>
          </div>
        </section>

        <section className="patients-toolbar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by child name, child code, parent ID, or parent email"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </section>

        {message && <div className="message-box">{message}</div>}

        {showAssignPanel && (
          <section className="assign-panel-card">
            <div className="card-head">
              <h2>Assign Patient</h2>
              <p>Select an unassigned child and assign a level.</p>
            </div>

            <form className="assign-form" onSubmit={handleAssignPatient}>
              <div className="assign-grid">
                <select
                  name="childId"
                  value={assignPatientForm.childId}
                  onChange={handleAssignPatientFormChange}
                >
                  <option value="">Select Patient</option>
                  {availableChildrenToAssign.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.childName} ({child.childCode || "No Code"})
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  name="therapistName"
                  value={assignPatientForm.therapistName}
                  readOnly
                  placeholder="Therapist"
                />

                <select
                  name="levelId"
                  value={assignPatientForm.levelId}
                  onChange={handleLevelChange}
                >
                  <option value="">Select Level</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.title || level.levelName || level.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="save-assign-btn"
                disabled={assigningPatient}
              >
                {assigningPatient ? "Assigning..." : "Assign Patient"}
              </button>
            </form>
          </section>
        )}

        {loading ? (
          <div className="state-card">Loading patients...</div>
        ) : (
          <section className="patients-main-section">
            <div className="patient-list-card">
              <div className="card-head">
                <h2>Patient List</h2>
                <p>All assigned patients are visible here with quick status details.</p>
              </div>

              {filteredAssignedPatients.length === 0 ? (
                <p className="empty-text">No assigned patients found.</p>
              ) : (
                <div className="patient-list-grid">
                  {filteredAssignedPatients.map((patient) => (
                    <div
                      key={patient.id}
                      className={`patient-card ${
                        selectedPatient?.id === patient.id ? "active-patient-card" : ""
                      }`}
                    >
                      <div className="patient-card-top">
                        {patient.childImageUrl ? (
                          <img
                            src={patient.childImageUrl}
                            alt={patient.childName}
                            className="patient-avatar"
                          />
                        ) : (
                          <div className="patient-avatar-placeholder">🧒</div>
                        )}

                        <div className="patient-card-main">
                          <h3>{patient.childName || "Child"}</h3>
                          <p>{patient.childCode || "No Code"}</p>
                        </div>

                        <span className="status-pill">
                          {patient.status || "active"}
                        </span>
                      </div>

                      <div className="patient-mini-grid">
                        <div className="mini-info-box">
                          <span>Parent</span>
                          <strong>{patient.parentName || "N/A"}</strong>
                        </div>

                        <div className="mini-info-box">
                          <span>Level</span>
                          <strong>{patient.assignedLevelName || "Not Assigned"}</strong>
                        </div>

                        <div className="mini-info-box">
                          <span>Device</span>
                          <strong>{patient.deviceAssigned ? "Assigned" : "Not Assigned"}</strong>
                        </div>

                        <div className="mini-info-box">
                          <span>Progress</span>
                          <strong>{patient.overallProgress || 0}%</strong>
                        </div>
                      </div>

                      <div className="patient-card-actions">
                        <button
                          className="ghost-action-btn"
                          onClick={() => handleSelectPatient(patient)}
                          type="button"
                        >
                          Select
                        </button>

                        <button
                          className="primary-action-btn"
                          onClick={() => handleSelectPatient(patient, null, true)}
                          type="button"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="quick-summary-card">
              {!selectedPatient ? (
                <div className="empty-summary">
                  <h3>No Patient Selected</h3>
                  <p>Select a patient from the list to see quick actions and details.</p>
                </div>
              ) : (
                <>
                  <div className="quick-summary-head">
                    <h2>Quick Summary</h2>
                    <p>
                      Fast access to device, level, and therapy plan actions for{" "}
                      {selectedPatient.childName || "this child"}.
                    </p>
                  </div>

                  <div className="summary-highlight-card">
                    <div className="summary-highlight-top">
                      {selectedPatient.childImageUrl ? (
                        <img
                          src={selectedPatient.childImageUrl}
                          alt={selectedPatient.childName}
                          className="summary-avatar"
                        />
                      ) : (
                        <div className="summary-avatar-placeholder">🧒</div>
                      )}

                      <div>
                        <h3>{selectedPatient.childName || "Child"}</h3>
                        <p>{selectedPatient.childCode || "No Code"}</p>
                      </div>
                    </div>

                    <div className="progress-block">
                      <div className="progress-label-row">
                        <span>Overall Progress</span>
                        <strong>{reportData?.overallProgress ?? 0}%</strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${reportData?.overallProgress ?? 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="summary-grid">
                      <div className="summary-item">
                        <span>Assigned Level</span>
                        <strong>{selectedPatient.assignedLevelName || "N/A"}</strong>
                      </div>
                      <div className="summary-item">
                        <span>Device</span>
                        <strong>{selectedPatient.deviceName || "Not Assigned"}</strong>
                      </div>
                      <div className="summary-item">
                        <span>Sessions</span>
                        <strong>{reportData?.totalSessionsCompleted ?? 0}</strong>
                      </div>
                      <div className="summary-item">
                        <span>Parent</span>
                        <strong>{selectedPatient.parentName || "N/A"}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="quick-action-grid">
                    <button
                      type="button"
                      className="quick-action-btn"
                      onClick={() => setShowLevelEditDialog(true)}
                    >
                      Edit Level
                    </button>

                    <button
                      type="button"
                      className="quick-action-btn"
                      onClick={openAssignDeviceDialog}
                    >
                      Assign Device
                    </button>

                    <button
                      type="button"
                      className="quick-action-btn"
                      onClick={() => setShowDeviceEditDialog(true)}
                    >
                      Edit Device
                    </button>

                    <button
                      type="button"
                      className="quick-action-btn"
                      onClick={() => setShowPlanEditDialog(true)}
                    >
                      Edit Therapy Plan
                    </button>

                    <button
                      type="button"
                      className="quick-action-btn wide-action-btn"
                      onClick={() => setShowPatientDialog(true)}
                    >
                      Open Full Patient Details
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {showPatientDialog && selectedPatient && (
          <div className="modal-overlay" onClick={() => setShowPatientDialog(false)}>
            <div className="patient-details-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Patient Full Details</h2>
                <button
                  type="button"
                  className="close-modal-btn"
                  onClick={() => setShowPatientDialog(false)}
                >
                  ✕
                </button>
              </div>

              <div className="patient-dialog-top">
                {selectedPatient.childImageUrl ? (
                  <img
                    src={selectedPatient.childImageUrl}
                    alt={selectedPatient.childName}
                    className="dialog-avatar"
                  />
                ) : (
                  <div className="dialog-avatar-placeholder">🧒</div>
                )}

                <div className="dialog-title-block">
                  <h3>{selectedPatient.childName || "Child"}</h3>
                  <p>{selectedPatient.childCode || "No Code"}</p>
                  <span className="dialog-status-badge">
                    {selectedPatient.status || "active"}
                  </span>
                </div>
              </div>

              <div className="dialog-tabs">
                <button
                  type="button"
                  className={selectedTab === "overview" ? "active-dialog-tab" : ""}
                  onClick={() => setSelectedTab("overview")}
                >
                  Overview
                </button>

                <button
                  type="button"
                  className={selectedTab === "assignment" ? "active-dialog-tab" : ""}
                  onClick={() => setSelectedTab("assignment")}
                >
                  Assignment
                </button>

                <button
                  type="button"
                  className={selectedTab === "timeline" ? "active-dialog-tab" : ""}
                  onClick={() => setSelectedTab("timeline")}
                >
                  Timeline
                </button>
              </div>

              {selectedTab === "overview" && (
                <div className="dialog-content-grid">
                  <div className="dialog-info-card">
                    <h4>Child Information</h4>
                    <p><strong>Name:</strong> {selectedPatient.childName || "N/A"}</p>
                    <p><strong>Code:</strong> {selectedPatient.childCode || "N/A"}</p>
                    <p><strong>Age:</strong> {selectedPatient.age || "N/A"}</p>
                    <p><strong>Gender:</strong> {selectedPatient.gender || "N/A"}</p>
                    <p><strong>Status:</strong> {selectedPatient.status || "active"}</p>
                  </div>

                  <div className="dialog-info-card">
                    <h4>Parent Information</h4>
                    <p><strong>Name:</strong> {selectedPatient.parentName || "N/A"}</p>
                    <p><strong>Parent ID:</strong> {selectedPatient.parentId || "N/A"}</p>
                    <p><strong>Email:</strong> {selectedPatient.parentEmail || "N/A"}</p>
                    <p><strong>Contact:</strong> {selectedPatient.parentContact || "N/A"}</p>
                  </div>

                  <div className="dialog-info-card dialog-wide-card">
                    <h4>Progress Summary</h4>
                    <div className="progress-label-row">
                      <span>Current Progress</span>
                      <strong>{reportData?.overallProgress ?? 0}%</strong>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${reportData?.overallProgress ?? 0}%` }}
                      ></div>
                    </div>
                    <p><strong>Completed Sessions:</strong> {reportData?.totalSessionsCompleted ?? 0}</p>
                    <p><strong>Completed Items:</strong> {reportData?.totalCompletedItems ?? 0}</p>
                    <p><strong>Total Items:</strong> {reportData?.totalItems ?? 0}</p>
                  </div>
                </div>
              )}

              {selectedTab === "assignment" && (
                <div className="dialog-content-grid">
                  <div className="dialog-info-card">
                    <div className="dialog-card-head">
                      <h4>Level Assignment</h4>
                      <button
                        className="mini-edit-btn"
                        type="button"
                        onClick={() => setShowLevelEditDialog(true)}
                      >
                        Edit
                      </button>
                    </div>
                    <p><strong>Assigned Level:</strong> {selectedPatient.assignedLevelName || "N/A"}</p>
                    <p><strong>Strongest Area:</strong> {reportData?.strongestArea || "N/A"}</p>
                    <p><strong>Support Area:</strong> {reportData?.supportArea || "N/A"}</p>
                  </div>

                  <div className="dialog-info-card">
                    <div className="dialog-card-head">
                      <h4>Device Information</h4>
                      <button
                        className="mini-edit-btn"
                        type="button"
                        onClick={() => setShowDeviceEditDialog(true)}
                      >
                        Edit
                      </button>
                    </div>
                    <p><strong>Assigned:</strong> {selectedPatient.deviceAssigned ? "Yes" : "No"}</p>
                    <p><strong>Device ID:</strong> {selectedPatient.deviceId || "N/A"}</p>
                    <p><strong>Device Code:</strong> {selectedPatient.deviceCode || "N/A"}</p>
                    <p><strong>Device Name:</strong> {selectedPatient.deviceName || "N/A"}</p>
                    <p><strong>Status:</strong> {selectedPatient.deviceStatus || "N/A"}</p>
                  </div>

                  <div className="dialog-info-card dialog-wide-card">
                    <div className="dialog-card-head">
                      <h4>Therapy Plan & Recommendations</h4>
                      <button
                        className="mini-edit-btn"
                        type="button"
                        onClick={() => setShowPlanEditDialog(true)}
                      >
                        Edit
                      </button>
                    </div>
                    <p><strong>Max Sessions / Day:</strong> {therapyPlan?.maxSessionsPerDay ?? "N/A"}</p>
                    <p><strong>Session Duration:</strong> {therapyPlan?.sessionDurationMinutes ?? "N/A"} mins</p>
                    <p><strong>Minimum Gap:</strong> {therapyPlan?.minimumGapBetweenSessionsMinutes ?? "N/A"} mins</p>
                    <p><strong>Therapy Time:</strong> {therapyPlan?.therapyStartTime || "N/A"} - {therapyPlan?.therapyEndTime || "N/A"}</p>
                    <p><strong>Fallback Mode:</strong> {therapyPlan?.fallbackMode || "companion"}</p>
                    <p><strong>Summary:</strong> {reportData?.therapistSummary || "No summary yet"}</p>
                    <p><strong>Recommendation:</strong> {reportData?.overallRecommendation || "No recommendation yet"}</p>
                    <p><strong>Home Advice:</strong> {reportData?.homeAdvice || "No advice yet"}</p>
                  </div>
                </div>
              )}

              {selectedTab === "timeline" && (
                <div className="timeline-card">
                  <h3>Recent Timeline</h3>

                  {patientTimeline.length === 0 ? (
                    <p className="empty-text">No updates found yet.</p>
                  ) : (
                    <div className="timeline-list">
                      {patientTimeline.map((item) => (
                        <div className="timeline-item" key={item.id}>
                          <div className="timeline-dot"></div>
                          <div className="timeline-content">
                            <h4>{item.title || "Update"}</h4>
                            <p>{item.description || "No description available."}</p>
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showDeviceDialog && (
          <div className="modal-overlay" onClick={() => setShowDeviceDialog(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Assign Device</h2>
                <button
                  type="button"
                  className="close-modal-btn"
                  onClick={() => setShowDeviceDialog(false)}
                >
                  ✕
                </button>
              </div>

              <p className="modal-subtext">
                Device ID will be auto-generated. Therapy and companion modes will
                be available.
              </p>

              <form className="assign-form" onSubmit={handleAssignDevice}>
                <div className="assign-grid">
                  <input
                    type="text"
                    name="deviceName"
                    placeholder="Device Name"
                    value={deviceForm.deviceName}
                    onChange={handleDeviceFormChange}
                  />

                  <input
                    type="number"
                    name="maxSessionsPerDay"
                    placeholder="Max Sessions Per Day"
                    value={deviceForm.maxSessionsPerDay}
                    onChange={handleDeviceFormChange}
                    min="1"
                  />

                  <input
                    type="number"
                    name="sessionDurationMinutes"
                    placeholder="Session Duration Minutes"
                    value={deviceForm.sessionDurationMinutes}
                    onChange={handleDeviceFormChange}
                    min="1"
                  />

                  <input
                    type="number"
                    name="minimumGapBetweenSessionsMinutes"
                    placeholder="Minimum Gap Between Sessions"
                    value={deviceForm.minimumGapBetweenSessionsMinutes}
                    onChange={handleDeviceFormChange}
                    min="0"
                  />

                  <input
                    type="time"
                    name="therapyStartTime"
                    value={deviceForm.therapyStartTime}
                    onChange={handleDeviceFormChange}
                  />

                  <input
                    type="time"
                    name="therapyEndTime"
                    value={deviceForm.therapyEndTime}
                    onChange={handleDeviceFormChange}
                  />

                  <select
                    name="fallbackMode"
                    value={deviceForm.fallbackMode}
                    onChange={handleDeviceFormChange}
                  >
                    <option value="companion">Fallback: Companion Mode</option>
                    <option value="therapy">Fallback: Therapy Mode</option>
                  </select>

                  <div className="readonly-info-box">
                    Device ID: Auto-generated on assign
                  </div>
                </div>

                <div className="assign-checks">
                  <label>
                    <input
                      type="checkbox"
                      name="lockTherapyAfterLimit"
                      checked={deviceForm.lockTherapyAfterLimit}
                      onChange={handleDeviceFormChange}
                    />{" "}
                    Lock Therapy After Daily Limit
                  </label>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setShowDeviceDialog(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="save-assign-btn"
                    disabled={assigningDevice}
                  >
                    {assigningDevice ? "Assigning Device..." : "Assign Device"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showLevelEditDialog && (
          <div className="modal-overlay" onClick={() => setShowLevelEditDialog(false)}>
            <div className="modal-card small-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Level Assignment</h2>
                <button
                  type="button"
                  className="close-modal-btn"
                  onClick={() => setShowLevelEditDialog(false)}
                >
                  ✕
                </button>
              </div>

              <form className="assign-form" onSubmit={handleSaveLevelEdit}>
                <select value={levelEditForm.levelId} onChange={handleLevelEditChange}>
                  <option value="">Select Level</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.title || level.levelName || level.name}
                    </option>
                  ))}
                </select>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setShowLevelEditDialog(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="save-assign-btn"
                    disabled={savingLevelEdit}
                  >
                    {savingLevelEdit ? "Saving..." : "Save Level"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showDeviceEditDialog && (
          <div className="modal-overlay" onClick={() => setShowDeviceEditDialog(false)}>
            <div className="modal-card small-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Device Info</h2>
                <button
                  type="button"
                  className="close-modal-btn"
                  onClick={() => setShowDeviceEditDialog(false)}
                >
                  ✕
                </button>
              </div>

              <form className="assign-form" onSubmit={handleSaveDeviceEdit}>
                <input
                  type="text"
                  name="deviceName"
                  placeholder="Device Name"
                  value={deviceEditForm.deviceName}
                  onChange={handleDeviceEditChange}
                />

                <select
                  name="deviceStatus"
                  value={deviceEditForm.deviceStatus}
                  onChange={handleDeviceEditChange}
                >
                  <option value="Assigned">Assigned</option>
                  <option value="Active">Active</option>
                  <option value="Ready">Ready</option>
                  <option value="Paused">Paused</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Disabled">Disabled</option>
                </select>

                <div className="readonly-info-box">
                  Device ID: {selectedPatient?.deviceId || selectedPatient?.deviceCode || "N/A"}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setShowDeviceEditDialog(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="save-assign-btn"
                    disabled={savingDeviceEdit}
                  >
                    {savingDeviceEdit ? "Saving..." : "Save Device Info"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showPlanEditDialog && (
          <div className="modal-overlay" onClick={() => setShowPlanEditDialog(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Therapy Plan</h2>
                <button
                  type="button"
                  className="close-modal-btn"
                  onClick={() => setShowPlanEditDialog(false)}
                >
                  ✕
                </button>
              </div>

              <form className="assign-form" onSubmit={handleSavePlanEdit}>
                <div className="assign-grid">
                  <input
                    type="number"
                    name="maxSessionsPerDay"
                    placeholder="Max Sessions Per Day"
                    value={planEditForm.maxSessionsPerDay}
                    onChange={handlePlanEditChange}
                    min="1"
                  />

                  <input
                    type="number"
                    name="sessionDurationMinutes"
                    placeholder="Session Duration Minutes"
                    value={planEditForm.sessionDurationMinutes}
                    onChange={handlePlanEditChange}
                    min="1"
                  />

                  <input
                    type="number"
                    name="minimumGapBetweenSessionsMinutes"
                    placeholder="Minimum Gap Between Sessions"
                    value={planEditForm.minimumGapBetweenSessionsMinutes}
                    onChange={handlePlanEditChange}
                    min="0"
                  />

                  <input
                    type="time"
                    name="therapyStartTime"
                    value={planEditForm.therapyStartTime}
                    onChange={handlePlanEditChange}
                  />

                  <input
                    type="time"
                    name="therapyEndTime"
                    value={planEditForm.therapyEndTime}
                    onChange={handlePlanEditChange}
                  />

                  <select
                    name="fallbackMode"
                    value={planEditForm.fallbackMode}
                    onChange={handlePlanEditChange}
                  >
                    <option value="companion">Fallback: Companion Mode</option>
                    <option value="therapy">Fallback: Therapy Mode</option>
                  </select>

                  <div className="readonly-info-box">
                    Modes Allowed: Therapy + Companion
                  </div>
                </div>

                <div className="assign-checks">
                  <label>
                    <input
                      type="checkbox"
                      name="lockTherapyAfterLimit"
                      checked={planEditForm.lockTherapyAfterLimit}
                      onChange={handlePlanEditChange}
                    />{" "}
                    Lock Therapy After Daily Limit
                  </label>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setShowPlanEditDialog(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="save-assign-btn"
                    disabled={savingPlanEdit}
                  >
                    {savingPlanEdit ? "Saving..." : "Save Therapy Plan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TherapistPatients;