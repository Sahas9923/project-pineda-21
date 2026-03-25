import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "../styles/DevicePage.css";
import { db } from "../firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const MAX_ATTEMPTS = 3;
const AUTO_RECORD_DELAY = 1200;
const AUTO_RETRY_DELAY = 2200;
const AUTO_NEXT_DELAY = 1500;
const RECORDING_LENGTH = 4000;
const TARGET_THRESHOLD = 45;

const DevicePage = () => {
  const { deviceId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const passedState = location.state || {};

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [childData, setChildData] = useState(null);
  const [deviceData, setDeviceData] = useState(null);
  const [therapyPlan, setTherapyPlan] = useState(null);
  const [levelData, setLevelData] = useState(null);
  const [items, setItems] = useState([]);

  const [selectedMode, setSelectedMode] = useState(null);
  const [therapyAllowed, setTherapyAllowed] = useState(true);
  const [therapyBlockedReason, setTherapyBlockedReason] = useState("");

  const [sessionNumber, setSessionNumber] = useState(1);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionDocId, setSessionDocId] = useState("");

  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [currentAttempts, setCurrentAttempts] = useState(1);

  const [currentItemProgress, setCurrentItemProgress] = useState({
    front: 0,
    middle: 0,
    end: 0,
    overall: 0,
  });

  const [recognizedText, setRecognizedText] = useState("");
  const [recording, setRecording] = useState(false);
  const [checkingAudio, setCheckingAudio] = useState(false);
  const [requestInFlight, setRequestInFlight] = useState(false);

  const [savedItemsCount, setSavedItemsCount] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [stepAlert, setStepAlert] = useState("Idle");
  const [stepType, setStepType] = useState("info");

  const [lastResult, setLastResult] = useState({
    itemTitle: "",
    transcript: "",
    front: 0,
    middle: 0,
    end: 0,
    overall: 0,
  });

  const [mediaRecorder, setMediaRecorder] = useState(null);

  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const autoStopTimeoutRef = useRef(null);
  const autoNextTimeoutRef = useRef(null);
  const autoRetryTimeoutRef = useRef(null);
  const autoStartTimeoutRef = useRef(null);
  const messageTimeoutRef = useRef(null);

  const autoStartEnabledRef = useRef(false);
  const transitionLockRef = useRef(false);

  const todayKey = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  useEffect(() => {
    loadDevicePageData();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
      if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
      if (autoRetryTimeoutRef.current) clearTimeout(autoRetryTimeoutRef.current);
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);

      try {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      } catch (error) {
        console.log(error);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      sessionStarted &&
      !sessionEnded &&
      !sessionPaused &&
      selectedMode === "therapy"
    ) {
      timerRef.current = setInterval(() => {
        setSessionSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionStarted, sessionEnded, sessionPaused, selectedMode]);

  useEffect(() => {
    if (!therapyPlan || selectedMode !== "therapy" || sessionEnded) return;

    const maxDurationSeconds =
      Number(therapyPlan.sessionDurationMinutes || 0) * 60;

    if (maxDurationSeconds > 0 && sessionSeconds >= maxDurationSeconds) {
      endTherapySessionByTime();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSeconds, therapyPlan, selectedMode, sessionEnded]);

  useEffect(() => {
    const ready =
      selectedMode === "therapy" &&
      sessionStarted &&
      !sessionPaused &&
      !sessionEnded &&
      items.length > 0 &&
      !recording &&
      !checkingAudio &&
      !requestInFlight &&
      autoStartEnabledRef.current &&
      !transitionLockRef.current;

    if (!ready) return;

    autoStartEnabledRef.current = false;

    autoStartTimeoutRef.current = setTimeout(() => {
      startRecording(true);
    }, AUTO_RECORD_DELAY);

    return () => {
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);
    };
  }, [
    selectedMode,
    sessionStarted,
    sessionPaused,
    sessionEnded,
    items.length,
    currentItemIndex,
    recording,
    checkingAudio,
    requestInFlight,
  ]);

  const setStep = (text, type = "info") => {
    setStepAlert(text);
    setStepType(type);
    console.log("[DEVICE STEP]", text);
  };

  const showMessage = (text) => {
    setMessage(text);
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = setTimeout(() => setMessage(""), 3500);
  };

  const formatSeconds = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const getCurrentItem = () => {
    if (!items.length) return null;
    return items[currentItemIndex] || null;
  };

  const normalizeItem = (rawItem, index) => {
    const text = rawItem.text || rawItem.title || rawItem.name || "";
    const sound =
      rawItem.sound ||
      rawItem.letter ||
      rawItem.targetSound ||
      text ||
      "";

    const front =
      rawItem.front ||
      rawItem.initial ||
      rawItem.frontWord ||
      text ||
      "";

    const middle =
      rawItem.middle ||
      rawItem.medial ||
      rawItem.middleWord ||
      text ||
      "";

    const end =
      rawItem.end ||
      rawItem.final ||
      rawItem.endWord ||
      text ||
      "";

    const title = rawItem.title || rawItem.name || text || `Item ${index + 1}`;

    return {
      id: rawItem.id || `item-${index + 1}`,
      title,
      text,
      sound,
      front,
      middle,
      end,
      imageUrl: rawItem.imageUrl || "",
      type: rawItem.type || "sound",
    };
  };

  const resetSessionStateOnly = () => {
    setSessionStarted(false);
    setSessionPaused(false);
    setSessionEnded(false);
    setSessionSeconds(0);
    setCurrentItemIndex(0);
    setCurrentAttempts(1);
    setRecognizedText("");
    setSavedItemsCount(0);
    setFeedbackText("");
    setSessionDocId("");
    setRequestInFlight(false);
    setCheckingAudio(false);
    setRecording(false);
    setStep("Idle", "info");

    autoStartEnabledRef.current = false;
    transitionLockRef.current = false;

    setCurrentItemProgress({
      front: 0,
      middle: 0,
      end: 0,
      overall: 0,
    });

    setLastResult({
      itemTitle: "",
      transcript: "",
      front: 0,
      middle: 0,
      end: 0,
      overall: 0,
    });
  };

  const stopCurrentRecordingIfAny = () => {
    try {
      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
      if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
      if (autoRetryTimeoutRef.current) clearTimeout(autoRetryTimeoutRef.current);
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);

      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch (error) {
      console.log(error);
    } finally {
      setRecording(false);
      setCheckingAudio(false);
      setRequestInFlight(false);
      setMediaRecorder(null);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  };

  const speakText = (text) => {
    try {
      if (!window.speechSynthesis || !text) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      utterance.pitch = 1.05;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const femaleVoice =
        voices.find((v) => v.name.toLowerCase().includes("zira")) ||
        voices.find((v) => v.name.toLowerCase().includes("susan")) ||
        voices.find((v) => v.name.toLowerCase().includes("female")) ||
        voices[0];

      if (femaleVoice) utterance.voice = femaleVoice;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.log("Speech synthesis error:", error);
    }
  };

  const buildInstructionForItem = (item) => {
    if (!item) return "Let's try the next word.";
    return `Say this word: ${item.title || item.sound || "word"}`;
  };

  const queueAutoAttempt = (delay = AUTO_RETRY_DELAY) => {
    if (sessionEnded || sessionPaused || !sessionStarted) return;
    autoStartEnabledRef.current = true;
    if (autoRetryTimeoutRef.current) clearTimeout(autoRetryTimeoutRef.current);
    autoRetryTimeoutRef.current = setTimeout(() => {
      if (!sessionEnded && !sessionPaused && sessionStarted) {
        autoStartEnabledRef.current = true;
      }
    }, delay);
  };

  const moveToNextWord = (reasonText = "Moving to next word.") => {
    const isLastItem = currentItemIndex >= items.length - 1;

    if (isLastItem) {
      completeSessionFully();
      return;
    }

    transitionLockRef.current = true;
    autoStartEnabledRef.current = false;

    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    autoNextTimeoutRef.current = setTimeout(() => {
      const nextIndex = currentItemIndex + 1;

      setCurrentAttempts(1);
      setCurrentItemIndex(nextIndex);
      setRecognizedText("Listening...");
      setFeedbackText("");
      setCurrentItemProgress({
        front: 0,
        middle: 0,
        end: 0,
        overall: 0,
      });

      const nextItem = items[nextIndex];
      if (nextItem) {
        const instruction = buildInstructionForItem(nextItem);
        setFeedbackText(instruction);
        setStep(instruction, "info");
        speakText(instruction);
      }

      transitionLockRef.current = false;
      autoStartEnabledRef.current = true;
      showMessage(reasonText);
    }, AUTO_NEXT_DELAY);
  };

  const handleFailedAttempt = async (item, transcript = "", progress = null, reason = "retry") => {
    const nextAttempt = currentAttempts + 1;
    const currentProgress =
      progress ||
      {
        front: 0,
        middle: 0,
        end: 0,
        overall: 0,
      };

    try {
      await saveProgressTracking({
        item,
        transcript,
        progress: currentProgress,
        attemptNumber: currentAttempts,
        decision: reason === "forced_next" ? "forced_next" : "retry",
        feedback:
          nextAttempt <= MAX_ATTEMPTS
            ? `Try again. Attempt ${nextAttempt} of ${MAX_ATTEMPTS}.`
            : "Good try. Moving to next word.",
      });
    } catch (error) {
      console.error("saveProgressTracking error:", error);
    }

    if (currentAttempts >= MAX_ATTEMPTS) {
      setFeedbackText("Good try. We will move to the next word now.");
      speakText("Good try. We will move to the next word now.");
      setStep(`Attempt ${MAX_ATTEMPTS}/${MAX_ATTEMPTS}. Moving to next word.`, "warning");
      setSavedItemsCount((prev) => prev + 1);
      moveToNextWord("➡️ 3 attempts used. Moving to next word.");
      return;
    }

    setCurrentAttempts(nextAttempt);
    const retryText = `Let's try again. Attempt ${nextAttempt} of ${MAX_ATTEMPTS}.`;
    setFeedbackText(retryText);
    speakText(retryText);
    setStep(`Staying on same word. Attempt ${nextAttempt}/${MAX_ATTEMPTS}`, "warning");
    showMessage(retryText);
    queueAutoAttempt(AUTO_RETRY_DELAY);
  };

  const loadDevicePageData = async () => {
    try {
      setLoading(true);
      setStep("Loading device data...", "info");

      let childIdFromState = passedState.childId || "";
      let childDocData = null;

      if (childIdFromState) {
        const childSnap = await getDoc(doc(db, "children", childIdFromState));
        if (childSnap.exists()) {
          childDocData = { id: childSnap.id, ...childSnap.data() };
        }
      }

      if (!childDocData) {
        const byDeviceId = query(
          collection(db, "children"),
          where("deviceId", "==", deviceId)
        );
        const byDeviceIdSnap = await getDocs(byDeviceId);

        if (!byDeviceIdSnap.empty) {
          const first = byDeviceIdSnap.docs[0];
          childDocData = { id: first.id, ...first.data() };
          childIdFromState = first.id;
        }
      }

      if (!childDocData) {
        const byDeviceCode = query(
          collection(db, "children"),
          where("deviceCode", "==", deviceId)
        );
        const byDeviceCodeSnap = await getDocs(byDeviceCode);

        if (!byDeviceCodeSnap.empty) {
          const first = byDeviceCodeSnap.docs[0];
          childDocData = { id: first.id, ...first.data() };
          childIdFromState = first.id;
        }
      }

      if (!childDocData) {
        setStep("Child not found for this device.", "error");
        showMessage("❌ Child not found for this device.");
        return;
      }

      const deviceSnap = await getDoc(doc(db, "devices", deviceId));
      const deviceDocData = deviceSnap.exists()
        ? { id: deviceSnap.id, ...deviceSnap.data() }
        : {
            id: deviceId,
            deviceId,
            deviceCode: deviceId,
            deviceName: passedState.deviceName || "Assigned Device",
            deviceStatus: "Assigned",
          };

      const planSnap = await getDoc(doc(db, "therapyPlans", childIdFromState));
      const planData = planSnap.exists() ? planSnap.data() : null;

      let fetchedLevel = null;
      let normalizedItems = [];

      if (childDocData.assignedLevelId) {
        const levelSnap = await getDoc(
          doc(db, "levels", childDocData.assignedLevelId)
        );

        if (levelSnap.exists()) {
          fetchedLevel = { id: levelSnap.id, ...levelSnap.data() };
        }

        const itemsSnap = await getDocs(
          collection(db, "levels", childDocData.assignedLevelId, "items")
        );

        normalizedItems = itemsSnap.docs.map((itemDoc, index) =>
          normalizeItem({ id: itemDoc.id, ...itemDoc.data() }, index)
        );
      }

      setChildData(childDocData);
      setDeviceData(deviceDocData);
      setTherapyPlan(planData);
      setLevelData(fetchedLevel);
      setItems(normalizedItems);

      const todaySessionCount = await getTodaySessionCount(childDocData);
      setSessionNumber(todaySessionCount + 1);

      const accessResult = await checkTherapyAccess(childDocData, planData);
      setTherapyAllowed(accessResult.therapyAllowed);
      setTherapyBlockedReason(accessResult.reason || "");
      setSelectedMode(accessResult.therapyAllowed ? "therapy" : "companion");

      setStep("Device data loaded.", "success");
    } catch (error) {
      console.error(error);
      setStep("Failed to load device page.", "error");
      showMessage("❌ Failed to load device page.");
    } finally {
      setLoading(false);
    }
  };

  const getTodaySessionCount = async (child) => {
    try {
      const usageSnap = await getDoc(
        doc(db, "children", child.id, "dailyUsage", todayKey)
      );
      if (usageSnap.exists()) {
        return Number(usageSnap.data().sessionCount || 0);
      }
    } catch (error) {
      console.log(error);
    }

    if (child.lastSessionDate === todayKey) {
      return Number(child.todaySessionCount || 0);
    }

    return 0;
  };

  const checkMinimumGap = async (child, plan) => {
    const minGap = Number(plan?.minimumGapBetweenSessionsMinutes || 0);
    if (minGap <= 0) return { allowed: true, reason: "" };

    const sessionsSnap = await getDocs(
      collection(db, "children", child.id, "sessions")
    );

    const sessions = sessionsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.sessionDateKey === todayKey)
      .sort((a, b) => {
        const at = a.endedAt?.seconds || 0;
        const bt = b.endedAt?.seconds || 0;
        return bt - at;
      });

    if (!sessions.length) return { allowed: true, reason: "" };

    const latest = sessions[0];
    if (!latest.endedAt?.seconds) return { allowed: true, reason: "" };

    const latestEndMs = latest.endedAt.seconds * 1000;
    const diffMinutes = Math.floor((Date.now() - latestEndMs) / 60000);

    if (diffMinutes < minGap) {
      return {
        allowed: false,
        reason: `Wait ${minGap - diffMinutes} more minute(s) before next therapy session.`,
      };
    }

    return { allowed: true, reason: "" };
  };

  const isWithinTherapyTime = (startTime, endTime) => {
    if (!startTime || !endTime) return true;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;

    return currentMinutes >= startTotal && currentMinutes <= endTotal;
  };

  const checkTherapyAccess = async (child, plan) => {
    if (!child?.deviceAssigned) {
      return { therapyAllowed: false, reason: "No device assigned." };
    }

    if (!plan) {
      return { therapyAllowed: false, reason: "No therapy plan found." };
    }

    const todayCount = await getTodaySessionCount(child);
    const maxSessions = Number(plan.maxSessionsPerDay || 0);

    if (
      maxSessions > 0 &&
      todayCount >= maxSessions &&
      plan.lockTherapyAfterLimit
    ) {
      return {
        therapyAllowed: false,
        reason: `Daily therapy limit reached (${maxSessions}).`,
      };
    }

    if (!isWithinTherapyTime(plan.therapyStartTime, plan.therapyEndTime)) {
      return {
        therapyAllowed: false,
        reason: "Outside therapy time window.",
      };
    }

    const gap = await checkMinimumGap(child, plan);
    if (!gap.allowed) {
      return {
        therapyAllowed: false,
        reason: gap.reason,
      };
    }

    return { therapyAllowed: true, reason: "" };
  };

  const handleModeChange = (mode) => {
    if (mode === "therapy" && !therapyAllowed) {
      showMessage(`⚠️ ${therapyBlockedReason || "Therapy mode is blocked."}`);
      setStep("Therapy mode blocked.", "warning");
      return;
    }

    stopCurrentRecordingIfAny();
    resetSessionStateOnly();
    setSelectedMode(mode);
    setFeedbackText("");
    setCurrentAttempts(1);
    setStep(`Mode changed to ${mode}.`, "info");
  };

  const startTherapySession = async () => {
    if (!childData || !therapyPlan) return;

    if (!items.length) {
      setStep("No items found in this level.", "error");
      showMessage("❌ No items found in this level.");
      return;
    }

    const accessResult = await checkTherapyAccess(childData, therapyPlan);
    if (!accessResult.therapyAllowed) {
      setTherapyAllowed(false);
      setTherapyBlockedReason(accessResult.reason);
      setSelectedMode("companion");
      setStep(accessResult.reason, "warning");
      showMessage(`⚠️ ${accessResult.reason}`);
      return;
    }

    const newSessionDocId = `${todayKey}-S${sessionNumber}`;

    setSessionDocId(newSessionDocId);
    setSessionStarted(true);
    setSessionPaused(false);
    setSessionEnded(false);
    setSessionSeconds(0);
    setCurrentItemIndex(0);
    setCurrentAttempts(1);
    setRecognizedText("Listening...");
    setSavedItemsCount(0);
    setFeedbackText("");
    setRequestInFlight(false);
    setCheckingAudio(false);
    setRecording(false);
    autoStartEnabledRef.current = true;
    transitionLockRef.current = false;

    setLastResult({
      itemTitle: "",
      transcript: "",
      front: 0,
      middle: 0,
      end: 0,
      overall: 0,
    });

    setCurrentItemProgress({
      front: 0,
      middle: 0,
      end: 0,
      overall: 0,
    });

    setStep("Therapy session started.", "success");

    await setDoc(
      doc(db, "children", childData.id, "sessions", newSessionDocId),
      {
        sessionId: newSessionDocId,
        sessionNumber,
        sessionDateKey: todayKey,
        childId: childData.id,
        childName: childData.childName || "",
        childCode: childData.childCode || "",
        parentId: childData.parentId || "",
        parentName: childData.parentName || "",
        parentEmail: childData.parentEmail || "",
        therapistUid: childData.therapistUid || "",
        therapistName: childData.therapistName || "",
        levelId: childData.assignedLevelId || "",
        levelName: childData.assignedLevelName || "",
        deviceId: deviceData?.deviceId || deviceId,
        deviceCode: deviceData?.deviceCode || deviceId,
        mode: "therapy",
        startedAt: serverTimestamp(),
        completed: false,
        status: "started",
        totalItems: items.length,
        completedItems: 0,
      },
      { merge: true }
    );

    const firstItem = items[0];
    if (firstItem) {
      const instruction = buildInstructionForItem(firstItem);
      setFeedbackText(instruction);
      speakText(instruction);
      setStep(instruction, "info");
    }

    showMessage("✅ Therapy session started.");
  };

  const pauseSession = async () => {
    if (!sessionStarted || sessionEnded) return;

    stopCurrentRecordingIfAny();
    autoStartEnabledRef.current = false;
    setSessionPaused(true);
    setStep("Session paused.", "warning");

    if (sessionDocId && childData?.id) {
      await setDoc(
        doc(db, "children", childData.id, "sessions", sessionDocId),
        {
          status: "paused",
          pausedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    showMessage("⏸️ Session paused.");
  };

  const resumeSession = async () => {
    if (!sessionStarted || sessionEnded) return;

    setSessionPaused(false);
    setRecognizedText("Listening...");
    autoStartEnabledRef.current = true;
    setStep("Session resumed.", "success");

    if (sessionDocId && childData?.id) {
      await setDoc(
        doc(db, "children", childData.id, "sessions", sessionDocId),
        {
          status: "resumed",
          resumedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    const current = getCurrentItem();
    if (current) {
      const instruction = buildInstructionForItem(current);
      setFeedbackText(instruction);
      speakText(instruction);
    }

    showMessage("▶️ Session resumed.");
  };

  const restartSession = async () => {
    setStep("Restarting therapy session...", "warning");
    stopCurrentRecordingIfAny();
    resetSessionStateOnly();
    await startTherapySession();
  };

  const interruptSession = async () => {
    if (!sessionStarted || sessionEnded) return;

    stopCurrentRecordingIfAny();
    if (timerRef.current) clearInterval(timerRef.current);

    setSessionEnded(true);
    setSessionStarted(false);
    setSessionPaused(false);
    autoStartEnabledRef.current = false;
    setStep("Interrupting session and saving...", "warning");

    await saveSessionSummary({
      endedBy: "interrupted_by_user",
      completed: false,
    });

    setStep("Session interrupted and saved.", "success");
    showMessage("🛑 Session interrupted and saved.");
  };

  const endTherapySessionByTime = async () => {
    stopCurrentRecordingIfAny();
    if (timerRef.current) clearInterval(timerRef.current);

    setSessionEnded(true);
    setSessionStarted(false);
    setSessionPaused(false);
    setTherapyAllowed(false);
    setSelectedMode("companion");
    autoStartEnabledRef.current = false;
    setTherapyBlockedReason(
      "Therapy time completed. Only Companion mode is available now."
    );

    setStep("Therapy time finished. Saving session...", "warning");

    await saveSessionSummary({
      endedBy: "time_limit",
      completed: true,
    });

    await setDoc(
      doc(db, "children", childData.id, "timeline", `${Date.now()}`),
      {
        title: "Therapy session ended",
        description:
          "Session time finished. Companion mode only is now available.",
        createdAt: serverTimestamp(),
      }
    );

    setStep("Session finished by time limit.", "success");
    showMessage("⏰ Session time finished. Switching to Companion mode.");
  };

  const completeSessionFully = async () => {
    stopCurrentRecordingIfAny();
    if (timerRef.current) clearInterval(timerRef.current);

    setSessionEnded(true);
    setSessionStarted(false);
    setSessionPaused(false);
    autoStartEnabledRef.current = false;
    setStep("All items finished. Saving final session...", "success");

    await saveSessionSummary({
      endedBy: "items_completed",
      completed: true,
    });

    setStep("Session completed and saved.", "success");
    showMessage("✅ Session completed and saved.");
  };

  const startRecording = async (autoMode = false) => {
    try {
      if (
        !sessionStarted ||
        sessionEnded ||
        sessionPaused ||
        selectedMode !== "therapy"
      ) {
        setStep("Recording blocked. Session is not active.", "warning");
        return;
      }

      if (recording || checkingAudio || requestInFlight || transitionLockRef.current) {
        setStep("Already recording or processing audio...", "warning");
        return;
      }

      const current = getCurrentItem();
      if (!current) {
        setStep("No current item found.", "error");
        return;
      }

      const instruction = buildInstructionForItem(current);
      if (!autoMode) {
        setFeedbackText(instruction);
        speakText(instruction);
      }

      setStep(`Current item: ${current.title}`, "info");
      setStep("Requesting microphone access...", "info");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      setStep("Microphone access granted.", "success");

      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "";
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];

      recorder.onstart = () => {
        setStep("Recording started...", "info");
      };

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setStep("Recorder error occurred.", "error");
        setRecording(false);
        setCheckingAudio(false);
        setRequestInFlight(false);
      };

      recorder.onstop = async () => {
        try {
          setStep("Recording stopped.", "info");

          const itemAtStop = getCurrentItem();
          if (!itemAtStop) return;

          if (!audioChunksRef.current.length) {
            setRecognizedText("No audio captured");
            await handleFailedAttempt(itemAtStop, "", null, "retry");
            return;
          }

          const actualMime = recorder.mimeType || "audio/webm";
          const extension = actualMime.includes("mp4")
            ? "m4a"
            : actualMime.includes("ogg")
            ? "ogg"
            : "webm";

          const audioBlob = new Blob(audioChunksRef.current, {
            type: actualMime,
          });

          setStep("Audio captured. Sending to backend...", "info");
          await sendToWhisper(audioBlob, extension);
        } finally {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
      setRecognizedText(autoMode ? "Listening..." : "Recording...");

      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);

      autoStopTimeoutRef.current = setTimeout(() => {
        try {
          setStep("Auto stop triggered. Finishing recording...", "info");
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        } catch (err) {
          console.error(err);
          setStep("Failed while stopping recording.", "error");
        } finally {
          setRecording(false);
        }
      }, RECORDING_LENGTH);
    } catch (error) {
      console.error(error);
      setStep("Could not access laptop microphone.", "error");
      showMessage("❌ Could not access laptop microphone.");
      setRecording(false);
      setCheckingAudio(false);
      setRequestInFlight(false);

      const current = getCurrentItem();
      if (current) {
        await handleFailedAttempt(current, "", null, "retry");
      }
    }
  };

  const stopRecording = () => {
    if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);

    if (!mediaRecorder) {
      setStep("No active recorder found.", "warning");
      return;
    }

    if (mediaRecorder.state !== "inactive") {
      setStep("Manual stop requested.", "warning");
      mediaRecorder.stop();
    }

    setRecording(false);
  };

  const levenshteinDistance = (a, b) => {
    const matrix = Array.from({ length: b.length + 1 }, () =>
      Array(a.length + 1).fill(0)
    );

    for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  };

  const calculateMatchScore = (target, transcript) => {
    if (!target || !transcript) return 0;

    const normalize = (text) =>
      String(text)
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .trim();

    const t = normalize(target);
    const s = normalize(transcript);

    if (!t || !s) return 0;
    if (s === t) return 100;
    if (s.includes(t) || t.includes(s)) return 90;

    const targetWords = t.split(/\s+/).filter(Boolean);
    const spokenWords = s.split(/\s+/).filter(Boolean);

    let matchedWords = 0;

    targetWords.forEach((word) => {
      if (
        spokenWords.some(
          (spoken) =>
            spoken === word ||
            spoken.includes(word) ||
            word.includes(spoken) ||
            levenshteinDistance(spoken, word) <= 1
        )
      ) {
        matchedWords += 1;
      }
    });

    const wordScore = Math.round(
      (matchedWords / Math.max(targetWords.length, 1)) * 100
    );

    const firstLetterBonus = s[0] && t[0] && s[0] === t[0] ? 10 : 0;

    return Math.min(100, wordScore + firstLetterBonus);
  };

  const calculateItemProgress = (item, transcript) => {
    const front = calculateMatchScore(item.front || item.title, transcript);
    const middle = calculateMatchScore(item.middle || item.title, transcript);
    const end = calculateMatchScore(item.end || item.title, transcript);
    const overall = Math.round((front + middle + end) / 3);

    return { front, middle, end, overall };
  };

  const saveProgressTracking = async ({
    item,
    transcript,
    progress,
    attemptNumber,
    decision,
    feedback,
  }) => {
    await addDoc(collection(db, "progressTracking"), {
      childId: childData.id,
      childName: childData.childName || "",
      childCode: childData.childCode || "",
      parentId: childData.parentId || "",
      parentName: childData.parentName || "",
      parentEmail: childData.parentEmail || "",
      therapistUid: childData.therapistUid || "",
      therapistName: childData.therapistName || "",
      deviceId: deviceData?.deviceId || deviceId,
      deviceCode: deviceData?.deviceCode || deviceId,
      levelId: childData.assignedLevelId || "",
      levelName: childData.assignedLevelName || "",
      sessionId: sessionDocId || `${todayKey}-S${sessionNumber}`,
      sessionNumber,
      sessionDateKey: todayKey,
      mode: selectedMode,
      itemId: item.id,
      itemTitle: item.title,
      targetSound: item.sound || "",
      targetFront: item.front || "",
      targetMiddle: item.middle || "",
      targetEnd: item.end || "",
      transcript: transcript || "",
      frontScore: progress.front,
      middleScore: progress.middle,
      endScore: progress.end,
      overallScore: progress.overall,
      attemptNumber,
      decision,
      feedback,
      createdAt: serverTimestamp(),
    });
  };

  const sendToWhisper = async (audioBlob, extension = "webm") => {
    let item = null;

    try {
      setCheckingAudio(true);
      setRequestInFlight(true);

      item = getCurrentItem();
      if (!item) {
        setStep("No level item found.", "error");
        showMessage("⚠️ No level item found.");
        return;
      }

      setStep("Preparing audio for backend...", "info");

      const formData = new FormData();
      formData.append("file", audioBlob, `speech.${extension}`);
      formData.append("childId", childData.id);
      formData.append("deviceId", deviceData?.deviceId || deviceId);

      setStep("Sending request to backend...", "info");

      const response = await fetch("/api/whisper/transcribe", {
        method: "POST",
        body: formData,
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        throw new Error("Server did not return valid JSON.");
      }

      if (!response.ok) {
        throw new Error(
          data?.details || data?.error || "Transcription request failed"
        );
      }

      const transcript = (
        data?.text ||
        data?.transcript ||
        data?.recognizedText ||
        ""
      ).trim();

      setRecognizedText(transcript || "No clear speech detected");
      setStep(
        `Whisper heard: ${transcript || "No clear speech detected"}`,
        "success"
      );

      const progress = calculateItemProgress(item, transcript);
      setCurrentItemProgress(progress);

      const passed = progress.overall >= TARGET_THRESHOLD;

      let feedback = "";
      let decision = "";

      if (passed) {
        feedback = `Good job. You said ${item.title || "the word"} well.`;
        decision = "pass";
      } else {
        feedback = `Let's try again. Say ${item.title || "the word"}.`;
        decision = "retry";
      }

      setFeedbackText(feedback);
      speakText(feedback);

      setLastResult({
        itemTitle: item.title,
        transcript: transcript || "No speech detected",
        front: progress.front,
        middle: progress.middle,
        end: progress.end,
        overall: progress.overall,
      });

      try {
        await saveItemProgress(item, transcript, progress);
      } catch (saveError) {
        console.error("saveItemProgress error:", saveError);
      }

      try {
        await updateAggregateReport(item, transcript, progress);
      } catch (reportError) {
        console.error("updateAggregateReport error:", reportError);
      }

      try {
        await saveProgressTracking({
          item,
          transcript,
          progress,
          attemptNumber: currentAttempts,
          decision,
          feedback,
        });
      } catch (trackingError) {
        console.error("saveProgressTracking error:", trackingError);
      }

      if (sessionDocId) {
        try {
          await setDoc(
            doc(db, "children", childData.id, "sessions", sessionDocId),
            {
              completedItems: increment(passed ? 1 : 0),
              lastItemId: item.id,
              lastItemTitle: item.title,
              lastTranscript: transcript || "",
              lastFrontScore: progress.front,
              lastMiddleScore: progress.middle,
              lastEndScore: progress.end,
              lastOverallScore: progress.overall,
              lastAttemptNumber: currentAttempts,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (sessionError) {
          console.error("session update error:", sessionError);
        }
      }

      if (!passed) {
        await handleFailedAttempt(item, transcript, progress, "retry");
        return;
      }

      setSavedItemsCount((prev) => prev + 1);
      setCurrentAttempts(1);
      setStep("Passed. Moving to next word...", "success");
      moveToNextWord("✅ Good job. Moving to next word.");
    } catch (error) {
      console.error(error);
      setRecognizedText("Transcription failed");
      setFeedbackText("We could not check that properly.");
      speakText("We could not check that properly.");
      setStep(
        `Whisper/backend failed: ${error.message || "Unknown error"}`,
        "error"
      );
      showMessage(`❌ Failed to check speech. ${error.message || ""}`);

      const current = getCurrentItem();
      if (current) {
        await handleFailedAttempt(current, "", null, "retry");
      }
    } finally {
      setCheckingAudio(false);
      setRecording(false);
      setMediaRecorder(null);
      setRequestInFlight(false);
    }
  };

  const saveItemProgress = async (item, transcript, progress) => {
    await addDoc(collection(db, "children", childData.id, "sessionItems"), {
      childId: childData.id,
      childName: childData.childName || "",
      childCode: childData.childCode || "",
      parentId: childData.parentId || "",
      parentName: childData.parentName || "",
      parentEmail: childData.parentEmail || "",
      therapistUid: childData.therapistUid || "",
      therapistName: childData.therapistName || "",
      levelId: childData.assignedLevelId || "",
      levelName: childData.assignedLevelName || "",
      deviceId: deviceData?.deviceId || deviceId,
      deviceCode: deviceData?.deviceCode || deviceId,
      sessionId: sessionDocId || `${todayKey}-S${sessionNumber}`,
      sessionNumber,
      sessionDateKey: todayKey,
      mode: selectedMode,
      itemId: item.id,
      itemTitle: item.title,
      sound: item.sound || "",
      frontWord: item.front || "",
      middleWord: item.middle || "",
      endWord: item.end || "",
      transcript,
      frontProgress: progress.front,
      middleProgress: progress.middle,
      endProgress: progress.end,
      overallProgress: progress.overall,
      attemptNumber: currentAttempts,
      createdAt: serverTimestamp(),
    });
  };

  const saveSessionSummary = async ({ endedBy, completed }) => {
    const finalSessionId = sessionDocId || `${todayKey}-S${sessionNumber}`;

    await setDoc(
      doc(db, "children", childData.id, "sessions", finalSessionId),
      {
        sessionId: finalSessionId,
        sessionNumber,
        sessionDateKey: todayKey,
        childId: childData.id,
        childName: childData.childName || "",
        childCode: childData.childCode || "",
        parentId: childData.parentId || "",
        parentName: childData.parentName || "",
        parentEmail: childData.parentEmail || "",
        therapistUid: childData.therapistUid || "",
        therapistName: childData.therapistName || "",
        levelId: childData.assignedLevelId || "",
        levelName: childData.assignedLevelName || "",
        deviceId: deviceData?.deviceId || deviceId,
        deviceCode: deviceData?.deviceCode || deviceId,
        mode: selectedMode,
        durationSeconds: sessionSeconds,
        completed,
        endedBy,
        status: completed ? "completed" : "interrupted",
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(
      doc(db, "children", childData.id, "dailyUsage", todayKey),
      {
        childId: childData.id,
        childName: childData.childName || "",
        sessionDateKey: todayKey,
        sessionCount: increment(1),
        totalTherapySeconds: increment(sessionSeconds),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await updateDoc(doc(db, "children", childData.id), {
      todaySessionCount: increment(1),
      lastSessionDate: todayKey,
    });

    const currentCount = await getTodaySessionCount({
      ...childData,
      lastSessionDate: todayKey,
      todaySessionCount: Number(childData.todaySessionCount || 0) + 1,
    });

    setSessionNumber(currentCount + 1);
  };

  const updateAggregateReport = async (item, transcript, progress) => {
    const reportRef = doc(db, "children", childData.id, "report", "main");
    const existing = await getDoc(reportRef);
    const existingData = existing.exists() ? existing.data() : {};

    const totalCheckedItems = Number(existingData.totalCheckedItems || 0) + 1;
    const newFrontTotal =
      Number(existingData.frontProgressTotal || 0) + Number(progress.front);
    const newMiddleTotal =
      Number(existingData.middleProgressTotal || 0) + Number(progress.middle);
    const newEndTotal =
      Number(existingData.endProgressTotal || 0) + Number(progress.end);
    const newOverallTotal =
      Number(existingData.overallProgressTotal || 0) + Number(progress.overall);

    const avgFront = Math.round(newFrontTotal / totalCheckedItems);
    const avgMiddle = Math.round(newMiddleTotal / totalCheckedItems);
    const avgEnd = Math.round(newEndTotal / totalCheckedItems);
    const avgOverall = Math.round(newOverallTotal / totalCheckedItems);

    await setDoc(
      reportRef,
      {
        childId: childData.id,
        childName: childData.childName || "",
        childCode: childData.childCode || "",
        parentId: childData.parentId || "",
        parentName: childData.parentName || "",
        parentEmail: childData.parentEmail || "",
        therapistUid: childData.therapistUid || "",
        therapistName: childData.therapistName || "",
        therapistId: childData.therapistId || "",
        levelId: childData.assignedLevelId || "",
        levelName: childData.assignedLevelName || "",
        deviceId: deviceData?.deviceId || deviceId,
        deviceCode: deviceData?.deviceCode || deviceId,
        totalCheckedItems,
        totalCompletedItems: totalCheckedItems,
        totalItems: items.length,
        lastCheckedItemId: item.id,
        lastCheckedItemTitle: item.title,
        lastSound: item.sound || "",
        lastTranscript: transcript,
        currentMode: selectedMode || "therapy",
        frontProgressTotal: newFrontTotal,
        middleProgressTotal: newMiddleTotal,
        endProgressTotal: newEndTotal,
        overallProgressTotal: newOverallTotal,
        frontAverage: avgFront,
        middleAverage: avgMiddle,
        endAverage: avgEnd,
        overallProgress: avgOverall,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const currentItem = getCurrentItem();

  return (
    <div className="device-page">
      <div className="device-topbar">
        <div>
          <h1>Pineda Device Interface</h1>
          <p>Laptop microphone testing version</p>
        </div>

        <button className="back-btn" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      {message && <div className="device-message-box">{message}</div>}

      {loading ? (
        <div className="device-card">Loading device...</div>
      ) : !childData ? (
        <div className="device-card">Child not found.</div>
      ) : (
        <>
          <div className="device-summary-grid">
            <div className="device-card">
              <h3>Child</h3>
              <p><strong>Name:</strong> {childData.childName || "N/A"}</p>
              <p><strong>Code:</strong> {childData.childCode || "N/A"}</p>
              <p><strong>Parent:</strong> {childData.parentName || "N/A"}</p>
              <p><strong>Parent Email:</strong> {childData.parentEmail || "N/A"}</p>
            </div>

            <div className="device-card">
              <h3>Device</h3>
              <p><strong>Device ID:</strong> {deviceData?.deviceId || deviceId}</p>
              <p><strong>Name:</strong> {deviceData?.deviceName || "N/A"}</p>
              <p><strong>Status:</strong> {deviceData?.deviceStatus || "N/A"}</p>
              <p><strong>Level:</strong> {childData.assignedLevelName || "N/A"}</p>
            </div>

            <div className="device-card">
              <h3>Session Info</h3>
              <p><strong>Session Number:</strong> {sessionNumber}</p>
              <p><strong>Timer:</strong> {formatSeconds(sessionSeconds)}</p>
              <p><strong>Mode:</strong> {selectedMode || "Not selected"}</p>
              <p>
                <strong>Therapy Status:</strong>{" "}
                {sessionEnded
                  ? "Ended"
                  : sessionPaused
                  ? "Paused"
                  : therapyAllowed
                  ? "Allowed"
                  : "Blocked"}
              </p>
              <p><strong>Saved Items:</strong> {savedItemsCount} / {items.length}</p>
            </div>
          </div>

          <div className="device-card mode-card">
            <div className="mode-header">
              <h2>Select Mode</h2>
              {!therapyAllowed && therapyBlockedReason && (
                <span className="mode-warning">{therapyBlockedReason}</span>
              )}
            </div>

            <div className="mode-toggle-row">
              <button
                className={`mode-toggle-btn ${selectedMode === "therapy" ? "active-mode-btn" : ""}`}
                onClick={() => handleModeChange("therapy")}
                disabled={!therapyAllowed}
              >
                Therapy Mode
              </button>

              <button
                className={`mode-toggle-btn ${selectedMode === "companion" ? "active-mode-btn" : ""}`}
                onClick={() => handleModeChange("companion")}
              >
                Companion Mode
              </button>
            </div>
          </div>

          {selectedMode === "therapy" && (
            <div className="device-main-grid">
              <div className="device-card therapy-item-card">
                <div className="section-head">
                  <h2>Current Level Item</h2>

                  {!sessionStarted && !sessionEnded ? (
                    <button className="primary-btn" onClick={startTherapySession}>
                      Start Session
                    </button>
                  ) : (
                    <span className="session-live-badge">
                      {sessionEnded
                        ? "Session Ended"
                        : sessionPaused
                        ? "Session Paused"
                        : "Session Active"}
                    </span>
                  )}
                </div>

                {!currentItem ? (
                  <p className="empty-text">No items found in this level.</p>
                ) : (
                  <>
                    <div className="current-item-box">
                      <p><strong>Level:</strong> {levelData?.title || levelData?.levelName || childData.assignedLevelName || "N/A"}</p>
                      <p><strong>Item:</strong> {currentItem.title || "N/A"}</p>
                      <p><strong>Sound:</strong> {currentItem.sound || "N/A"}</p>
                      <p><strong>Front:</strong> {currentItem.front || "N/A"}</p>
                      <p><strong>Middle:</strong> {currentItem.middle || "N/A"}</p>
                      <p><strong>End:</strong> {currentItem.end || "N/A"}</p>
                      <p><strong>Item Position:</strong> {currentItemIndex + 1} / {items.length}</p>
                    </div>

                    {currentItem.imageUrl && (
                      <div className="current-item-image-wrap">
                        <img
                          src={currentItem.imageUrl}
                          alt={currentItem.title}
                          className="current-item-image"
                        />
                      </div>
                    )}

                    <div className="mic-controls">
                      <button
                        className="primary-btn"
                        onClick={() => startRecording(false)}
                        disabled={
                          !sessionStarted ||
                          sessionEnded ||
                          sessionPaused ||
                          recording ||
                          checkingAudio ||
                          requestInFlight
                        }
                      >
                        {recording ? "Listening..." : "Start Mic Manually"}
                      </button>

                      <button
                        className="secondary-btn"
                        onClick={stopRecording}
                        disabled={!recording}
                      >
                        Stop Mic
                      </button>

                      {!sessionPaused ? (
                        <button
                          className="pause-btn"
                          onClick={pauseSession}
                          disabled={!sessionStarted || sessionEnded}
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          className="resume-btn"
                          onClick={resumeSession}
                          disabled={!sessionStarted || sessionEnded}
                        >
                          Resume
                        </button>
                      )}

                      <button
                        className="restart-btn"
                        onClick={restartSession}
                        disabled={checkingAudio || requestInFlight}
                      >
                        Restart Session
                      </button>

                      <button
                        className="interrupt-btn"
                        onClick={interruptSession}
                        disabled={!sessionStarted || sessionEnded}
                      >
                        End Session
                      </button>
                    </div>

                    <div className={`device-step-alert ${stepType}`}>
                      <strong>Device Status:</strong> {stepAlert}
                    </div>

                    <div className="device-debug-box">
                      <p><strong>Recognized Text:</strong> {recognizedText || "-"}</p>
                      <p><strong>Feedback:</strong> {feedbackText || "-"}</p>
                      <p><strong>Attempt:</strong> {currentAttempts} / {MAX_ATTEMPTS}</p>
                      <p><strong>Target Threshold:</strong> {TARGET_THRESHOLD}%</p>
                      <p><strong>Recording:</strong> {recording ? "Yes" : "No"}</p>
                      <p><strong>Checking Audio:</strong> {checkingAudio ? "Yes" : "No"}</p>
                      <p><strong>Request Running:</strong> {requestInFlight ? "Yes" : "No"}</p>
                      <p><strong>Current Item Index:</strong> {currentItemIndex + 1}</p>
                      <p><strong>Saved Items:</strong> {savedItemsCount}</p>
                    </div>

                    <div className="transcript-box">
                      <h4>Live Status</h4>
                      <p>{recognizedText || "Waiting..."}</p>
                    </div>

                    <div className="transcript-box">
                      <h4>Feedback</h4>
                      <p>{feedbackText || "Waiting for feedback..."}</p>
                    </div>

                    <div className="transcript-box">
                      <h4>Last Checked Result</h4>
                      <p><strong>Item:</strong> {lastResult.itemTitle || "None yet"}</p>
                      <p><strong>Text:</strong> {lastResult.transcript || "No result yet"}</p>
                      <p>
                        <strong>Scores:</strong> Front {lastResult.front}% | Middle {lastResult.middle}% | End {lastResult.end}% | Overall {lastResult.overall}%
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="device-card progress-card">
                <h2>Item Progress</h2>

                <div className="progress-group">
                  <label>Front</label>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${currentItemProgress.front}%` }} />
                  </div>
                  <span>{currentItemProgress.front}%</span>
                </div>

                <div className="progress-group">
                  <label>Middle</label>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${currentItemProgress.middle}%` }} />
                  </div>
                  <span>{currentItemProgress.middle}%</span>
                </div>

                <div className="progress-group">
                  <label>End</label>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${currentItemProgress.end}%` }} />
                  </div>
                  <span>{currentItemProgress.end}%</span>
                </div>

                <div className="progress-group">
                  <label>Overall</label>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${currentItemProgress.overall}%` }} />
                  </div>
                  <span>{currentItemProgress.overall}%</span>
                </div>

                <div className="plan-box">
                  <p><strong>Max Sessions / Day:</strong> {therapyPlan?.maxSessionsPerDay ?? "N/A"}</p>
                  <p><strong>Session Duration:</strong> {therapyPlan?.sessionDurationMinutes ?? "N/A"} mins</p>
                  <p><strong>Min Gap Between Sessions:</strong> {therapyPlan?.minimumGapBetweenSessionsMinutes ?? "N/A"} mins</p>
                </div>
              </div>
            </div>
          )}

          {selectedMode === "companion" && (
            <div className="device-card companion-card">
              <h2>Companion Mode</h2>
              <div className="companion-box">
                <h4>Hello {childData.childName || "Child"} 👋</h4>
                <p>This is the simple companion mode for now.</p>
                <p>Later you can connect the ESP toy here.</p>
                <p>
                  {currentItem
                    ? `Current practice sound: ${currentItem.sound || currentItem.title}`
                    : "No level items available."}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DevicePage;