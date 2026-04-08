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

const DIAGNOSIS_OPTIONS = [
  { value: "general", label: "General" },
  { value: "autism", label: "Autism" },
  { value: "down_syndrome", label: "Down Syndrome" },
];

const getDiagnosisLabel = (value) =>
  DIAGNOSIS_OPTIONS.find((item) => item.value === value)?.label || "Not set";

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
  const [showAssignPanel, setShowAssignPanel] = useState(false);

  const [assigningPatient, setAssigningPatient] = useState(false);
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);
  const [savingLevel, setSavingLevel] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);

  const [assignPatientForm, setAssignPatientForm] = useState({
    childId: "",
    therapistId: "",
    therapistName: "",
    diagnosisCategory: "",
    diagnosisNotes: "",
    levelId: "",
    levelName: "",
  });

  const [diagnosisForm, setDiagnosisForm] = useState({
    diagnosisCategory: "",
    diagnosisNotes: "",
  });

  const [levelForm, setLevelForm] = useState({
    levelId: "",
    levelName: "",
  });

  const [deviceForm, setDeviceForm] = useState({
    deviceName: "Pineda Therapy Device",
    deviceStatus: "Assigned",
  });

  const [planForm, setPlanForm] = useState({
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
        showMessage("Therapist account not found.");
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
        diagnosisCategory: d.data().diagnosisCategory || "",
        diagnosisNotes: d.data().diagnosisNotes || "",
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
        diagnosisCategory: d.data().diagnosisCategory || "",
        diagnosisNotes: d.data().diagnosisNotes || "",
      }));
      setAllChildren(childrenData);

      const levelsSnap = await getDocs(collection(db, "levels"));
      const levelsData = levelsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setLevels(levelsData);

      if (assignedData.length > 0) {
        await handleSelectPatient(assignedData[0], assignedData);
      } else {
        setSelectedPatient(null);
        setTherapyPlan(null);
        setReportData(null);
        setPatientTimeline([]);
      }
    } catch (error) {
      console.error("Error fetching patients data:", error);
      showMessage("Failed to load patients.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = async (patient, sourceAssignedPatients = null) => {
    try {
      const freshPatient =
        sourceAssignedPatients?.find((p) => p.id === patient.id) || patient;

      setSelectedPatient(freshPatient);

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

      setDiagnosisForm({
        diagnosisCategory: freshPatient.diagnosisCategory || "",
        diagnosisNotes: freshPatient.diagnosisNotes || "",
      });

      setLevelForm({
        levelId: freshPatient.assignedLevelId || "",
        levelName: freshPatient.assignedLevelName || "",
      });

      setDeviceForm({
        deviceName: freshPatient.deviceName || "Pineda Therapy Device",
        deviceStatus: freshPatient.deviceStatus || "Assigned",
      });

      setPlanForm({
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
    } catch (error) {
      console.error("Error selecting patient:", error);
      showMessage("Failed to load patient details.");
    }
  };

  const filteredAssignedPatients = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return assignedPatients;

    return assignedPatients.filter((patient) => {
      const childName = patient.childName?.toLowerCase() || "";
      const childCode = patient.childCode?.toLowerCase() || "";
      const parentEmail = patient.parentEmail?.toLowerCase() || "";
      const diagnosis = getDiagnosisLabel(
        patient.diagnosisCategory || ""
      ).toLowerCase();

      return (
        childName.includes(keyword) ||
        childCode.includes(keyword) ||
        parentEmail.includes(keyword) ||
        diagnosis.includes(keyword)
      );
    });
  }, [assignedPatients, searchText]);

  const availableChildrenToAssign = useMemo(() => {
    return allChildren.filter((child) => !child.therapistUid);
  }, [allChildren]);

  const assignSelectedChild = useMemo(() => {
    return allChildren.find((child) => child.id === assignPatientForm.childId) || null;
  }, [allChildren, assignPatientForm.childId]);

  const assignableLevelsForSelectedChild = useMemo(() => {
    if (!assignPatientForm.diagnosisCategory) return [];

    return levels
      .filter(
        (level) => (level.category || "") === assignPatientForm.diagnosisCategory
      )
      .sort((a, b) => Number(a.stage || 0) - Number(b.stage || 0));
  }, [levels, assignPatientForm.diagnosisCategory]);

  const relatedLevels = useMemo(() => {
    if (!diagnosisForm.diagnosisCategory) return [];
    return levels
      .filter((level) => (level.category || "") === diagnosisForm.diagnosisCategory)
      .sort((a, b) => Number(a.stage || 0) - Number(b.stage || 0));
  }, [levels, diagnosisForm.diagnosisCategory]);

  const stats = useMemo(() => {
    const totalAssigned = assignedPatients.length;
    const withDevice = assignedPatients.filter((p) => p.deviceAssigned).length;
    const withLevel = assignedPatients.filter((p) => p.assignedLevelId).length;
    const withDiagnosis = assignedPatients.filter((p) => p.diagnosisCategory).length;

    return {
      totalAssigned,
      withDevice,
      withLevel,
      withDiagnosis,
    };
  }, [assignedPatients]);

  const handleAssignPatientFormChange = (e) => {
    const { name, value } = e.target;

    setAssignPatientForm((prev) => {
      const updated = { ...prev, [name]: value };

      if (name === "childId") {
        const selectedChild = allChildren.find((child) => child.id === value);

        updated.diagnosisCategory = selectedChild?.diagnosisCategory || "";
        updated.diagnosisNotes = selectedChild?.diagnosisNotes || "";
        updated.levelId = "";
        updated.levelName = "";
      }

      if (name === "diagnosisCategory") {
        updated.levelId = "";
        updated.levelName = "";
      }

      return updated;
    });
  };

  const handleAssignLevelChange = (e) => {
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

  const handleAssignPatient = async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user || !therapistData) {
      showMessage("Therapist account not found.");
      return;
    }

    if (!assignPatientForm.childId) {
      showMessage("Please select a patient.");
      return;
    }

    if (!assignPatientForm.diagnosisCategory) {
      showMessage("Please select a diagnosis.");
      return;
    }

    if (!assignPatientForm.levelId) {
      showMessage("Please select a level.");
      return;
    }

    const selectedLevel = levels.find((level) => level.id === assignPatientForm.levelId);

    if ((selectedLevel?.category || "") !== assignPatientForm.diagnosisCategory) {
      showMessage("Selected level does not match diagnosis category.");
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
        diagnosisCategory: assignPatientForm.diagnosisCategory,
        diagnosisNotes: assignPatientForm.diagnosisNotes.trim(),
        assignedLevelId: assignPatientForm.levelId,
        assignedLevelName: assignPatientForm.levelName,
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "therapyPlans", assignPatientForm.childId),
        {
          childId: assignPatientForm.childId,
          therapistUid: user.uid,
          therapistName: therapistData.name || "Therapist",
          diagnosisCategory: assignPatientForm.diagnosisCategory,
          levelId: assignPatientForm.levelId,
          levelName: assignPatientForm.levelName,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", assignPatientForm.childId, "timeline"), {
        title: "Patient assigned",
        description: `${therapistData.name || "Therapist"} assigned patient with diagnosis ${getDiagnosisLabel(
          assignPatientForm.diagnosisCategory
        )} and level ${assignPatientForm.levelName}.`,
        createdAt: serverTimestamp(),
      });

      setAssignPatientForm({
        childId: "",
        therapistId: therapistData.therapistId || "",
        therapistName: therapistData.name || "Therapist",
        diagnosisCategory: "",
        diagnosisNotes: "",
        levelId: "",
        levelName: "",
      });

      setShowAssignPanel(false);
      showMessage("Patient assigned successfully.");
      await fetchInitialData();
    } catch (error) {
      console.error("Error assigning patient:", error);
      showMessage("Failed to assign patient.");
    } finally {
      setAssigningPatient(false);
    }
  };

  const handleDiagnosisChange = (e) => {
    const { name, value } = e.target;
    setDiagnosisForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveDiagnosis = async (e) => {
    e.preventDefault();

    if (!selectedPatient) return;

    if (!diagnosisForm.diagnosisCategory) {
      showMessage("Please select a diagnosis.");
      return;
    }

    try {
      setSavingDiagnosis(true);

      const currentAssignedLevelId = selectedPatient.assignedLevelId || "";
      const currentLevel = levels.find((l) => l.id === currentAssignedLevelId);

      const updatePayload = {
        diagnosisCategory: diagnosisForm.diagnosisCategory,
        diagnosisNotes: diagnosisForm.diagnosisNotes.trim(),
        updatedAt: serverTimestamp(),
      };

      if (
        currentLevel &&
        currentLevel.category !== diagnosisForm.diagnosisCategory
      ) {
        updatePayload.assignedLevelId = "";
        updatePayload.assignedLevelName = "";
        setLevelForm({
          levelId: "",
          levelName: "",
        });
      }

      await updateDoc(doc(db, "children", selectedPatient.id), updatePayload);

      await setDoc(
        doc(db, "therapyPlans", selectedPatient.id),
        {
          diagnosisCategory: diagnosisForm.diagnosisCategory,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", selectedPatient.id, "timeline"), {
        title: "Diagnosis updated",
        description: `Diagnosis updated to ${getDiagnosisLabel(
          diagnosisForm.diagnosisCategory
        )}.`,
        createdAt: serverTimestamp(),
      });

      showMessage("Diagnosis saved successfully.");
      await fetchInitialData();
    } catch (error) {
      console.error("Error updating diagnosis:", error);
      showMessage("Failed to update diagnosis.");
    } finally {
      setSavingDiagnosis(false);
    }
  };

  const handleLevelFormChange = (e) => {
    const levelId = e.target.value;
    const selectedLevel = levels.find((level) => level.id === levelId);

    setLevelForm({
      levelId,
      levelName:
        selectedLevel?.title ||
        selectedLevel?.levelName ||
        selectedLevel?.name ||
        "",
    });
  };

  const handleSaveLevel = async (e) => {
    e.preventDefault();

    if (!selectedPatient) return;

    if (!diagnosisForm.diagnosisCategory) {
      showMessage("Add diagnosis first.");
      return;
    }

    if (!levelForm.levelId) {
      showMessage("Please select a level.");
      return;
    }

    const selectedLevel = levels.find((level) => level.id === levelForm.levelId);
    if ((selectedLevel?.category || "") !== diagnosisForm.diagnosisCategory) {
      showMessage("Selected level does not match diagnosis category.");
      return;
    }

    try {
      setSavingLevel(true);

      await updateDoc(doc(db, "children", selectedPatient.id), {
        assignedLevelId: levelForm.levelId,
        assignedLevelName: levelForm.levelName,
        diagnosisCategory: diagnosisForm.diagnosisCategory,
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "therapyPlans", selectedPatient.id),
        {
          childId: selectedPatient.id,
          therapistUid: selectedPatient.therapistUid || "",
          therapistName: selectedPatient.therapistName || "",
          levelId: levelForm.levelId,
          levelName: levelForm.levelName,
          diagnosisCategory: diagnosisForm.diagnosisCategory,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", selectedPatient.id, "timeline"), {
        title: "Level updated",
        description: `Level changed to ${levelForm.levelName}.`,
        createdAt: serverTimestamp(),
      });

      showMessage("Level saved successfully.");
      await fetchInitialData();
    } catch (error) {
      console.error("Error updating level:", error);
      showMessage("Failed to update level.");
    } finally {
      setSavingLevel(false);
    }
  };

  const handleDeviceFormChange = (e) => {
    const { name, value } = e.target;
    setDeviceForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveDevice = async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!selectedPatient || !therapistData || !user) return;

    if (!selectedPatient.assignedLevelId && !levelForm.levelId) {
      showMessage("Assign level first.");
      return;
    }

    if (!deviceForm.deviceName.trim()) {
      showMessage("Please enter a device name.");
      return;
    }

    try {
      setSavingDevice(true);

      const existingDeviceId =
        selectedPatient.deviceId || selectedPatient.deviceCode || "";
      const deviceDocId = existingDeviceId || (await generateDeviceCodeFromCounter());

      await updateDoc(doc(db, "children", selectedPatient.id), {
        deviceAssigned: true,
        deviceId: deviceDocId,
        deviceCode: deviceDocId,
        deviceName: deviceForm.deviceName.trim(),
        deviceStatus: deviceForm.deviceStatus,
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "devices", deviceDocId),
        {
          deviceId: deviceDocId,
          deviceCode: deviceDocId,
          deviceName: deviceForm.deviceName.trim(),
          deviceStatus: deviceForm.deviceStatus,
          childId: selectedPatient.id,
          childName: selectedPatient.childName || "",
          childCode: selectedPatient.childCode || "",
          diagnosisCategory:
            diagnosisForm.diagnosisCategory || selectedPatient.diagnosisCategory || "",
          therapistUid: user.uid,
          therapistName: therapistData.name || "Therapist",
          therapistId: therapistData.therapistId || "",
          parentId: selectedPatient.parentId || "",
          parentEmail: selectedPatient.parentEmail || "",
          updatedAt: serverTimestamp(),
          assignedAt: serverTimestamp(),
          modesAllowed: ["therapy", "companion"],
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", selectedPatient.id, "timeline"), {
        title: existingDeviceId ? "Device updated" : "Device assigned",
        description: `Device ${deviceDocId} is ready for the patient.`,
        createdAt: serverTimestamp(),
      });

      showMessage(`Device saved successfully. ID: ${deviceDocId}`);
      await fetchInitialData();
    } catch (error) {
      console.error("Error saving device:", error);
      showMessage("Failed to save device.");
    } finally {
      setSavingDevice(false);
    }
  };

  const handlePlanFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPlanForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();

    if (!selectedPatient) return;

    if (Number(planForm.maxSessionsPerDay) < 1) {
      showMessage("Max sessions must be at least 1.");
      return;
    }

    if (Number(planForm.sessionDurationMinutes) < 1) {
      showMessage("Session duration must be at least 1 minute.");
      return;
    }

    if (Number(planForm.minimumGapBetweenSessionsMinutes) < 0) {
      showMessage("Minimum gap is invalid.");
      return;
    }

    try {
      setSavingPlan(true);

      await setDoc(
        doc(db, "therapyPlans", selectedPatient.id),
        {
          childId: selectedPatient.id,
          therapistUid: selectedPatient.therapistUid || "",
          therapistName: selectedPatient.therapistName || "",
          levelId: selectedPatient.assignedLevelId || levelForm.levelId || "",
          levelName: selectedPatient.assignedLevelName || levelForm.levelName || "",
          diagnosisCategory:
            diagnosisForm.diagnosisCategory || selectedPatient.diagnosisCategory || "",
          maxSessionsPerDay: Number(planForm.maxSessionsPerDay),
          sessionDurationMinutes: Number(planForm.sessionDurationMinutes),
          minimumGapBetweenSessionsMinutes: Number(
            planForm.minimumGapBetweenSessionsMinutes
          ),
          lockTherapyAfterLimit: !!planForm.lockTherapyAfterLimit,
          therapyStartTime: planForm.therapyStartTime || "",
          therapyEndTime: planForm.therapyEndTime || "",
          fallbackMode: planForm.fallbackMode || "companion",
          modesAllowed: ["therapy", "companion"],
          modeSelectionAtDevice: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "children", selectedPatient.id, "timeline"), {
        title: "Therapy plan updated",
        description: "Therapy plan values were updated.",
        createdAt: serverTimestamp(),
      });

      showMessage("Therapy plan saved successfully.");
      await fetchInitialData();
    } catch (error) {
      console.error("Error saving therapy plan:", error);
      showMessage("Failed to save therapy plan.");
    } finally {
      setSavingPlan(false);
    }
  };

  const diagnosisReady = !!diagnosisForm.diagnosisCategory;
  const levelReady = !!(selectedPatient?.assignedLevelId || levelForm.levelId);
  const deviceReady = !!selectedPatient?.deviceAssigned;

  return (
    <div className="tpv2-page">
      <TherapistNavbar />

      <div className="tpv2-container">
        <section className="tpv2-hero">
          <div className="tpv2-hero-copy">
            <span className="tpv2-badge">Therapist Patient Workspace</span>
            <h1>Therapist Patients</h1>
            <p>
              Add diagnosis, view related levels, assign devices, and manage therapy
              plans in one guided flow.
            </p>
          </div>

          <button
            className="tpv2-primary-btn"
            type="button"
            onClick={() => setShowAssignPanel((prev) => !prev)}
          >
            {showAssignPanel ? "Close Assign Panel" : "Assign New Patient"}
          </button>
        </section>

        <section className="tpv2-stats">
          <div className="tpv2-stat-card">
            <h3>{stats.totalAssigned}</h3>
            <p>Assigned Patients</p>
          </div>
          <div className="tpv2-stat-card">
            <h3>{stats.withDiagnosis}</h3>
            <p>Diagnosis Added</p>
          </div>
          <div className="tpv2-stat-card">
            <h3>{stats.withLevel}</h3>
            <p>Level Assigned</p>
          </div>
          <div className="tpv2-stat-card">
            <h3>{stats.withDevice}</h3>
            <p>Device Ready</p>
          </div>
        </section>

        {message && <div className="tpv2-message">{message}</div>}

        {showAssignPanel && (
          <section className="tpv2-assign-panel">
            <div className="tpv2-section-head">
              <h2>Assign Patient</h2>
              <p>
                Select child, add diagnosis, and assign the correct level in one flow.
              </p>
            </div>

            <form className="tpv2-form" onSubmit={handleAssignPatient}>
              <div className="tpv2-grid two">
                <div className="tpv2-field">
                  <label>Patient</label>
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
                </div>

                <div className="tpv2-field">
                  <label>Therapist</label>
                  <input
                    type="text"
                    name="therapistName"
                    value={assignPatientForm.therapistName}
                    readOnly
                  />
                </div>

                <div className="tpv2-field">
                  <label>Diagnosis</label>
                  <select
                    name="diagnosisCategory"
                    value={assignPatientForm.diagnosisCategory}
                    onChange={handleAssignPatientFormChange}
                    disabled={!assignPatientForm.childId}
                  >
                    <option value="">
                      {!assignPatientForm.childId
                        ? "Select Patient First"
                        : "Select Diagnosis"}
                    </option>
                    {DIAGNOSIS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="tpv2-field">
                  <label>Level</label>
                  <select
                    name="levelId"
                    value={assignPatientForm.levelId}
                    onChange={handleAssignLevelChange}
                    disabled={!assignPatientForm.diagnosisCategory}
                  >
                    <option value="">
                      {!assignPatientForm.diagnosisCategory
                        ? "Select Diagnosis First"
                        : "Select Level"}
                    </option>
                    {assignableLevelsForSelectedChild.map((level) => (
                      <option key={level.id} value={level.id}>
                        Stage {level.stage || 1} - {level.title || level.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="tpv2-field">
                <label>Diagnosis Notes</label>
                <textarea
                  name="diagnosisNotes"
                  value={assignPatientForm.diagnosisNotes}
                  onChange={handleAssignPatientFormChange}
                  placeholder="Add therapist diagnosis notes"
                />
              </div>

              {assignPatientForm.childId && (
                <div className="tpv2-info-chip">
                  Diagnosis Path:{" "}
                  {assignPatientForm.diagnosisCategory
                    ? getDiagnosisLabel(assignPatientForm.diagnosisCategory)
                    : "Not selected yet"}
                </div>
              )}

              <div className="tpv2-actions">
                <button
                  className="tpv2-primary-btn"
                  type="submit"
                  disabled={assigningPatient}
                >
                  {assigningPatient ? "Assigning..." : "Assign Patient"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="tpv2-toolbar">
          <input
            type="text"
            placeholder="Search patient by name, code, email, or diagnosis"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </section>

        {loading ? (
          <div className="tpv2-loading-card">Loading patients...</div>
        ) : (
          <div className="tpv2-main">
            <aside className="tpv2-sidebar">
              <div className="tpv2-section-head">
                <h2>Patient List</h2>
                <p>Select a patient to manage diagnosis and related levels.</p>
              </div>

              <div className="tpv2-patient-list">
                {filteredAssignedPatients.length === 0 ? (
                  <div className="tpv2-empty">No assigned patients found.</div>
                ) : (
                  filteredAssignedPatients.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      className={`tpv2-patient-row ${
                        selectedPatient?.id === patient.id ? "active" : ""
                      }`}
                      onClick={() => handleSelectPatient(patient)}
                    >
                      <div className="tpv2-patient-row-top">
                        <div className="tpv2-patient-avatar">
                          {patient.childImageUrl ? (
                            <img src={patient.childImageUrl} alt={patient.childName} />
                          ) : (
                            <span>🧒</span>
                          )}
                        </div>

                        <div className="tpv2-patient-meta">
                          <h4>{patient.childName || "Child"}</h4>
                          <p>{patient.childCode || "No Code"}</p>
                        </div>
                      </div>

                      <div className="tpv2-patient-tags">
                        <span>{getDiagnosisLabel(patient.diagnosisCategory || "")}</span>
                        <span>{patient.assignedLevelName || "No Level"}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <main className="tpv2-workflow">
              {!selectedPatient ? (
                <div className="tpv2-empty big">
                  Select a patient from the left panel.
                </div>
              ) : (
                <>
                  <section className="tpv2-workflow-head">
                    <div>
                      <h2>{selectedPatient.childName || "Child"}</h2>
                      <p>
                        {selectedPatient.childCode || "No Code"} •{" "}
                        {selectedPatient.parentName || "Parent not set"}
                      </p>
                    </div>

                    <div className="tpv2-progress-chip">
                      Progress {reportData?.overallProgress ?? 0}%
                    </div>
                  </section>

                  <section className="tpv2-step-card">
                    <div className="tpv2-step-title">
                      <div className="tpv2-step-number">1</div>
                      <div>
                        <h3>Diagnosis</h3>
                        <p>Select diagnosis first to unlock the related level path.</p>
                      </div>
                    </div>

                    <form className="tpv2-form" onSubmit={handleSaveDiagnosis}>
                      <div className="tpv2-grid two">
                        <div className="tpv2-field">
                          <label>Diagnosis Category</label>
                          <select
                            name="diagnosisCategory"
                            value={diagnosisForm.diagnosisCategory}
                            onChange={handleDiagnosisChange}
                          >
                            <option value="">Select Diagnosis</option>
                            {DIAGNOSIS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="tpv2-field">
                          <label>Related Level Path</label>
                          <input
                            type="text"
                            readOnly
                            value={
                              diagnosisForm.diagnosisCategory
                                ? `${getDiagnosisLabel(diagnosisForm.diagnosisCategory)} Levels`
                                : "Diagnosis not selected"
                            }
                          />
                        </div>
                      </div>

                      <div className="tpv2-field">
                        <label>Diagnosis Notes</label>
                        <textarea
                          name="diagnosisNotes"
                          value={diagnosisForm.diagnosisNotes}
                          onChange={handleDiagnosisChange}
                          placeholder="Add therapist diagnosis notes"
                        />
                      </div>

                      <div className="tpv2-actions">
                        <button
                          className="tpv2-primary-btn"
                          type="submit"
                          disabled={savingDiagnosis}
                        >
                          {savingDiagnosis ? "Saving..." : "Save Diagnosis"}
                        </button>
                      </div>
                    </form>
                  </section>

                  <section className={`tpv2-step-card ${!diagnosisReady ? "locked" : ""}`}>
                    <div className="tpv2-step-title">
                      <div className="tpv2-step-number">2</div>
                      <div>
                        <h3>Related Levels</h3>
                        <p>Only levels matching the selected diagnosis are shown here.</p>
                      </div>
                    </div>

                    <form className="tpv2-form" onSubmit={handleSaveLevel}>
                      <div className="tpv2-grid two">
                        <div className="tpv2-field">
                          <label>Diagnosis</label>
                          <input
                            type="text"
                            readOnly
                            value={
                              diagnosisForm.diagnosisCategory
                                ? getDiagnosisLabel(diagnosisForm.diagnosisCategory)
                                : "Diagnosis required first"
                            }
                          />
                        </div>

                        <div className="tpv2-field">
                          <label>Select Level</label>
                          <select
                            value={levelForm.levelId}
                            onChange={handleLevelFormChange}
                            disabled={!diagnosisReady}
                          >
                            <option value="">
                              {!diagnosisReady
                                ? "Save Diagnosis First"
                                : "Select Related Level"}
                            </option>

                            {relatedLevels.map((level) => (
                              <option key={level.id} value={level.id}>
                                Stage {level.stage || 1} - {level.title || level.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="tpv2-actions">
                        <button
                          className="tpv2-primary-btn"
                          type="submit"
                          disabled={!diagnosisReady || savingLevel}
                        >
                          {savingLevel ? "Saving..." : "Save Level"}
                        </button>
                      </div>
                    </form>
                  </section>

                  <section className={`tpv2-step-card ${!levelReady ? "locked" : ""}`}>
                    <div className="tpv2-step-title">
                      <div className="tpv2-step-number">3</div>
                      <div>
                        <h3>Device Setup</h3>
                        <p>Assign or update the therapy device after level assignment.</p>
                      </div>
                    </div>

                    <form className="tpv2-form" onSubmit={handleSaveDevice}>
                      <div className="tpv2-grid two">
                        <div className="tpv2-field">
                          <label>Device Name</label>
                          <input
                            type="text"
                            name="deviceName"
                            value={deviceForm.deviceName}
                            onChange={handleDeviceFormChange}
                            disabled={!levelReady}
                          />
                        </div>

                        <div className="tpv2-field">
                          <label>Device Status</label>
                          <select
                            name="deviceStatus"
                            value={deviceForm.deviceStatus}
                            onChange={handleDeviceFormChange}
                            disabled={!levelReady}
                          >
                            <option value="Assigned">Assigned</option>
                            <option value="Active">Active</option>
                            <option value="Ready">Ready</option>
                            <option value="Paused">Paused</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Disabled">Disabled</option>
                          </select>
                        </div>
                      </div>

                      <div className="tpv2-info-chip">
                        Device ID: {selectedPatient.deviceId || selectedPatient.deviceCode || "Will be generated automatically"}
                      </div>

                      <div className="tpv2-actions">
                        <button
                          className="tpv2-primary-btn"
                          type="submit"
                          disabled={!levelReady || savingDevice}
                        >
                          {savingDevice ? "Saving..." : "Save Device"}
                        </button>
                      </div>
                    </form>
                  </section>

                  <section className={`tpv2-step-card ${!deviceReady ? "locked" : ""}`}>
                    <div className="tpv2-step-title">
                      <div className="tpv2-step-number">4</div>
                      <div>
                        <h3>Therapy Plan</h3>
                        <p>Define the daily therapy settings and timing rules.</p>
                      </div>
                    </div>

                    <form className="tpv2-form" onSubmit={handleSavePlan}>
                      <div className="tpv2-grid three">
                        <div className="tpv2-field">
                          <label>Max Sessions / Day</label>
                          <input
                            type="number"
                            name="maxSessionsPerDay"
                            min="1"
                            value={planForm.maxSessionsPerDay}
                            onChange={handlePlanFormChange}
                            disabled={!deviceReady}
                          />
                        </div>

                        <div className="tpv2-field">
                          <label>Session Duration (mins)</label>
                          <input
                            type="number"
                            name="sessionDurationMinutes"
                            min="1"
                            value={planForm.sessionDurationMinutes}
                            onChange={handlePlanFormChange}
                            disabled={!deviceReady}
                          />
                        </div>

                        <div className="tpv2-field">
                          <label>Minimum Gap (mins)</label>
                          <input
                            type="number"
                            name="minimumGapBetweenSessionsMinutes"
                            min="0"
                            value={planForm.minimumGapBetweenSessionsMinutes}
                            onChange={handlePlanFormChange}
                            disabled={!deviceReady}
                          />
                        </div>

                        <div className="tpv2-field">
                          <label>Therapy Start Time</label>
                          <input
                            type="time"
                            name="therapyStartTime"
                            value={planForm.therapyStartTime}
                            onChange={handlePlanFormChange}
                            disabled={!deviceReady}
                          />
                        </div>

                        <div className="tpv2-field">
                          <label>Therapy End Time</label>
                          <input
                            type="time"
                            name="therapyEndTime"
                            value={planForm.therapyEndTime}
                            onChange={handlePlanFormChange}
                            disabled={!deviceReady}
                          />
                        </div>

                        <div className="tpv2-field">
                          <label>Fallback Mode</label>
                          <select
                            name="fallbackMode"
                            value={planForm.fallbackMode}
                            onChange={handlePlanFormChange}
                            disabled={!deviceReady}
                          >
                            <option value="companion">Companion Mode</option>
                            <option value="therapy">Therapy Mode</option>
                          </select>
                        </div>
                      </div>

                      <label className="tpv2-checkbox">
                        <input
                          type="checkbox"
                          name="lockTherapyAfterLimit"
                          checked={planForm.lockTherapyAfterLimit}
                          onChange={handlePlanFormChange}
                          disabled={!deviceReady}
                        />
                        <span>Lock therapy after daily limit</span>
                      </label>

                      <div className="tpv2-actions">
                        <button
                          className="tpv2-primary-btn"
                          type="submit"
                          disabled={!deviceReady || savingPlan}
                        >
                          {savingPlan ? "Saving..." : "Save Therapy Plan"}
                        </button>
                      </div>
                    </form>
                  </section>
                </>
              )}
            </main>

            <aside className="tpv2-summary">
              {!selectedPatient ? (
                <div className="tpv2-empty">Select a patient to view summary.</div>
              ) : (
                <>
                  <div className="tpv2-summary-card">
                    <h3>Quick Summary</h3>

                    <div className="tpv2-summary-item">
                      <span>Diagnosis</span>
                      <strong>
                        {selectedPatient.diagnosisCategory
                          ? getDiagnosisLabel(selectedPatient.diagnosisCategory)
                          : "Not added"}
                      </strong>
                    </div>

                    <div className="tpv2-summary-item">
                      <span>Assigned Level</span>
                      <strong>{selectedPatient.assignedLevelName || "Not assigned"}</strong>
                    </div>

                    <div className="tpv2-summary-item">
                      <span>Device</span>
                      <strong>{selectedPatient.deviceName || "Not assigned"}</strong>
                    </div>

                    <div className="tpv2-summary-item">
                      <span>Sessions</span>
                      <strong>{reportData?.totalSessionsCompleted ?? 0}</strong>
                    </div>

                    <div className="tpv2-summary-item">
                      <span>Completed Items</span>
                      <strong>{reportData?.totalCompletedItems ?? 0}</strong>
                    </div>

                    <div className="tpv2-progress-wrap">
                      <div className="tpv2-progress-label">
                        <span>Overall Progress</span>
                        <strong>{reportData?.overallProgress ?? 0}%</strong>
                      </div>
                      <div className="tpv2-progress-bar">
                        <div
                          className="tpv2-progress-fill"
                          style={{ width: `${reportData?.overallProgress ?? 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="tpv2-summary-card">
                    <h3>Parent Information</h3>
                    <div className="tpv2-summary-item">
                      <span>Parent Name</span>
                      <strong>{selectedPatient.parentName || "N/A"}</strong>
                    </div>
                    <div className="tpv2-summary-item">
                      <span>Email</span>
                      <strong>{selectedPatient.parentEmail || "N/A"}</strong>
                    </div>
                    <div className="tpv2-summary-item">
                      <span>Contact</span>
                      <strong>{selectedPatient.parentContact || "N/A"}</strong>
                    </div>
                  </div>

                  <div className="tpv2-summary-card">
                    <h3>Recent Timeline</h3>
                    {patientTimeline.length === 0 ? (
                      <div className="tpv2-empty small">No updates yet.</div>
                    ) : (
                      <div className="tpv2-timeline">
                        {patientTimeline.map((item) => (
                          <div className="tpv2-timeline-item" key={item.id}>
                            <div className="tpv2-timeline-dot" />
                            <div>
                              <h4>{item.title || "Update"}</h4>
                              <p>{item.description || "No description available."}</p>
                              <span>{formatDate(item.createdAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="tpv2-summary-card">
                    <h3>Current Plan</h3>
                    <div className="tpv2-summary-item">
                      <span>Max Sessions</span>
                      <strong>{therapyPlan?.maxSessionsPerDay ?? "N/A"}</strong>
                    </div>
                    <div className="tpv2-summary-item">
                      <span>Duration</span>
                      <strong>
                        {therapyPlan?.sessionDurationMinutes
                          ? `${therapyPlan.sessionDurationMinutes} mins`
                          : "N/A"}
                      </strong>
                    </div>
                    <div className="tpv2-summary-item">
                      <span>Fallback</span>
                      <strong>{therapyPlan?.fallbackMode || "companion"}</strong>
                    </div>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

export default TherapistPatients;