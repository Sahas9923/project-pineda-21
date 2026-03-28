import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";

const DevicePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { deviceId: routeDeviceId } = useParams();

  const stateData = location.state || {};

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [childData, setChildData] = useState(null);
  const [therapyPlan, setTherapyPlan] = useState(null);
  const [levelData, setLevelData] = useState(null);
  const [items, setItems] = useState([]);

  const [selectedMode, setSelectedMode] = useState("therapy");
  const [therapyAllowed, setTherapyAllowed] = useState(true);
  const [therapyReason, setTherapyReason] = useState("");

  const [currentIndex, setCurrentIndex] = useState(0);

  const resolvedDeviceId =
    stateData.deviceId || stateData.deviceCode || routeDeviceId || "";

  const childId = stateData.childId || "";
  const assignedLevelId = stateData.assignedLevelId || "";

  const currentItem = items[currentIndex] || null;

  const getTodayKey = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  };

  const getTodaySessionCount = async (child) => {
    const todayKey = getTodayKey();

    try {
      const dailyUsageRef = doc(db, "children", child.id, "dailyUsage", todayKey);
      const dailyUsageSnap = await getDoc(dailyUsageRef);

      if (dailyUsageSnap.exists()) {
        return Number(dailyUsageSnap.data().sessionCount || 0);
      }
    } catch (error) {
      console.log("dailyUsage fallback:", error);
    }

    if (child.lastSessionDate === todayKey) {
      return Number(child.todaySessionCount || 0);
    }

    return 0;
  };

  const checkTherapyPlanRules = async (child, plan) => {
    if (!child) {
      return {
        therapyAllowed: false,
        selectedMode: "companion",
        reason: "Child data not found.",
      };
    }

    if (!plan) {
      return {
        therapyAllowed: false,
        selectedMode: "companion",
        reason: "Therapy plan not found.",
      };
    }

    const todaySessionCount = await getTodaySessionCount(child);
    const maxSessionsPerDay = Number(plan.maxSessionsPerDay || 0);
    const lockTherapyAfterLimit = !!plan.lockTherapyAfterLimit;
    const minimumGapBetweenSessionsMinutes = Number(
      plan.minimumGapBetweenSessionsMinutes || 0
    );

    const modesAllowed = Array.isArray(plan.modesAllowed)
      ? plan.modesAllowed
      : ["therapy"];

    const fallbackMode = modesAllowed.includes("companion")
      ? "companion"
      : "therapy";

    if (
      maxSessionsPerDay > 0 &&
      todaySessionCount >= maxSessionsPerDay &&
      lockTherapyAfterLimit
    ) {
      return {
        therapyAllowed: false,
        selectedMode: fallbackMode,
        reason: `Daily therapy limit reached (${todaySessionCount}/${maxSessionsPerDay}).`,
      };
    }

    if (child.lastSessionAt?.seconds && minimumGapBetweenSessionsMinutes > 0) {
      const lastTime = new Date(child.lastSessionAt.seconds * 1000);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastTime) / (1000 * 60));

      if (diffMinutes < minimumGapBetweenSessionsMinutes) {
        return {
          therapyAllowed: false,
          selectedMode: fallbackMode,
          reason: `Please wait ${minimumGapBetweenSessionsMinutes - diffMinutes} more minute(s) before therapy mode.`,
        };
      }
    }

    if (!modesAllowed.includes("therapy")) {
      return {
        therapyAllowed: false,
        selectedMode: fallbackMode,
        reason: "Therapy mode is not allowed in this plan.",
      };
    }

    return {
      therapyAllowed: true,
      selectedMode: "therapy",
      reason: "",
    };
  };

  const loadDeviceData = async () => {
    try {
      setLoading(true);

      if (!childId) {
        showMessage("❌ Missing child information.");
        setLoading(false);
        return;
      }

      if (!assignedLevelId) {
        showMessage("❌ Missing assigned level.");
        setLoading(false);
        return;
      }

      const childRef = doc(db, "children", childId);
      const childSnap = await getDoc(childRef);

      if (!childSnap.exists()) {
        showMessage("❌ Child record not found.");
        setLoading(false);
        return;
      }

      const child = { id: childSnap.id, ...childSnap.data() };
      setChildData(child);

      const planRef = doc(db, "therapyPlans", childId);
      const planSnap = await getDoc(planRef);
      const plan = planSnap.exists() ? planSnap.data() : null;
      setTherapyPlan(plan);

      const levelRef = doc(db, "levels", assignedLevelId);
      const levelSnap = await getDoc(levelRef);

      if (!levelSnap.exists()) {
        showMessage("❌ Assigned level not found.");
        setLoading(false);
        return;
      }

      const level = { id: levelSnap.id, ...levelSnap.data() };
      setLevelData(level);

      const itemsQuery = query(collection(db, "levels", assignedLevelId, "items"));
      const itemsSnap = await getDocs(itemsQuery);

      const loadedItems = itemsSnap.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ...itemDoc.data(),
      }));

      setItems(loadedItems);

      const ruleResult = await checkTherapyPlanRules(child, plan);
      setTherapyAllowed(ruleResult.therapyAllowed);
      setTherapyReason(ruleResult.reason);
      setSelectedMode(ruleResult.selectedMode);

      if (!loadedItems.length) {
        showMessage("⚠️ No items found for this level.");
      }
    } catch (error) {
      console.error("Error loading device data:", error);
      showMessage("❌ Failed to load device data.");
    } finally {
      setLoading(false);
    }
  };

  const startSessionTracking = async () => {
    try {
      if (!childData || selectedMode !== "therapy") return;

      const todayKey = getTodayKey();
      const dailyUsageRef = doc(db, "children", childData.id, "dailyUsage", todayKey);

      const currentCount = await getTodaySessionCount(childData);

      await setDoc(
        dailyUsageRef,
        {
          sessionCount: currentCount + 1,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "children", childData.id),
        {
          todaySessionCount: currentCount + 1,
          lastSessionDate: todayKey,
          lastSessionAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error starting session tracking:", error);
    }
  };

  useEffect(() => {
    loadDeviceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, assignedLevelId]);

  const totalItems = useMemo(() => items.length, [items]);
  const currentProgress = useMemo(() => {
    if (!totalItems) return 0;
    return Math.round(((currentIndex + 1) / totalItems) * 100);
  }, [currentIndex, totalItems]);

  const handleStartTherapy = async () => {
    if (!therapyAllowed) {
      showMessage(`⚠️ ${therapyReason || "Therapy mode is not allowed."}`);
      return;
    }

    await startSessionTracking();
    showMessage("✅ Therapy mode started.");
  };

  const handleNextItem = () => {
    if (currentIndex + 1 >= items.length) {
      showMessage("✅ Session items completed.");
      return;
    }
    setCurrentIndex((prev) => prev + 1);
  };

  const handlePreviousItem = () => {
    if (currentIndex === 0) return;
    setCurrentIndex((prev) => prev - 1);
  };

  if (loading) {
    return <div style={pageStyle}>Loading device...</div>;
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1>Assigned Device</h1>
          <p>Level-based item loading for the selected child</p>
        </div>

        <button onClick={() => navigate(-1)} style={backBtnStyle}>
          Back
        </button>
      </div>

      {message && <div style={messageStyle}>{message}</div>}

      <div style={gridStyle}>
        <div style={cardStyle}>
          <h2>Child Info</h2>
          <p><strong>Name:</strong> {childData?.childName || "N/A"}</p>
          <p><strong>Child Code:</strong> {childData?.childCode || "N/A"}</p>
          <p><strong>Device:</strong> {resolvedDeviceId || "N/A"}</p>
          <p><strong>Assigned Level:</strong> {childData?.assignedLevelName || levelData?.title || "N/A"}</p>
        </div>

        <div style={cardStyle}>
          <h2>Therapy Plan</h2>
          <p><strong>Max Sessions / Day:</strong> {therapyPlan?.maxSessionsPerDay ?? "N/A"}</p>
          <p><strong>Session Duration:</strong> {therapyPlan?.sessionDurationMinutes ?? "N/A"} mins</p>
          <p><strong>Min Gap:</strong> {therapyPlan?.minimumGapBetweenSessionsMinutes ?? 0} mins</p>
          <p><strong>Modes Allowed:</strong> {(therapyPlan?.modesAllowed || []).join(", ") || "N/A"}</p>
          <p><strong>Current Mode:</strong> {selectedMode}</p>
          <p><strong>Therapy Allowed:</strong> {therapyAllowed ? "Yes" : "No"}</p>
          {!therapyAllowed && (
            <p style={{ color: "#c0392b" }}>
              <strong>Reason:</strong> {therapyReason}
            </p>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <h2>Level Details</h2>
        <p><strong>Title:</strong> {levelData?.title || "N/A"}</p>
        <p><strong>Description:</strong> {levelData?.description || "N/A"}</p>
        <p><strong>Total Items:</strong> {items.length}</p>
      </div>

      <div style={cardStyle}>
        <h2>Mode Control</h2>

        {therapyPlan?.modeSelectionAtDevice ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(therapyPlan?.modesAllowed || []).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (mode === "therapy" && !therapyAllowed) {
                    showMessage(`⚠️ ${therapyReason}`);
                    return;
                  }
                  setSelectedMode(mode);
                }}
                style={{
                  ...modeBtnStyle,
                  background: selectedMode === mode ? "#2ec4b6" : "#dfe9e8",
                  color: selectedMode === mode ? "#fff" : "#222",
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        ) : (
          <p>Mode selection is fixed by therapy plan.</p>
        )}

        <div style={{ marginTop: 16 }}>
          <button onClick={handleStartTherapy} style={mainBtnStyle}>
            Start {selectedMode}
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <h2>Current Item</h2>

        {!currentItem ? (
          <p>No items available for this level.</p>
        ) : (
          <>
            <p><strong>Item:</strong> {currentIndex + 1} / {items.length}</p>
            <p><strong>Type:</strong> {currentItem.type || "N/A"}</p>
            <p><strong>Text:</strong> {currentItem.text || "N/A"}</p>

            {currentItem.imageUrl ? (
              <div style={{ marginTop: 16 }}>
                <img
                  src={currentItem.imageUrl}
                  alt={currentItem.text || "Level item"}
                  style={{
                    width: "260px",
                    maxWidth: "100%",
                    borderRadius: "12px",
                    border: "1px solid #ddd",
                  }}
                />
              </div>
            ) : (
              <p style={{ marginTop: 16 }}>No image found for this item.</p>
            )}

            <div style={{ marginTop: 20 }}>
              <strong>Progress:</strong> {currentProgress}%
              <div style={progressOuterStyle}>
                <div
                  style={{
                    ...progressInnerStyle,
                    width: `${currentProgress}%`,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button onClick={handlePreviousItem} style={secondaryBtnStyle}>
                Previous
              </button>
              <button onClick={handleNextItem} style={mainBtnStyle}>
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const pageStyle = {
  maxWidth: "1000px",
  margin: "0 auto",
  padding: "24px",
  fontFamily: "Arial, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "16px",
  marginBottom: "16px",
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #e2e2e2",
  borderRadius: "12px",
  padding: "18px",
  marginBottom: "16px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const messageStyle = {
  marginBottom: "16px",
  padding: "12px 14px",
  background: "#eefaf8",
  border: "1px solid #bce9e2",
  borderRadius: "10px",
};

const mainBtnStyle = {
  padding: "11px 18px",
  borderRadius: "8px",
  border: "none",
  background: "#2ec4b6",
  color: "#fff",
  cursor: "pointer",
};

const secondaryBtnStyle = {
  padding: "11px 18px",
  borderRadius: "8px",
  border: "none",
  background: "#6c7a89",
  color: "#fff",
  cursor: "pointer",
};

const backBtnStyle = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "none",
  background: "#222",
  color: "#fff",
  cursor: "pointer",
};

const modeBtnStyle = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "none",
  cursor: "pointer",
};

const progressOuterStyle = {
  width: "100%",
  height: "14px",
  background: "#e8e8e8",
  borderRadius: "999px",
  marginTop: "8px",
  overflow: "hidden",
};

const progressInnerStyle = {
  height: "100%",
  background: "#2ec4b6",
  borderRadius: "999px",
};

export default DevicePage;