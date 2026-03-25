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
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const ChildInfo = () => {
  const navigate = useNavigate();

  const [childrenList, setChildrenList] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [therapyPlan, setTherapyPlan] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [recentTimeline, setRecentTimeline] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  const [savingChild, setSavingChild] = useState(false);
  const [message, setMessage] = useState("");

  const [childForm, setChildForm] = useState({
    childName: "",
    age: "",
    gender: "",
  });

  const [childImageFile, setChildImageFile] = useState(null);
  const [childImagePreview, setChildImagePreview] = useState("");

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
        parentName: childDoc.data().parentName || parentData.name || "Parent",
        parentEmail:
          childDoc.data().parentEmail || parentData.email || user.email || "",
        parentId: childDoc.data().parentId || parentData.parentId || "",
        parentContact: childDoc.data().parentContact || parentData.phone || "",
      }));

      setChildrenList(children);

      if (children.length > 0) {
        await handleViewChild(children[0]);
      } else {
        setSelectedChild(null);
        setTherapyPlan(null);
        setReportData(null);
        setRecentTimeline([]);
      }
    } catch (error) {
      console.error("Error fetching children:", error);
      showMessage("❌ Failed to load children.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewChild = async (child) => {
    try {
      setSelectedChild(child);

      const planSnap = await getDoc(doc(db, "therapyPlans", child.id));
      setTherapyPlan(planSnap.exists() ? planSnap.data() : null);

      const reportSnap = await getDoc(
        doc(db, "children", child.id, "report", "main")
      );
      setReportData(reportSnap.exists() ? reportSnap.data() : null);

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

  const handleChildImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setChildImageFile(file);
    setChildImagePreview(URL.createObjectURL(file));
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
        parentContact: parentData.phone || "",

        therapistUid: "",
        therapistName: "",
        therapistEmail: "",
        therapistContact: "",
        therapistId: "",
        therapistImageUrl: "",

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

    if (!child.deviceAssigned) {
      return {
        allowed: false,
        reason: "No device is assigned to this child.",
      };
    }

    if (!child.deviceId && !child.deviceCode) {
      return {
        allowed: false,
        reason: "Assigned device information is incomplete.",
      };
    }

    if (
      child.deviceStatus &&
      !["Assigned", "Active", "Ready"].includes(child.deviceStatus)
    ) {
      return {
        allowed: false,
        reason: `Device cannot be opened because status is ${child.deviceStatus}.`,
      };
    }

    if (!child.therapistUid) {
      return {
        allowed: false,
        reason: "A therapist must be assigned before opening the device.",
      };
    }

    if (!child.assignedLevelId && !child.assignedLevelName) {
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

    const todaySessionCount = await getTodaySessionCount(child);

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
    };
  };

  const handleOpenDevice = async (child) => {
    try {
      const result = await checkDeviceAccessRules(child);

      if (!result.allowed) {
        showMessage(`⚠️ ${result.reason}`);
        return;
      }

      showMessage("✅ Opening assigned device...");

      navigate(`/parent/device/${child.deviceId || child.deviceCode}`, {
        state: {
          childId: child.id,
          childName: child.childName,
          childCode: child.childCode,
          deviceId: child.deviceId || child.deviceCode,
          deviceCode: child.deviceCode || child.deviceId,
          deviceName: child.deviceName || "Assigned Device",
          therapistUid: child.therapistUid || "",
          assignedLevelId: child.assignedLevelId || "",
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
              Add children, view all child cards, open full details, and access
              the assigned device safely.
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
          <div className="info-card add-child-form-card">
            <h2>Add New Child</h2>

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
          <div className="info-state-card">No children added yet.</div>
        ) : (
          <>
            <div className="children-cards-grid">
              {childrenList.map((child) => (
                <div
                  className={`child-card-preview ${
                    selectedChild?.id === child.id ? "active-child-card" : ""
                  }`}
                  key={child.id}
                >
                  {child.childImageUrl ? (
                    <img
                      src={child.childImageUrl}
                      alt={child.childName}
                      className="child-card-image"
                    />
                  ) : (
                    <div className="child-card-placeholder">🧒</div>
                  )}

                  <h3>{child.childName || "Child"}</h3>

                  <p>
                    <strong>Code:</strong> {child.childCode || "N/A"}
                  </p>

                  <p>
                    <strong>Age:</strong> {child.age || "N/A"}
                  </p>

                  <p>
                    <strong>Level:</strong>{" "}
                    {child.assignedLevelName || "Not assigned"}
                  </p>

                  <button
                    className="view-more-btn"
                    onClick={() => handleViewChild(child)}
                  >
                    View More
                  </button>
                </div>
              ))}
            </div>

            {selectedChild && (
              <>
                <div className="child-top-grid">
                  <div className="info-card child-profile-card">
                    <div className="child-profile-top">
                      {selectedChild.childImageUrl ? (
                        <img
                          src={selectedChild.childImageUrl}
                          alt={selectedChild.childName}
                          className="child-photo"
                        />
                      ) : (
                        <div className="child-photo-placeholder">🧒</div>
                      )}

                      <div>
                        <h2>{selectedChild.childName || "Child"}</h2>
                        <p>
                          <strong>Child Code:</strong>{" "}
                          {selectedChild.childCode || "N/A"}
                        </p>
                        <p>
                          <strong>Age:</strong> {selectedChild.age || "N/A"}
                        </p>
                        <p>
                          <strong>Gender:</strong>{" "}
                          {selectedChild.gender || "N/A"}
                        </p>
                        <p>
                          <strong>Status:</strong>{" "}
                          {selectedChild.status || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="info-card assigned-level-card">
                    <h2>Assigned Level</h2>
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
                </div>

                <div className="child-middle-grid">
                  <div className="info-card therapist-card">
                    <h2>Assigned Therapist</h2>
                    <div className="therapist-section">
                      {selectedChild.therapistImageUrl ? (
                        <img
                          src={selectedChild.therapistImageUrl}
                          alt={selectedChild.therapistName}
                          className="therapist-photo"
                        />
                      ) : (
                        <div className="therapist-photo-placeholder">👩‍⚕️</div>
                      )}

                      <div className="therapist-text">
                        <p>
                          <strong>Name:</strong>{" "}
                          {selectedChild.therapistName || "Not assigned"}
                        </p>
                        <p>
                          <strong>Therapist ID:</strong>{" "}
                          {selectedChild.therapistId || "N/A"}
                        </p>
                        <p>
                          <strong>Email:</strong>{" "}
                          {selectedChild.therapistEmail || "N/A"}
                        </p>
                        <p>
                          <strong>Contact:</strong>{" "}
                          {selectedChild.therapistContact || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="info-card parent-link-card">
                    <h2>Parent Link</h2>
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
                </div>

                <div className="child-middle-grid">
                  <div className="info-card device-card">
                    <h2>Assigned Device</h2>
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

                    <button
                      className="open-device-btn"
                      onClick={() => handleOpenDevice(selectedChild)}
                    >
                      Open Device
                    </button>
                  </div>

                  <div className="info-card plan-card">
                    <h2>Therapy Plan</h2>
                    <p>
                      <strong>Maximum Sessions / Day:</strong>{" "}
                      {therapyPlan?.maxSessionsPerDay ?? "N/A"}
                    </p>
                    <p>
                      <strong>Session Duration:</strong>{" "}
                      {therapyPlan?.sessionDurationMinutes ?? "N/A"} mins
                    </p>
                    <p>
                      <strong>Therapy Time:</strong>{" "}
                      {therapyPlan?.therapyStartTime || "N/A"} -{" "}
                      {therapyPlan?.therapyEndTime || "N/A"}
                    </p>
                    <p>
                      <strong>After Limit:</strong>{" "}
                      {therapyPlan?.fallbackMode || "companion"}
                    </p>
                    <p>
                      <strong>Rule:</strong>{" "}
                      {therapyPlan?.lockTherapyAfterLimit
                        ? "Therapy mode locks after daily limit"
                        : "No lock rule"}
                    </p>
                  </div>
                </div>

                <div className="info-card recommendation-card">
                  <h2>Therapist Recommendation</h2>
                  <p>
                    <strong>Summary:</strong>{" "}
                    {reportData?.therapistSummary || "No summary yet"}
                  </p>
                  <p>
                    <strong>Recommendation:</strong>{" "}
                    {reportData?.overallRecommendation || "No recommendation yet"}
                  </p>
                  <p>
                    <strong>Home Advice:</strong>{" "}
                    {reportData?.homeAdvice || "No home advice yet"}
                  </p>
                  <p>
                    <strong>Strongest Area:</strong>{" "}
                    {reportData?.strongestArea || "N/A"}
                  </p>
                  <p>
                    <strong>Support Area:</strong>{" "}
                    {reportData?.supportArea || "N/A"}
                  </p>
                </div>

                <div className="info-card timeline-card">
                  <h2>Recent Updates</h2>

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
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ChildInfo;