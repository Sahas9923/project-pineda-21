import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ParentNavbar from "../components/ParentNavbar";
import "../styles/ChildInfo.css";
import { auth, db, storage } from "../firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const getDiagnosisLabel = (value) => {
  switch (value) {
    case "autism":
      return "Autism";
    case "down_syndrome":
      return "Down Syndrome";
    case "general":
      return "General";
    default:
      return "Not added yet";
  }
};

const ChildInfo = () => {
  const navigate = useNavigate();

  const [childrenList, setChildrenList] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [recentTimeline, setRecentTimeline] = useState([]);
  const [therapistProfile, setTherapistProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  const [savingChild, setSavingChild] = useState(false);
  const [message, setMessage] = useState("");

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingChild, setEditingChild] = useState(false);
  const [updatingChild, setUpdatingChild] = useState(false);

  const [childForm, setChildForm] = useState({
    childName: "",
    age: "",
    gender: "",
  });

  const [editChildForm, setEditChildForm] = useState({
    childName: "",
    age: "",
    gender: "",
  });

  const [childImageFile, setChildImageFile] = useState(null);
  const [childImagePreview, setChildImagePreview] = useState("");

  const [editChildImageFile, setEditChildImageFile] = useState(null);
  const [editChildImagePreview, setEditChildImagePreview] = useState("");

  useEffect(() => {
    fetchChildren();
  }, []);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  };

  const getTodayKey = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const isWithinTherapyTime = (startTime, endTime) => {
    if (!startTime || !endTime) return true;

    try {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch {
      return true;
    }
  };

  const generateChildCodeFromCounter = async () => {
    const counterRef = doc(db, "counters", "children");

    const newCount = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);

      if (!counterSnap.exists()) {
        transaction.set(counterRef, {
          currentCount: 1,
          prefix: "CH",
          updatedAt: serverTimestamp(),
        });
        return 1;
      }

      const currentCount = counterSnap.data().currentCount || 0;
      const nextCount = currentCount + 1;

      transaction.update(counterRef, {
        currentCount: nextCount,
        updatedAt: serverTimestamp(),
      });

      return nextCount;
    });

    return `CH-${String(newCount).padStart(4, "0")}`;
  };

  const fetchChildren = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const parentRef = doc(db, "parents", user.uid);
      const parentSnap = await getDoc(parentRef);
      const parentData = parentSnap.exists() ? parentSnap.data() : {};

      const q = query(
        collection(db, "children"),
        where("parentUid", "==", user.uid)
      );

      const snapshot = await getDocs(q);

      const children = snapshot.docs.map((childDoc) => ({
        id: childDoc.id,
        ...childDoc.data(),
        diagnosisCategory: childDoc.data().diagnosisCategory || "",
        diagnosisNotes: childDoc.data().diagnosisNotes || "",
        parentName: childDoc.data().parentName || parentData.name || "Parent",
        parentEmail:
          childDoc.data().parentEmail || parentData.email || user.email || "",
        parentId: childDoc.data().parentId || parentData.parentId || "",
        parentContact:
          childDoc.data().parentContact ||
          parentData.contact ||
          parentData.phone ||
          "",
      }));

      setChildrenList(children);

      if (children.length > 0) {
        setSelectedChild(children[0]);
      } else {
        setSelectedChild(null);
        setReportData(null);
        setRecentTimeline([]);
        setTherapistProfile(null);
      }
    } catch (error) {
      console.error("Error fetching children:", error);
      showMessage("❌ Failed to load children.");
    } finally {
      setLoading(false);
    }
  };

  const fetchLatestTherapistProfile = async (therapistUid, childFallbackData = {}) => {
    if (!therapistUid) {
      setTherapistProfile(null);
      return null;
    }

    try {
      const therapistRef = doc(db, "therapists", therapistUid);
      const therapistSnap = await getDoc(therapistRef);

      if (therapistSnap.exists()) {
        const therapistData = therapistSnap.data();

        const mergedTherapist = {
          therapistUid,
          therapistName:
            therapistData.name || childFallbackData.therapistName || "Not assigned",
          therapistEmail:
            therapistData.email || childFallbackData.therapistEmail || "N/A",
          therapistContact:
            therapistData.contact || childFallbackData.therapistContact || "N/A",
          therapistId:
            therapistData.therapistId || childFallbackData.therapistId || "N/A",
          therapistImageUrl:
            therapistData.imageUrl || childFallbackData.therapistImageUrl || "",
          slmcNumber: therapistData.slmcNumber || "N/A",
          experience: therapistData.experience || "N/A",
          specialization: therapistData.specialization || "N/A",
          availableOnline: !!therapistData.availableOnline,
        };

        setTherapistProfile(mergedTherapist);
        return mergedTherapist;
      }

      const fallbackTherapist = {
        therapistUid,
        therapistName: childFallbackData.therapistName || "Not assigned",
        therapistEmail: childFallbackData.therapistEmail || "N/A",
        therapistContact: childFallbackData.therapistContact || "N/A",
        therapistId: childFallbackData.therapistId || "N/A",
        therapistImageUrl: childFallbackData.therapistImageUrl || "",
        slmcNumber: "N/A",
        experience: "N/A",
        specialization: "N/A",
        availableOnline: false,
      };

      setTherapistProfile(fallbackTherapist);
      return fallbackTherapist;
    } catch (error) {
      console.error("Error fetching therapist profile:", error);

      const fallbackTherapist = {
        therapistUid,
        therapistName: childFallbackData.therapistName || "Not assigned",
        therapistEmail: childFallbackData.therapistEmail || "N/A",
        therapistContact: childFallbackData.therapistContact || "N/A",
        therapistId: childFallbackData.therapistId || "N/A",
        therapistImageUrl: childFallbackData.therapistImageUrl || "",
        slmcNumber: "N/A",
        experience: "N/A",
        specialization: "N/A",
        availableOnline: false,
      };

      setTherapistProfile(fallbackTherapist);
      return fallbackTherapist;
    }
  };

  const handleViewChild = async (child) => {
    try {
      setSelectedChild(child);

      const sessionsQuery = query(
        collection(db, "sessions"),
        where("childId", "==", child.id)
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

      let progressPayload = null;

      if (sortedSessions.length > 0) {
        const totalScore = sortedSessions.reduce(
          (sum, session) => sum + Number(session.overallScore || 0),
          0
        );

        const avgProgress = Math.round(totalScore / sortedSessions.length);
        const latestSession = sortedSessions[sortedSessions.length - 1];

        const totalCompletedItems = sortedSessions.reduce(
          (sum, session) => sum + Number(session.attemptedItems || 0),
          0
        );

        const totalItems = sortedSessions.reduce(
          (sum, session) =>
            sum +
            Number(
              session.totalItems ||
                session.totalLevelItems ||
                session.assignedItemsCount ||
                session.attemptedItems ||
                0
            ),
          0
        );

        progressPayload = {
          overallProgress: avgProgress,
          currentMode:
            latestSession.sessionMode ||
            latestSession.mode ||
            latestSession.currentMode ||
            "Therapy",
          totalCompletedItems,
          totalItems,
        };
      }

      setReportData(progressPayload);

      const timelineSnap = await getDocs(
        collection(db, "children", child.id, "timeline")
      );

      const timelineData = timelineSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        })
        .slice(0, 5);

      setRecentTimeline(timelineData);

      await fetchLatestTherapistProfile(child.therapistUid, child);

      setEditChildForm({
        childName: child.childName || "",
        age: child.age || "",
        gender: child.gender || "",
      });

      setEditChildImagePreview(child.childImageUrl || "");
      setEditChildImageFile(null);
      setEditingChild(false);
      setShowDetailsModal(true);
    } catch (error) {
      console.error("Error loading child details:", error);
      showMessage("❌ Failed to load child details.");
    }
  };

  const handleChildFormChange = (e) => {
    const { name, value } = e.target;
    setChildForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditChildForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleChildImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setChildImageFile(file);
    setChildImagePreview(URL.createObjectURL(file));
  };

  const handleEditChildImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setEditChildImageFile(file);
    setEditChildImagePreview(URL.createObjectURL(file));
  };

  const handleAddChild = async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
      showMessage("❌ Parent account not found.");
      return;
    }

    if (!childForm.childName.trim()) {
      showMessage("❌ Please enter child name.");
      return;
    }

    if (!childForm.age) {
      showMessage("❌ Please enter child age.");
      return;
    }

    if (!childForm.gender) {
      showMessage("❌ Please select child gender.");
      return;
    }

    if (!childImageFile) {
      showMessage("❌ Please choose a child image.");
      return;
    }

    try {
      setSavingChild(true);

      const parentRef = doc(db, "parents", user.uid);
      const parentSnap = await getDoc(parentRef);
      const parentData = parentSnap.exists() ? parentSnap.data() : {};

      const generatedChildCode = await generateChildCodeFromCounter();

      const fileName = `${Date.now()}-${childImageFile.name}`;
      const storageRef = ref(storage, `children/${user.uid}/${fileName}`);

      await uploadBytes(storageRef, childImageFile);
      const childImageUrl = await getDownloadURL(storageRef);

      const childRef = await addDoc(collection(db, "children"), {
        childName: childForm.childName.trim(),
        childCode: generatedChildCode,
        age: Number(childForm.age),
        gender: childForm.gender,
        childImageUrl,

        parentUid: user.uid,
        parentName: parentData.name || "Parent",
        parentEmail: parentData.email || user.email || "",
        parentId: parentData.parentId || "",
        parentContact: parentData.contact || parentData.phone || "",

        therapistUid: "",
        therapistName: "",
        therapistEmail: "",
        therapistContact: "",
        therapistId: "",
        therapistImageUrl: "",

        diagnosisCategory: "",
        diagnosisNotes: "",

        assignedLevelId: "",
        assignedLevelName: "",

        deviceAssigned: false,
        deviceId: "",
        deviceCode: "",
        deviceName: "",
        deviceStatus: "Not Assigned",

        todaySessionCount: 0,
        lastSessionDate: "",

        status: "active",
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "children", childRef.id, "timeline"), {
        title: "Child profile created",
        description: `${childForm.childName.trim()} was added by parent with code ${generatedChildCode}.`,
        createdAt: serverTimestamp(),
      });

      setChildForm({
        childName: "",
        age: "",
        gender: "",
      });
      setChildImageFile(null);
      setChildImagePreview("");
      setShowAddChildForm(false);

      const imageInput = document.getElementById("childImageUpload");
      if (imageInput) imageInput.value = "";

      showMessage("✅ Child added successfully.");
      await fetchChildren();
    } catch (error) {
      console.error("Error adding child:", error);
      showMessage("❌ Failed to add child.");
    } finally {
      setSavingChild(false);
    }
  };

  const handleUpdateChild = async (e) => {
    e.preventDefault();

    if (!selectedChild) {
      showMessage("❌ No child selected.");
      return;
    }

    if (!editChildForm.childName.trim()) {
      showMessage("❌ Please enter child name.");
      return;
    }

    if (!editChildForm.age) {
      showMessage("❌ Please enter child age.");
      return;
    }

    if (!editChildForm.gender) {
      showMessage("❌ Please select child gender.");
      return;
    }

    try {
      setUpdatingChild(true);

      let updatedImageUrl = selectedChild.childImageUrl || "";

      if (editChildImageFile) {
        const user = auth.currentUser;
        const fileName = `${Date.now()}-${editChildImageFile.name}`;
        const storageRef = ref(storage, `children/${user.uid}/${fileName}`);
        await uploadBytes(storageRef, editChildImageFile);
        updatedImageUrl = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, "children", selectedChild.id), {
        childName: editChildForm.childName.trim(),
        age: Number(editChildForm.age),
        gender: editChildForm.gender,
        childImageUrl: updatedImageUrl,
      });

      await addDoc(collection(db, "children", selectedChild.id, "timeline"), {
        title: "Child profile updated",
        description: `${editChildForm.childName.trim()}'s information was updated by parent.`,
        createdAt: serverTimestamp(),
      });

      showMessage("✅ Child information updated successfully.");
      setEditingChild(false);
      await fetchChildren();

      const updatedChildDoc = await getDoc(doc(db, "children", selectedChild.id));
      if (updatedChildDoc.exists()) {
        await handleViewChild({
          id: updatedChildDoc.id,
          ...updatedChildDoc.data(),
        });
      }
    } catch (error) {
      console.error("Error updating child:", error);
      showMessage("❌ Failed to update child.");
    } finally {
      setUpdatingChild(false);
    }
  };

  const getTodaySessionCount = async (child) => {
    const todayKey = getTodayKey();

    try {
      const dailyUsageRef = doc(db, "children", child.id, "dailyUsage", todayKey);
      const dailyUsageSnap = await getDoc(dailyUsageRef);

      if (dailyUsageSnap.exists()) {
        const dailyData = dailyUsageSnap.data();
        return Number(dailyData.sessionCount || 0);
      }
    } catch (error) {
      console.log("No dailyUsage doc found, using fallback fields.");
    }

    if (child.lastSessionDate === todayKey) {
      return Number(child.todaySessionCount || 0);
    }

    return 0;
  };

  const checkDeviceAccessRules = async (child) => {
  if (!child) {
    return { allowed: false, reason: "Child not selected." };
  }

  let latestChild = { ...child };
  let childDeviceData = null;

  try {
    const childDeviceSnap = await getDoc(
      doc(db, "children", child.id, "device", "current")
    );

    if (childDeviceSnap.exists()) {
      childDeviceData = childDeviceSnap.data();

      latestChild = {
        ...latestChild,
        deviceAssigned: true,
        deviceId:
          latestChild.deviceId ||
          childDeviceData.deviceId ||
          childDeviceData.deviceCode ||
          "",
        deviceCode:
          latestChild.deviceCode ||
          childDeviceData.deviceCode ||
          childDeviceData.deviceId ||
          "",
        deviceName:
          latestChild.deviceName || childDeviceData.deviceName || "",
        deviceStatus:
          latestChild.deviceStatus || childDeviceData.deviceStatus || "Assigned",
      };
    }
  } catch (error) {
    console.error("Error reading child device path:", error);
  }

  if (
    !latestChild.deviceAssigned &&
    !latestChild.deviceId &&
    !latestChild.deviceCode
  ) {
    return {
      allowed: false,
      reason: "No device is assigned to this child.",
    };
  }

  if (!latestChild.deviceId && !latestChild.deviceCode) {
    return {
      allowed: false,
      reason: "Assigned device information is incomplete.",
    };
  }

  if (
    latestChild.deviceStatus &&
    !["Assigned", "Active", "Ready"].includes(latestChild.deviceStatus)
  ) {
    return {
      allowed: false,
      reason: `Device cannot be opened because status is ${latestChild.deviceStatus}.`,
    };
  }

  if (!latestChild.therapistUid) {
    return {
      allowed: false,
      reason: "A therapist must be assigned before opening the device.",
    };
  }

  if (!latestChild.assignedLevelId && !latestChild.assignedLevelName) {
    return {
      allowed: false,
      reason: "A therapy level must be assigned before opening the device.",
    };
  }

  const planSnap = await getDoc(doc(db, "therapyPlans", child.id));
  const latestPlan = planSnap.exists() ? planSnap.data() : null;

  if (!latestPlan) {
    return {
      allowed: false,
      reason: "No therapy plan found for this child.",
    };
  }

  const maxSessionsPerDay = Number(latestPlan.maxSessionsPerDay || 0);
  const lockTherapyAfterLimit = !!latestPlan.lockTherapyAfterLimit;
  const fallbackMode = latestPlan.fallbackMode || "companion";

  const todaySessionCount = await getTodaySessionCount(latestChild);

  if (
    maxSessionsPerDay > 0 &&
    todaySessionCount >= maxSessionsPerDay &&
    lockTherapyAfterLimit
  ) {
    return {
      allowed: false,
      reason: `Daily therapy limit reached. Allowed sessions: ${maxSessionsPerDay}. Fallback mode: ${fallbackMode}.`,
    };
  }

  const inAllowedTime = isWithinTherapyTime(
    latestPlan.therapyStartTime,
    latestPlan.therapyEndTime
  );

  if (!inAllowedTime) {
    return {
      allowed: false,
      reason: `Device can only be opened during therapy time (${latestPlan.therapyStartTime || "--"} - ${latestPlan.therapyEndTime || "--"}).`,
    };
  }

  return {
    allowed: true,
    reason: "Device access granted.",
    therapyPlanData: latestPlan,
    todaySessionCount,
    latestChild,
  };
};

  const handleOpenDevice = async (child) => {
  try {
    const latestChildSnap = await getDoc(doc(db, "children", child.id));

    if (!latestChildSnap.exists()) {
      showMessage("❌ Child record not found.");
      return;
    }

    const latestChild = {
      id: latestChildSnap.id,
      ...latestChildSnap.data(),
    };

    const result = await checkDeviceAccessRules(latestChild);

    if (!result.allowed) {
      showMessage(`⚠️ ${result.reason}`);
      return;
    }

    const finalChild = result.latestChild || latestChild;

    showMessage("✅ Opening assigned device...");

    navigate(`/parent/device/${finalChild.deviceId || finalChild.deviceCode}`, {
      state: {
        childId: finalChild.id,
        childName: finalChild.childName,
        childCode: finalChild.childCode,
        deviceId: finalChild.deviceId || finalChild.deviceCode,
        deviceCode: finalChild.deviceCode || finalChild.deviceId,
        deviceName: finalChild.deviceName || "Assigned Device",
        therapistUid: finalChild.therapistUid || "",
        assignedLevelId: finalChild.assignedLevelId || "",
        therapyPlan: result.therapyPlanData || null,
      },
    });
  } catch (error) {
    console.error("Error opening device:", error);
    showMessage("❌ Failed to open assigned device.");
  }
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

  return (
    <div className="child-info-page">
      <ParentNavbar />

      <div className="child-info-container">
        <div className="page-header child-header-row">
          <div>
            <h1>Child Information</h1>
            <p>
              Manage children, view full profiles, update child info, and open
              assigned devices safely.
            </p>
          </div>

          <button
            className="add-child-btn"
            onClick={() => setShowAddChildForm(!showAddChildForm)}
          >
            {showAddChildForm ? "Close Form" : "+ Add Child"}
          </button>
        </div>

        {message && <div className="message-box">{message}</div>}

        {showAddChildForm && (
          <div className="info-card add-child-form-card glass-card">
            <div className="section-head">
              <h2>Add New Child</h2>
              <p>Create a new child profile with image and basic details.</p>
            </div>

            <form className="add-child-form" onSubmit={handleAddChild}>
              <div className="form-grid">
                <input
                  type="text"
                  name="childName"
                  placeholder="Child Name"
                  value={childForm.childName}
                  onChange={handleChildFormChange}
                />

                <input
                  type="number"
                  name="age"
                  placeholder="Age"
                  min="1"
                  value={childForm.age}
                  onChange={handleChildFormChange}
                />

                <select
                  name="gender"
                  value={childForm.gender}
                  onChange={handleChildFormChange}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="image-upload-section">
                <label className="image-upload-label" htmlFor="childImageUpload">
                  Choose Image
                </label>

                <input
                  id="childImageUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleChildImageChange}
                  className="image-upload-input"
                />

                {childImagePreview && (
                  <div className="preview-wrap">
                    <img
                      src={childImagePreview}
                      alt="Child Preview"
                      className="image-preview"
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="save-child-btn"
                disabled={savingChild}
              >
                {savingChild ? "Saving..." : "Save Child"}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div className="info-state-card">Loading child information...</div>
        ) : childrenList.length === 0 ? (
          <div className="info-state-card empty-state-card">
            <div className="empty-icon">🧸</div>
            <h3>No children added yet</h3>
            <p>Click “Add Child” to create the first child profile.</p>
          </div>
        ) : (
          <div className="children-list-section">
            <div className="section-head">
              <h2>Children List</h2>
              <p>Select a child card and open more details.</p>
            </div>

            <div className="children-cards-grid">
              {childrenList.map((child) => (
                <div
                  className={`child-card-preview ${
                    selectedChild?.id === child.id ? "active-child-card" : ""
                  }`}
                  key={child.id}
                >
                  <div className="child-card-top">
                    {child.childImageUrl ? (
                      <img
                        src={child.childImageUrl}
                        alt={child.childName}
                        className="child-card-image"
                      />
                    ) : (
                      <div className="child-card-placeholder">🧒</div>
                    )}

                    <div className="child-status-badge">
                      {child.status || "active"}
                    </div>
                  </div>

                  <h3>{child.childName || "Child"}</h3>

                  <div className="child-mini-info">
                    <p>
                      <strong>Code</strong>
                      <span>{child.childCode || "N/A"}</span>
                    </p>
                    <p>
                      <strong>Age</strong>
                      <span>{child.age || "N/A"}</span>
                    </p>
                    <p>
                      <strong>Diagnosis</strong>
                      <span>{getDiagnosisLabel(child.diagnosisCategory)}</span>
                    </p>
                    <p>
                      <strong>Level</strong>
                      <span>{child.assignedLevelName || "Not assigned"}</span>
                    </p>
                  </div>

                  <div className="child-card-actions">
                    <button
                      className="view-more-btn"
                      onClick={() => handleViewChild(child)}
                    >
                      More
                    </button>

                    <button
                      className="card-open-device-btn"
                      onClick={() => handleOpenDevice(child)}
                    >
                      Open Device
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showDetailsModal && selectedChild && (
        <div
          className="details-modal-overlay"
          onClick={() => {
            setShowDetailsModal(false);
            setEditingChild(false);
          }}
        >
          <div
            className="details-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="details-modal-header">
              <div>
                <h2>Child Information</h2>
                <p>View complete child details and update profile information.</p>
              </div>

              <button
                className="close-modal-btn"
                onClick={() => {
                  setShowDetailsModal(false);
                  setEditingChild(false);
                }}
              >
                ✕
              </button>
            </div>

            {!editingChild ? (
              <>
                <div className="details-hero-card">
                  <div className="details-hero-left">
                    {selectedChild.childImageUrl ? (
                      <img
                        src={selectedChild.childImageUrl}
                        alt={selectedChild.childName}
                        className="details-child-photo"
                      />
                    ) : (
                      <div className="details-child-photo placeholder">🧒</div>
                    )}

                    <div className="details-hero-text">
                      <h3>{selectedChild.childName || "Child"}</h3>
                      <p>
                        <strong>Child Code:</strong> {selectedChild.childCode || "N/A"}
                      </p>
                      <p>
                        <strong>Age:</strong> {selectedChild.age || "N/A"}
                      </p>
                      <p>
                        <strong>Gender:</strong> {selectedChild.gender || "N/A"}
                      </p>
                      <p>
                        <strong>Diagnosis:</strong> {getDiagnosisLabel(selectedChild.diagnosisCategory)}
                      </p>
                      <p>
                        <strong>Status:</strong> {selectedChild.status || "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="details-hero-actions">
                    <button
                      className="edit-child-btn"
                      onClick={() => setEditingChild(true)}
                    >
                      Edit Child Info
                    </button>

                    <button
                      className="open-device-btn"
                      onClick={() => handleOpenDevice(selectedChild)}
                    >
                      Open Device
                    </button>
                  </div>
                </div>

                <div className="details-grid">
                  <div className="info-card">
                    <h3>Diagnosis Details</h3>
                    <p>
                      <strong>Diagnosis Path:</strong>{" "}
                      {getDiagnosisLabel(selectedChild.diagnosisCategory)}
                    </p>
                    <p>
                      <strong>Therapist Notes:</strong>{" "}
                      {selectedChild.diagnosisNotes || "No diagnosis notes added yet"}
                    </p>
                  </div>

                  <div className="info-card">
                    <h3>Assigned Level</h3>
                    <p>
                      <strong>Level:</strong>{" "}
                      {selectedChild.assignedLevelName || "Not assigned"}
                    </p>
                    <p>
                      <strong>Current Progress:</strong>{" "}
                      {reportData?.overallProgress ?? 0}%
                    </p>
                    <p>
                      <strong>Current Mode:</strong>{" "}
                      {reportData?.currentMode || "N/A"}
                    </p>
                    <p>
                      <strong>Completed Items:</strong>{" "}
                      {reportData?.totalCompletedItems ?? 0}/
                      {reportData?.totalItems ?? 0}
                    </p>    
                  </div>

                  <div className="info-card">
                    <h3>Assigned Therapist</h3>
                    <p>
                      <strong>Name:</strong>{" "}
                      {therapistProfile?.therapistName || selectedChild.therapistName || "Not assigned"}
                    </p>
                    <p>
                      <strong>Therapist ID:</strong>{" "}
                      {therapistProfile?.therapistId || selectedChild.therapistId || "N/A"}
                    </p>
                    <p>
                      <strong>Email:</strong>{" "}
                      {therapistProfile?.therapistEmail || selectedChild.therapistEmail || "N/A"}
                    </p>
                    <p>
                      <strong>Contact:</strong>{" "}
                      {therapistProfile?.therapistContact || selectedChild.therapistContact || "N/A"}
                    </p>
                    <p>
                      <strong>SLMC Number:</strong>{" "}
                      {therapistProfile?.slmcNumber || "N/A"}
                    </p>
                    <p>
                      <strong>Specialization:</strong>{" "}
                      {therapistProfile?.specialization || "N/A"}
                    </p>
                  </div>

                  <div className="info-card">
                    <h3>Parent Link</h3>
                    <p>
                      <strong>Parent Name:</strong>{" "}
                      {selectedChild.parentName || "N/A"}
                    </p>
                    <p>
                      <strong>Parent ID:</strong>{" "}
                      {selectedChild.parentId || "N/A"}
                    </p>
                    <p>
                      <strong>Email:</strong>{" "}
                      {selectedChild.parentEmail || "N/A"}
                    </p>
                    <p>
                      <strong>Contact:</strong>{" "}
                      {selectedChild.parentContact || "N/A"}
                    </p>
                  </div>

                  <div className="info-card">
                    <h3>Assigned Device</h3>
                    <p>
                      <strong>Assigned:</strong>{" "}
                      {selectedChild.deviceAssigned ? "Yes" : "No"}
                    </p>
                    <p>
                      <strong>Device ID:</strong>{" "}
                      {selectedChild.deviceId || "N/A"}
                    </p>
                    <p>
                      <strong>Device Code:</strong>{" "}
                      {selectedChild.deviceCode || "N/A"}
                    </p>
                    <p>
                      <strong>Device Name:</strong>{" "}
                      {selectedChild.deviceName || "N/A"}
                    </p>
                    <p>
                      <strong>Status:</strong>{" "}
                      {selectedChild.deviceStatus || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="info-card timeline-card">
                  <h3>Recent Updates</h3>

                  {recentTimeline.length === 0 ? (
                    <p className="empty-text">No recent updates yet.</p>
                  ) : (
                    <div className="timeline-list">
                      {recentTimeline.map((item) => (
                        <div className="timeline-item" key={item.id}>
                          <div className="timeline-dot"></div>
                          <div className="timeline-content">
                            <h4>{item.title || "Update"}</h4>
                            <p>
                              {item.description || "No description available."}
                            </p>
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="info-card edit-child-card">
                <div className="section-head">
                  <h3>Edit Child Information</h3>
                  <p>Update basic child details without changing the rest of the page flow.</p>
                </div>

                <form className="add-child-form" onSubmit={handleUpdateChild}>
                  <div className="form-grid">
                    <input
                      type="text"
                      name="childName"
                      placeholder="Child Name"
                      value={editChildForm.childName}
                      onChange={handleEditFormChange}
                    />

                    <input
                      type="number"
                      name="age"
                      placeholder="Age"
                      min="1"
                      value={editChildForm.age}
                      onChange={handleEditFormChange}
                    />

                    <select
                      name="gender"
                      value={editChildForm.gender}
                      onChange={handleEditFormChange}
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div className="image-upload-section">
                    <label className="image-upload-label" htmlFor="editChildImageUpload">
                      Change Image
                    </label>

                    <input
                      id="editChildImageUpload"
                      type="file"
                      accept="image/*"
                      onChange={handleEditChildImageChange}
                      className="image-upload-input"
                    />

                    {editChildImagePreview && (
                      <div className="preview-wrap">
                        <img
                          src={editChildImagePreview}
                          alt="Child Preview"
                          className="image-preview"
                        />
                      </div>
                    )}
                  </div>

                  <div className="edit-actions-row">
                    <button
                      type="button"
                      className="cancel-edit-btn"
                      onClick={() => {
                        setEditingChild(false);
                        setEditChildForm({
                          childName: selectedChild.childName || "",
                          age: selectedChild.age || "",
                          gender: selectedChild.gender || "",
                        });
                        setEditChildImagePreview(selectedChild.childImageUrl || "");
                        setEditChildImageFile(null);
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="save-child-btn"
                      disabled={updatingChild}
                    >
                      {updatingChild ? "Updating..." : "Update Child"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChildInfo;