import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Image,
  Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import TherapistHeader from "../../components/TherapistHeader";
import { auth, db } from "../../firebase/config";
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
import { colors, shadows } from "../../styles/theme";

export default function PatientsScreen() {
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
    maxSessionsPerDay: "3",
    sessionDurationMinutes: "20",
    minimumGapBetweenSessionsMinutes: "30",
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
    maxSessionsPerDay: "3",
    sessionDurationMinutes: "20",
    minimumGapBetweenSessionsMinutes: "30",
    lockTherapyAfterLimit: true,
    therapyStartTime: "",
    therapyEndTime: "",
    fallbackMode: "companion",
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const showToast = (text) => {
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
        showToast("❌ Therapist account not found.");
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
      console.log("Error fetching patients data:", error);
      showToast("❌ Failed to load patients.");
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
        maxSessionsPerDay: planData ? String(planData.maxSessionsPerDay || 3) : "3",
        sessionDurationMinutes: planData
          ? String(planData.sessionDurationMinutes || 20)
          : "20",
        minimumGapBetweenSessionsMinutes: planData
          ? String(planData.minimumGapBetweenSessionsMinutes || 30)
          : "30",
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
        maxSessionsPerDay: planData ? String(planData.maxSessionsPerDay || 3) : "3",
        sessionDurationMinutes: planData
          ? String(planData.sessionDurationMinutes || 20)
          : "20",
        minimumGapBetweenSessionsMinutes: planData
          ? String(planData.minimumGapBetweenSessionsMinutes || 30)
          : "30",
        lockTherapyAfterLimit: planData
          ? !!planData.lockTherapyAfterLimit
          : true,
        therapyStartTime: planData?.therapyStartTime || "",
        therapyEndTime: planData?.therapyEndTime || "",
        fallbackMode: planData?.fallbackMode || "companion",
      });

      if (openDialog) setShowPatientDialog(true);
    } catch (error) {
      console.log("Error selecting patient:", error);
      showToast("❌ Failed to load patient details.");
    }
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

  const handleAssignPatient = async () => {
    const user = auth.currentUser;
    if (!user || !therapistData) {
      showToast("❌ Therapist account not found.");
      return;
    }

    if (!assignPatientForm.childId) {
      showToast("❌ Please select a patient.");
      return;
    }

    if (!assignPatientForm.levelId) {
      showToast("❌ Please select a level.");
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
      showToast("✅ Patient assigned successfully.");
      await fetchInitialData();
    } catch (error) {
      console.log("Error assigning patient:", error);
      showToast("❌ Failed to assign patient.");
    } finally {
      setAssigningPatient(false);
    }
  };

  const openAssignDeviceDialog = () => {
    if (!selectedPatient) {
      showToast("⚠️ Please select a patient first.");
      return;
    }

    if (!selectedPatient.therapistUid) {
      showToast("⚠️ Assign the patient to a therapist first.");
      return;
    }

    if (!selectedPatient.assignedLevelId) {
      showToast("⚠️ Assign a level before assigning a device.");
      return;
    }

    setShowDeviceDialog(true);
  };

  const handleAssignDevice = async () => {
    const user = auth.currentUser;
    if (!user || !therapistData || !selectedPatient) {
      showToast("❌ Missing therapist or patient details.");
      return;
    }

    if (!deviceForm.deviceName.trim()) {
      showToast("❌ Please enter device name.");
      return;
    }

    if (Number(deviceForm.maxSessionsPerDay) < 1) {
      showToast("❌ Max sessions per day must be at least 1.");
      return;
    }

    if (Number(deviceForm.sessionDurationMinutes) < 1) {
      showToast("❌ Session duration must be at least 1 minute.");
      return;
    }

    if (Number(deviceForm.minimumGapBetweenSessionsMinutes) < 0) {
      showToast("❌ Minimum gap between sessions is invalid.");
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
      showToast(`✅ Device assigned successfully. Device ID: ${generatedDeviceCode}`);
      await fetchInitialData();
    } catch (error) {
      console.log("Error assigning device:", error);
      showToast("❌ Failed to assign device.");
    } finally {
      setAssigningDevice(false);
    }
  };

  const handleSaveLevelEdit = async () => {
    if (!selectedPatient) return;
    if (!levelEditForm.levelId) {
      showToast("❌ Please select a level.");
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
      showToast("✅ Level assignment updated.");
      await fetchInitialData();
    } catch (error) {
      console.log("Error updating level:", error);
      showToast("❌ Failed to update level.");
    } finally {
      setSavingLevelEdit(false);
    }
  };

  const handleSaveDeviceEdit = async () => {
    if (!selectedPatient) return;
    if (!selectedPatient.deviceId && !selectedPatient.deviceCode) {
      showToast("⚠️ No device assigned yet.");
      return;
    }

    if (!deviceEditForm.deviceName.trim()) {
      showToast("❌ Please enter device name.");
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
      showToast("✅ Device info updated.");
      await fetchInitialData();
    } catch (error) {
      console.log("Error updating device info:", error);
      showToast("❌ Failed to update device info.");
    } finally {
      setSavingDeviceEdit(false);
    }
  };

  const handleSavePlanEdit = async () => {
    if (!selectedPatient) return;

    if (Number(planEditForm.maxSessionsPerDay) < 1) {
      showToast("❌ Max sessions per day must be at least 1.");
      return;
    }

    if (Number(planEditForm.sessionDurationMinutes) < 1) {
      showToast("❌ Session duration must be at least 1 minute.");
      return;
    }

    if (Number(planEditForm.minimumGapBetweenSessionsMinutes) < 0) {
      showToast("❌ Minimum gap between sessions is invalid.");
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
      showToast("✅ Therapy plan updated.");
      await fetchInitialData();
    } catch (error) {
      console.log("Error updating therapy plan:", error);
      showToast("❌ Failed to update therapy plan.");
    } finally {
      setSavingPlanEdit(false);
    }
  };

  const onLevelSelect = (levelId, target = "assign") => {
    const selectedLevel = levels.find((level) => level.id === levelId);

    const levelName =
      selectedLevel?.title ||
      selectedLevel?.levelName ||
      selectedLevel?.name ||
      "";

    if (target === "assign") {
      setAssignPatientForm((prev) => ({
        ...prev,
        levelId,
        levelName,
      }));
    } else {
      setLevelEditForm({
        levelId,
        levelName,
      });
    }
  };

  const patientStats = [
    { icon: "👶", value: stats.totalAssigned, label: "Assigned Patients" },
    { icon: "📘", value: stats.withLevel, label: "With Assigned Level" },
    { icon: "🧸", value: stats.withDevice, label: "With Assigned Device" },
    { icon: "📈", value: `${stats.avgProgress}%`, label: "Average Progress" },
  ];

  if (loading) {
    return (
      <View style={styles.page}>
        <TherapistHeader />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading patients...</Text>
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
        <LinearGradient colors={["#f8fffe", "#eef9f7", "#f6fbff"]} style={styles.heroCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>👩‍⚕️ Patient Management</Text>
          </View>
          <Text style={styles.heroTitle}>Therapist Patients</Text>
          <Text style={styles.heroSubtitle}>
            Manage assigned children, review progress, assign levels and devices,
            and update therapy plans from one modern workspace.
          </Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setShowAssignPanel(!showAssignPanel)}
          >
            <Text style={styles.primaryBtnText}>
              {showAssignPanel ? "Close Assign Panel" : "+ Assign Patient"}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.statsGrid}>
          {patientStats.map((item) => (
            <View key={item.label} style={styles.statCard}>
              <View style={styles.statIconWrap}>
                <Text style={styles.statIcon}>{item.icon}</Text>
              </View>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.toolbarCard}>
          <TextInput
            placeholder="Search by child name, child code, parent ID, or parent email"
            placeholderTextColor="#8a97a6"
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
          />
        </View>

        {!!message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        {showAssignPanel && (
          <View style={styles.panelCard}>
            <Text style={styles.sectionTitle}>Assign Patient</Text>
            <Text style={styles.sectionSubtitle}>
              Select an unassigned child and assign a level.
            </Text>

            <Text style={styles.label}>Patient</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              {availableChildrenToAssign.map((child) => {
                const active = assignPatientForm.childId === child.id;
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() =>
                      setAssignPatientForm((prev) => ({ ...prev, childId: child.id }))
                    }
                  >
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                      {child.childName} ({child.childCode || "No Code"})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Therapist</Text>
            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyText}>
                {assignPatientForm.therapistName || "Therapist"}
              </Text>
            </View>

            <Text style={styles.label}>Level</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              {levels.map((level) => {
                const active = assignPatientForm.levelId === level.id;
                return (
                  <TouchableOpacity
                    key={level.id}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => onLevelSelect(level.id, "assign")}
                  >
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                      {level.title || level.levelName || level.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryBtn, assigningPatient && styles.disabledBtn]}
              onPress={handleAssignPatient}
              disabled={assigningPatient}
            >
              <Text style={styles.primaryBtnText}>
                {assigningPatient ? "Assigning..." : "Assign Patient"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.mainSection}>
          <View style={styles.listCard}>
            <Text style={styles.sectionTitle}>Patient List</Text>
            <Text style={styles.sectionSubtitle}>
              All assigned patients are visible here with quick status details.
            </Text>

            {filteredAssignedPatients.length === 0 ? (
              <Text style={styles.emptyText}>No assigned patients found.</Text>
            ) : (
              filteredAssignedPatients.map((patient) => (
                <View
                  key={patient.id}
                  style={[
                    styles.patientCard,
                    selectedPatient?.id === patient.id && styles.activePatientCard,
                  ]}
                >
                  <View style={styles.patientTop}>
                    {patient.childImageUrl ? (
                      <Image source={{ uri: patient.childImageUrl }} style={styles.patientAvatar} />
                    ) : (
                      <View style={styles.patientAvatarPlaceholder}>
                        <Text style={styles.avatarEmoji}>🧒</Text>
                      </View>
                    )}

                    <View style={styles.patientMain}>
                      <Text style={styles.patientName}>{patient.childName || "Child"}</Text>
                      <Text style={styles.patientCode}>{patient.childCode || "No Code"}</Text>
                    </View>

                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>
                        {patient.status || "active"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.patientMiniGrid}>
                    <MiniCard label="Parent" value={patient.parentName || "N/A"} />
                    <MiniCard label="Level" value={patient.assignedLevelName || "Not Assigned"} />
                    <MiniCard
                      label="Device"
                      value={patient.deviceAssigned ? "Assigned" : "Not Assigned"}
                    />
                    <MiniCard label="Progress" value={`${patient.overallProgress || 0}%`} />
                  </View>

                  <View style={styles.patientActionRow}>
                    <TouchableOpacity
                      style={styles.ghostBtn}
                      onPress={() => handleSelectPatient(patient)}
                    >
                      <Text style={styles.ghostBtnText}>Select</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.primaryBtnSmall}
                      onPress={() => handleSelectPatient(patient, null, true)}
                    >
                      <Text style={styles.primaryBtnSmallText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.summaryCard}>
            {!selectedPatient ? (
              <View>
                <Text style={styles.sectionTitle}>No Patient Selected</Text>
                <Text style={styles.emptyText}>
                  Select a patient from the list to see quick actions and details.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Quick Summary</Text>
                <Text style={styles.sectionSubtitle}>
                  Fast access to device, level, and therapy plan actions for{" "}
                  {selectedPatient.childName || "this child"}.
                </Text>

                <View style={styles.highlightCard}>
                  <View style={styles.highlightTop}>
                    {selectedPatient.childImageUrl ? (
                      <Image source={{ uri: selectedPatient.childImageUrl }} style={styles.summaryAvatar} />
                    ) : (
                      <View style={styles.summaryAvatarPlaceholder}>
                        <Text style={styles.avatarEmoji}>🧒</Text>
                      </View>
                    )}

                    <View>
                      <Text style={styles.highlightName}>
                        {selectedPatient.childName || "Child"}
                      </Text>
                      <Text style={styles.highlightCode}>
                        {selectedPatient.childCode || "No Code"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressBlock}>
                    <View style={styles.progressLabelRow}>
                      <Text style={styles.progressLabel}>Overall Progress</Text>
                      <Text style={styles.progressValue}>
                        {reportData?.overallProgress ?? 0}%
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${reportData?.overallProgress ?? 0}%` },
                        ]}
                      />
                    </View>
                  </View>

                  <View style={styles.summaryMiniGrid}>
                    <MiniCard
                      label="Assigned Level"
                      value={selectedPatient.assignedLevelName || "N/A"}
                    />
                    <MiniCard
                      label="Device"
                      value={selectedPatient.deviceName || "Not Assigned"}
                    />
                    <MiniCard
                      label="Sessions"
                      value={String(reportData?.totalSessionsCompleted ?? 0)}
                    />
                    <MiniCard
                      label="Parent"
                      value={selectedPatient.parentName || "N/A"}
                    />
                  </View>
                </View>

                <View style={styles.quickActionGrid}>
                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => setShowLevelEditDialog(true)}
                  >
                    <Text style={styles.quickActionText}>Edit Level</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={openAssignDeviceDialog}
                  >
                    <Text style={styles.quickActionText}>Assign Device</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => setShowDeviceEditDialog(true)}
                  >
                    <Text style={styles.quickActionText}>Edit Device</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => setShowPlanEditDialog(true)}
                  >
                    <Text style={styles.quickActionText}>Edit Therapy Plan</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickActionWide}
                    onPress={() => setShowPatientDialog(true)}
                  >
                    <Text style={styles.quickActionWideText}>
                      Open Full Patient Details
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showPatientDialog} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPatientDialog(false)}
        >
          <Pressable style={styles.largeModal} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Patient Full Details</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowPatientDialog(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedPatient && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.dialogTop}>
                  {selectedPatient.childImageUrl ? (
                    <Image source={{ uri: selectedPatient.childImageUrl }} style={styles.dialogAvatar} />
                  ) : (
                    <View style={styles.dialogAvatarPlaceholder}>
                      <Text style={styles.avatarEmoji}>🧒</Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={styles.dialogName}>
                      {selectedPatient.childName || "Child"}
                    </Text>
                    <Text style={styles.dialogCode}>
                      {selectedPatient.childCode || "No Code"}
                    </Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>
                        {selectedPatient.status || "active"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.tabRow}>
                  {["overview", "assignment", "timeline"].map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      style={[
                        styles.tabBtn,
                        selectedTab === tab && styles.tabBtnActive,
                      ]}
                      onPress={() => setSelectedTab(tab)}
                    >
                      <Text
                        style={[
                          styles.tabBtnText,
                          selectedTab === tab && styles.tabBtnTextActive,
                        ]}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedTab === "overview" && (
                  <>
                    <InfoPanel title="Child Information">
                      <InfoLine label="Name" value={selectedPatient.childName || "N/A"} />
                      <InfoLine label="Code" value={selectedPatient.childCode || "N/A"} />
                      <InfoLine label="Age" value={selectedPatient.age || "N/A"} />
                      <InfoLine label="Gender" value={selectedPatient.gender || "N/A"} />
                      <InfoLine label="Status" value={selectedPatient.status || "active"} />
                    </InfoPanel>

                    <InfoPanel title="Parent Information">
                      <InfoLine label="Name" value={selectedPatient.parentName || "N/A"} />
                      <InfoLine label="Parent ID" value={selectedPatient.parentId || "N/A"} />
                      <InfoLine label="Email" value={selectedPatient.parentEmail || "N/A"} />
                      <InfoLine label="Contact" value={selectedPatient.parentContact || "N/A"} />
                    </InfoPanel>

                    <InfoPanel title="Progress Summary">
                      <InfoLine label="Current Progress" value={`${reportData?.overallProgress ?? 0}%`} />
                      <InfoLine label="Completed Sessions" value={reportData?.totalSessionsCompleted ?? 0} />
                      <InfoLine label="Completed Items" value={reportData?.totalCompletedItems ?? 0} />
                      <InfoLine label="Total Items" value={reportData?.totalItems ?? 0} />
                    </InfoPanel>
                  </>
                )}

                {selectedTab === "assignment" && (
                  <>
                    <InfoPanel
                      title="Level Assignment"
                      actionLabel="Edit"
                      onAction={() => setShowLevelEditDialog(true)}
                    >
                      <InfoLine label="Assigned Level" value={selectedPatient.assignedLevelName || "N/A"} />
                      <InfoLine label="Strongest Area" value={reportData?.strongestArea || "N/A"} />
                      <InfoLine label="Support Area" value={reportData?.supportArea || "N/A"} />
                    </InfoPanel>

                    <InfoPanel
                      title="Device Information"
                      actionLabel="Edit"
                      onAction={() => setShowDeviceEditDialog(true)}
                    >
                      <InfoLine label="Assigned" value={selectedPatient.deviceAssigned ? "Yes" : "No"} />
                      <InfoLine label="Device ID" value={selectedPatient.deviceId || "N/A"} />
                      <InfoLine label="Device Code" value={selectedPatient.deviceCode || "N/A"} />
                      <InfoLine label="Device Name" value={selectedPatient.deviceName || "N/A"} />
                      <InfoLine label="Status" value={selectedPatient.deviceStatus || "N/A"} />
                    </InfoPanel>

                    <InfoPanel
                      title="Therapy Plan & Recommendations"
                      actionLabel="Edit"
                      onAction={() => setShowPlanEditDialog(true)}
                    >
                      <InfoLine label="Max Sessions / Day" value={therapyPlan?.maxSessionsPerDay ?? "N/A"} />
                      <InfoLine label="Session Duration" value={`${therapyPlan?.sessionDurationMinutes ?? "N/A"} mins`} />
                      <InfoLine label="Minimum Gap" value={`${therapyPlan?.minimumGapBetweenSessionsMinutes ?? "N/A"} mins`} />
                      <InfoLine
                        label="Therapy Time"
                        value={`${therapyPlan?.therapyStartTime || "N/A"} - ${therapyPlan?.therapyEndTime || "N/A"}`}
                      />
                      <InfoLine label="Fallback Mode" value={therapyPlan?.fallbackMode || "companion"} />
                      <InfoLine label="Summary" value={reportData?.therapistSummary || "No summary yet"} />
                      <InfoLine label="Recommendation" value={reportData?.overallRecommendation || "No recommendation yet"} />
                      <InfoLine label="Home Advice" value={reportData?.homeAdvice || "No advice yet"} />
                    </InfoPanel>
                  </>
                )}

                {selectedTab === "timeline" && (
                  <InfoPanel title="Recent Timeline">
                    {patientTimeline.length === 0 ? (
                      <Text style={styles.emptyText}>No updates found yet.</Text>
                    ) : (
                      patientTimeline.map((item) => (
                        <View style={styles.timelineItem} key={item.id}>
                          <View style={styles.timelineDot} />
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>
                              {item.title || "Update"}
                            </Text>
                            <Text style={styles.timelineDescription}>
                              {item.description || "No description available."}
                            </Text>
                            <Text style={styles.timelineDate}>
                              {formatDate(item.createdAt)}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </InfoPanel>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeviceDialog} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeviceDialog(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Device</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowDeviceDialog(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubText}>
              Device ID will be auto-generated. Therapy and companion modes will be available.
            </Text>

            <FormField
              label="Device Name"
              value={deviceForm.deviceName}
              onChangeText={(text) => setDeviceForm((p) => ({ ...p, deviceName: text }))}
            />
            <FormField
              label="Max Sessions Per Day"
              value={deviceForm.maxSessionsPerDay}
              keyboardType="number-pad"
              onChangeText={(text) => setDeviceForm((p) => ({ ...p, maxSessionsPerDay: text }))}
            />
            <FormField
              label="Session Duration Minutes"
              value={deviceForm.sessionDurationMinutes}
              keyboardType="number-pad"
              onChangeText={(text) => setDeviceForm((p) => ({ ...p, sessionDurationMinutes: text }))}
            />
            <FormField
              label="Minimum Gap Between Sessions"
              value={deviceForm.minimumGapBetweenSessionsMinutes}
              keyboardType="number-pad"
              onChangeText={(text) =>
                setDeviceForm((p) => ({ ...p, minimumGapBetweenSessionsMinutes: text }))
              }
            />
            <FormField
              label="Therapy Start Time (HH:MM)"
              value={deviceForm.therapyStartTime}
              onChangeText={(text) => setDeviceForm((p) => ({ ...p, therapyStartTime: text }))}
            />
            <FormField
              label="Therapy End Time (HH:MM)"
              value={deviceForm.therapyEndTime}
              onChangeText={(text) => setDeviceForm((p) => ({ ...p, therapyEndTime: text }))}
            />

            <View style={styles.choiceRowWrap}>
              <Text style={styles.label}>Fallback Mode</Text>
              <View style={styles.choiceRow}>
                {["companion", "therapy"].map((mode) => {
                  const active = deviceForm.fallbackMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.choiceChip, active && styles.choiceChipActive]}
                      onPress={() =>
                        setDeviceForm((p) => ({ ...p, fallbackMode: mode }))
                      }
                    >
                      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Lock Therapy After Daily Limit</Text>
              <Switch
                value={deviceForm.lockTherapyAfterLimit}
                onValueChange={(value) =>
                  setDeviceForm((p) => ({ ...p, lockTherapyAfterLimit: value }))
                }
              />
            </View>

            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyText}>Device ID: Auto-generated on assign</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDeviceDialog(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtnSmall, assigningDevice && styles.disabledBtn]}
                onPress={handleAssignDevice}
                disabled={assigningDevice}
              >
                <Text style={styles.primaryBtnSmallText}>
                  {assigningDevice ? "Assigning Device..." : "Assign Device"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showLevelEditDialog} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowLevelEditDialog(false)}>
          <Pressable style={styles.smallModalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Level Assignment</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowLevelEditDialog(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              {levels.map((level) => {
                const active = levelEditForm.levelId === level.id;
                return (
                  <TouchableOpacity
                    key={level.id}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => onLevelSelect(level.id, "edit")}
                  >
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                      {level.title || level.levelName || level.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowLevelEditDialog(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtnSmall, savingLevelEdit && styles.disabledBtn]}
                onPress={handleSaveLevelEdit}
                disabled={savingLevelEdit}
              >
                <Text style={styles.primaryBtnSmallText}>
                  {savingLevelEdit ? "Saving..." : "Save Level"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeviceEditDialog} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeviceEditDialog(false)}>
          <Pressable style={styles.smallModalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Device Info</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowDeviceEditDialog(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <FormField
              label="Device Name"
              value={deviceEditForm.deviceName}
              onChangeText={(text) => setDeviceEditForm((p) => ({ ...p, deviceName: text }))}
            />

            <View style={styles.choiceRowWrap}>
              <Text style={styles.label}>Device Status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                {["Assigned", "Active", "Ready", "Paused", "Maintenance", "Disabled"].map(
                  (status) => {
                    const active = deviceEditForm.deviceStatus === status;
                    return (
                      <TouchableOpacity
                        key={status}
                        style={[styles.choiceChip, active && styles.choiceChipActive]}
                        onPress={() =>
                          setDeviceEditForm((p) => ({ ...p, deviceStatus: status }))
                        }
                      >
                        <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                          {status}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </ScrollView>
            </View>

            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyText}>
                Device ID: {selectedPatient?.deviceId || selectedPatient?.deviceCode || "N/A"}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDeviceEditDialog(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtnSmall, savingDeviceEdit && styles.disabledBtn]}
                onPress={handleSaveDeviceEdit}
                disabled={savingDeviceEdit}
              >
                <Text style={styles.primaryBtnSmallText}>
                  {savingDeviceEdit ? "Saving..." : "Save Device Info"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showPlanEditDialog} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowPlanEditDialog(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Therapy Plan</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowPlanEditDialog(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <FormField
              label="Max Sessions Per Day"
              value={planEditForm.maxSessionsPerDay}
              keyboardType="number-pad"
              onChangeText={(text) => setPlanEditForm((p) => ({ ...p, maxSessionsPerDay: text }))}
            />
            <FormField
              label="Session Duration Minutes"
              value={planEditForm.sessionDurationMinutes}
              keyboardType="number-pad"
              onChangeText={(text) =>
                setPlanEditForm((p) => ({ ...p, sessionDurationMinutes: text }))
              }
            />
            <FormField
              label="Minimum Gap Between Sessions"
              value={planEditForm.minimumGapBetweenSessionsMinutes}
              keyboardType="number-pad"
              onChangeText={(text) =>
                setPlanEditForm((p) => ({ ...p, minimumGapBetweenSessionsMinutes: text }))
              }
            />
            <FormField
              label="Therapy Start Time (HH:MM)"
              value={planEditForm.therapyStartTime}
              onChangeText={(text) =>
                setPlanEditForm((p) => ({ ...p, therapyStartTime: text }))
              }
            />
            <FormField
              label="Therapy End Time (HH:MM)"
              value={planEditForm.therapyEndTime}
              onChangeText={(text) =>
                setPlanEditForm((p) => ({ ...p, therapyEndTime: text }))
              }
            />

            <View style={styles.choiceRowWrap}>
              <Text style={styles.label}>Fallback Mode</Text>
              <View style={styles.choiceRow}>
                {["companion", "therapy"].map((mode) => {
                  const active = planEditForm.fallbackMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.choiceChip, active && styles.choiceChipActive]}
                      onPress={() =>
                        setPlanEditForm((p) => ({ ...p, fallbackMode: mode }))
                      }
                    >
                      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Lock Therapy After Daily Limit</Text>
              <Switch
                value={planEditForm.lockTherapyAfterLimit}
                onValueChange={(value) =>
                  setPlanEditForm((p) => ({ ...p, lockTherapyAfterLimit: value }))
                }
              />
            </View>

            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyText}>Modes Allowed: Therapy + Companion</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowPlanEditDialog(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtnSmall, savingPlanEdit && styles.disabledBtn]}
                onPress={handleSavePlanEdit}
                disabled={savingPlanEdit}
              >
                <Text style={styles.primaryBtnSmallText}>
                  {savingPlanEdit ? "Saving..." : "Save Therapy Plan"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MiniCard({ label, value }) {
  return (
    <View style={styles.miniCard}>
      <Text style={styles.miniCardLabel}>{label}</Text>
      <Text style={styles.miniCardValue}>{value}</Text>
    </View>
  );
}

function FormField({ label, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#8a97a6"
        style={styles.input}
        {...props}
      />
    </View>
  );
}

function InfoPanel({ title, actionLabel, onAction, children }) {
  return (
    <View style={styles.infoPanel}>
      <View style={styles.infoPanelHead}>
        <Text style={styles.infoPanelTitle}>{title}</Text>
        {!!actionLabel && (
          <TouchableOpacity style={styles.miniEditBtn} onPress={onAction}>
            <Text style={styles.miniEditBtnText}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function InfoLine({ label, value }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLineLabel}>{label}</Text>
      <Text style={styles.infoLineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f6fbff",
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
    color: "#153240",
  },

  heroCard: {
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
    ...shadows.card,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#e8fffb",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  badgeText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#153240",
    marginBottom: 10,
  },
  heroSubtitle: {
    color: "#667085",
    lineHeight: 22,
    fontSize: 14,
    marginBottom: 16,
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    ...shadows.soft,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 14,
  },

  statsGrid: {
    gap: 14,
    marginBottom: 18,
  },
  statCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#ebf4f2",
    borderRadius: 22,
    padding: 18,
    ...shadows.card,
  },
  statIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#dffaf7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statIcon: {
    fontSize: 24,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#153240",
    marginBottom: 4,
  },
  statLabel: {
    color: "#667085",
    fontWeight: "700",
  },

  toolbarCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#ebf4f2",
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#dbe9e7",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontSize: 14,
    color: "#153240",
    backgroundColor: "#fbfefe",
  },

  messageBox: {
    backgroundColor: "#f0fdfa",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  messageText: {
    color: "#0f766e",
    fontWeight: "800",
    lineHeight: 20,
  },

  panelCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#ebf4f2",
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    ...shadows.card,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#153240",
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: "#667085",
    lineHeight: 21,
    fontSize: 13,
    marginBottom: 14,
  },
  label: {
    color: "#344054",
    fontWeight: "800",
    fontSize: 13,
    marginBottom: 8,
  },

  choiceRowWrap: {
    marginBottom: 14,
  },
  choiceRow: {
    gap: 10,
    paddingBottom: 4,
  },
  choiceChip: {
    backgroundColor: "#f3fbfa",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#dfeeed",
  },
  choiceChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceText: {
    color: "#4b5563",
    fontWeight: "800",
    fontSize: 13,
  },
  choiceTextActive: {
    color: "#ffffff",
  },

  readonlyBox: {
    backgroundColor: "#f7fbfb",
    borderWidth: 1,
    borderColor: "#badfd9",
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  readonlyText: {
    color: "#0f766e",
    fontWeight: "800",
  },

  mainSection: {
    gap: 16,
  },
  listCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#ebf4f2",
    borderRadius: 26,
    padding: 18,
    ...shadows.card,
  },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#ebf4f2",
    borderRadius: 26,
    padding: 18,
    ...shadows.card,
  },

  patientCard: {
    borderWidth: 1,
    borderColor: "#e2efed",
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
  },
  activePatientCard: {
    borderColor: colors.primary,
    backgroundColor: "rgba(46,196,182,0.06)",
  },
  patientTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  patientAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#eefaf7",
  },
  patientAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#eefaf7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: {
    fontSize: 28,
  },
  patientMain: {
    flex: 1,
  },
  patientName: {
    color: "#153240",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  patientCode: {
    color: "#6b7280",
    fontSize: 13,
  },
  statusPill: {
    backgroundColor: "#e7fffb",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  statusPillText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "capitalize",
  },

  patientMiniGrid: {
    gap: 10,
    marginBottom: 14,
  },
  miniCard: {
    backgroundColor: "#f7fbfb",
    borderWidth: 1,
    borderColor: "#e7f0ef",
    borderRadius: 16,
    padding: 12,
  },
  miniCardLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  miniCardValue: {
    color: "#153240",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },

  patientActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d6e7e4",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostBtnText: {
    color: "#153240",
    fontWeight: "800",
  },
  primaryBtnSmall: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    ...shadows.soft,
  },
  primaryBtnSmallText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  highlightCard: {
    borderWidth: 1,
    borderColor: "#dff0ee",
    borderRadius: 24,
    padding: 16,
    backgroundColor: "#ffffff",
    marginBottom: 16,
  },
  highlightTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  summaryAvatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#eefaf7",
  },
  summaryAvatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#eefaf7",
    alignItems: "center",
    justifyContent: "center",
  },
  highlightName: {
    color: "#153240",
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 4,
  },
  highlightCode: {
    color: "#6b7280",
  },

  progressBlock: {
    marginBottom: 16,
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  progressLabel: {
    color: "#153240",
    fontWeight: "800",
  },
  progressValue: {
    color: "#153240",
    fontWeight: "900",
  },
  progressTrack: {
    height: 12,
    backgroundColor: "#e7f3f1",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },

  summaryMiniGrid: {
    gap: 10,
  },

  quickActionGrid: {
    gap: 10,
  },
  quickActionBtn: {
    backgroundColor: "#effcf9",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  quickActionText: {
    color: "#0f766e",
    fontWeight: "900",
  },
  quickActionWide: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  quickActionWideText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  emptyText: {
    color: "#667085",
    lineHeight: 22,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 18,
    maxHeight: "88%",
    ...shadows.card,
  },
  smallModalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 18,
    maxHeight: "78%",
    ...shadows.card,
  },
  largeModal: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 18,
    maxHeight: "90%",
    ...shadows.card,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    color: "#153240",
    fontWeight: "900",
    fontSize: 22,
    flex: 1,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#f3f7f7",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#153240",
  },
  modalSubText: {
    color: "#667085",
    lineHeight: 21,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d8e7e4",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  modalCancelText: {
    color: "#153240",
    fontWeight: "800",
  },
  disabledBtn: {
    opacity: 0.65,
  },

  dialogTop: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  dialogAvatar: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: "#eefaf7",
  },
  dialogAvatarPlaceholder: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: "#eefaf7",
    alignItems: "center",
    justifyContent: "center",
  },
  dialogName: {
    color: "#153240",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4,
  },
  dialogCode: {
    color: "#667085",
    marginBottom: 8,
  },

  tabRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  tabBtn: {
    backgroundColor: "#f3fbfa",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    color: "#4b5563",
    fontWeight: "800",
  },
  tabBtnTextActive: {
    color: "#ffffff",
  },

  infoPanel: {
    backgroundColor: "#fbfefe",
    borderWidth: 1,
    borderColor: "#e5f0ee",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  infoPanelHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  infoPanelTitle: {
    color: "#153240",
    fontSize: 18,
    fontWeight: "900",
    flex: 1,
  },
  miniEditBtn: {
    backgroundColor: "#ecfffb",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  miniEditBtnText: {
    color: "#0f766e",
    fontWeight: "900",
  },

  infoLine: {
    paddingVertical: 6,
  },
  infoLineLabel: {
    color: "#6b7280",
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 4,
  },
  infoLineValue: {
    color: "#4b5563",
    lineHeight: 21,
  },

  timelineItem: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    color: "#153240",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  timelineDescription: {
    color: "#667085",
    lineHeight: 21,
    marginBottom: 4,
  },
  timelineDate: {
    color: "#94a3b8",
    fontWeight: "800",
    fontSize: 12,
  },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  switchLabel: {
    flex: 1,
    color: "#344054",
    fontWeight: "800",
    fontSize: 13,
  },

  input: {
    borderWidth: 1,
    borderColor: "#dbe9e7",
    backgroundColor: "#fbfefe",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#153240",
  },
});