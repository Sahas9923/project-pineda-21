import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

import { auth, db } from "../../firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { colors, shadows } from "../../styles/theme";

const SERVER = "https://project-pineda-21-backend.onrender.com";
const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 35000;

export default function DeviceScreen() {
  const route = useRoute();
  const state = route.params || {};

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [child, setChild] = useState(null);
  const [parent, setParent] = useState(null);
  const [therapist, setTherapist] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [therapyPlanData, setTherapyPlanData] = useState(null);
  const [levelInfo, setLevelInfo] = useState(null);
  const [items, setItems] = useState([]);

  const [sessionId, setSessionId] = useState("");
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [sessionBlocked, setSessionBlocked] = useState(false);

  const [selectedMode, setSelectedMode] = useState("companion");
  const [companionActive, setCompanionActive] = useState(false);

  const [therapyModeAllowed, setTherapyModeAllowed] = useState(true);
  const [therapyRestrictionMessage, setTherapyRestrictionMessage] = useState("");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [stage, setStage] = useState("Ready");
  const [latestResult, setLatestResult] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [toyPromptActive, setToyPromptActive] = useState(false);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [progress, setProgress] = useState({
    attemptedItems: 0,
    exact: 0,
    close: 0,
    partial: 0,
    incorrect: 0,
    overallScore: 0,
  });

  const pollRef = useRef(null);
  const pollStartedAtRef = useRef(null);
  const timerRef = useRef(null);

  const currentItem = useMemo(() => items[currentIndex] || null, [items, currentIndex]);

  const completionPercent =
    items.length > 0 ? Math.round((progress.attemptedItems / items.length) * 100) : 0;

  const friendlyFeedback = useMemo(() => {
    if (selectedMode === "companion") {
      if (pageError) return pageError;
      return companionActive
        ? "Companion mode is active and waiting for a keyword."
        : "Preparing companion mode.";
    }

    if (!latestResult) {
      if (sessionPaused) return "Therapy session paused.";
      if (sessionCompleted) return "Therapy session completed.";
      return "Therapy session is running.";
    }

    if (latestResult.matchStatus === "exact") return "Excellent work.";
    if (latestResult.matchStatus === "close") return "Very close.";
    if (latestResult.matchStatus === "partial") return "Good try.";
    return "Try once more.";
  }, [selectedMode, companionActive, pageError, sessionPaused, sessionCompleted, latestResult]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollStartedAtRef.current = null;
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
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

      const [startH, startM] = String(startTime).split(":").map(Number);
      const [endH, endM] = String(endTime).split(":").map(Number);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch {
      return true;
    }
  };

  const getTodaySessionCount = async (childData) => {
    if (!childData?.id) return 0;

    const todayKey = getTodayKey();

    try {
      const dailyUsageRef = doc(db, "children", childData.id, "dailyUsage", todayKey);
      const dailyUsageSnap = await getDoc(dailyUsageRef);

      if (dailyUsageSnap.exists()) {
        return Number(dailyUsageSnap.data().sessionCount || 0);
      }
    } catch {}

    if (childData.lastSessionDate === todayKey) {
      return Number(childData.todaySessionCount || 0);
    }

    return 0;
  };

  const sortItems = (itemList) => {
    return [...itemList].sort((a, b) => {
      const aTrack = Number(a?.mp3Track || 0);
      const bTrack = Number(b?.mp3Track || 0);

      if (aTrack > 0 && bTrack > 0 && aTrack !== bTrack) {
        return aTrack - bTrack;
      }

      const aCreated = a?.createdAt?.seconds || 0;
      const bCreated = b?.createdAt?.seconds || 0;
      return aCreated - bCreated;
    });
  };

  const evaluateTherapyAvailability = async (childData, planData) => {
    if (!childData || !planData) {
      return {
        allowed: false,
        reason: "Therapy mode is not ready yet. Companion mode is available.",
      };
    }

    const maxSessionsPerDay = Number(planData.maxSessionsPerDay || 0);
    const lockTherapyAfterLimit = !!planData.lockTherapyAfterLimit;

    if (maxSessionsPerDay < 1) {
      return {
        allowed: false,
        reason: "Therapy mode is not configured yet. Companion mode is available.",
      };
    }

    const inAllowedTime = isWithinTherapyTime(
      planData.therapyStartTime,
      planData.therapyEndTime
    );

    if (!inAllowedTime) {
      return {
        allowed: false,
        reason: `Therapy time is available only during ${
          planData.therapyStartTime || "--"
        } - ${planData.therapyEndTime || "--"}. Companion mode is available now.`,
      };
    }

    const todaySessionCount = await getTodaySessionCount(childData);

    if (lockTherapyAfterLimit && todaySessionCount >= maxSessionsPerDay) {
      return {
        allowed: false,
        reason: `Today's therapy limit (${maxSessionsPerDay}) has been reached. Companion mode is still available.`,
      };
    }

    return { allowed: true, reason: "" };
  };

  const loadPageData = async () => {
    try {
      setLoading(true);
      setPageError("");

      if (!state?.childId) {
        setPageError("Missing child information.");
        setLoading(false);
        return;
      }

      const childSnap = await getDoc(doc(db, "children", state.childId));
      if (!childSnap.exists()) {
        setPageError("Child record not found.");
        setLoading(false);
        return;
      }

      const childData = { id: childSnap.id, ...childSnap.data() };
      setChild(childData);

      const parentUid = childData.parentUid || auth.currentUser?.uid || "";
      if (parentUid) {
        const parentSnap = await getDoc(doc(db, "parents", parentUid));
        if (parentSnap.exists()) {
          setParent({ id: parentSnap.id, ...parentSnap.data() });
        }
      }

      const therapistUid = state?.therapistUid || childData.therapistUid || "";
      if (therapistUid) {
        const therapistSnap = await getDoc(doc(db, "therapists", therapistUid));
        if (therapistSnap.exists()) {
          setTherapist({ id: therapistSnap.id, ...therapistSnap.data() });
        }
      }

      const levelId = state?.assignedLevelId || childData.assignedLevelId || "";
      if (!levelId) {
        setPageError("No assigned level found.");
        setLoading(false);
        return;
      }

      const levelSnap = await getDoc(doc(db, "levels", levelId));
      if (levelSnap.exists()) {
        setLevelInfo({ id: levelSnap.id, ...levelSnap.data() });
      }

      const itemsRef = collection(db, "levels", levelId, "items");
      let itemDocs = [];

      try {
        const orderedItems = query(itemsRef, orderBy("createdAt", "asc"));
        const itemSnap = await getDocs(orderedItems);
        itemDocs = itemSnap.docs;
      } catch {
        const itemSnap = await getDocs(itemsRef);
        itemDocs = itemSnap.docs;
      }

      const itemList = itemDocs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(sortItems(itemList));

      let loadedPlan = null;
      if (state?.therapyPlan) {
        loadedPlan = state.therapyPlan;
        setTherapyPlanData(state.therapyPlan);
      } else {
        const planSnap = await getDoc(doc(db, "therapyPlans", state.childId));
        if (planSnap.exists()) {
          loadedPlan = { id: planSnap.id, ...planSnap.data() };
          setTherapyPlanData(loadedPlan);
        }
      }

      const deviceDocId =
        state?.deviceId || childData.deviceId || childData.deviceCode || "";

      if (deviceDocId) {
        const deviceSnap = await getDoc(doc(db, "devices", deviceDocId));
        if (deviceSnap.exists()) {
          setDeviceInfo({ id: deviceSnap.id, ...deviceSnap.data() });
        } else {
          setDeviceInfo({
            id: deviceDocId,
            deviceId: childData.deviceId || state?.deviceId || "",
            deviceCode: childData.deviceCode || state?.deviceCode || "",
            deviceName: childData.deviceName || state?.deviceName || "Assigned Device",
            deviceStatus: childData.deviceStatus || "Assigned",
          });
        }
      }

      const therapyAccess = await evaluateTherapyAvailability(childData, loadedPlan);
      setTherapyModeAllowed(therapyAccess.allowed);
      setTherapyRestrictionMessage(therapyAccess.reason || "");

      setSelectedMode("companion");
      setLoading(false);
    } catch (error) {
      console.log("Load page error:", error);
      setPageError(error.message || "Failed to load device page.");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPageData();

    return () => {
      stopPolling();
      stopTimer();
    };
  }, []);

  const activateCompanionMode = async () => {
    try {
      setSelectedMode("companion");
      setPageError("");
      setStage("Activating companion mode...");

      const response = await fetch(`${SERVER}/companion-start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: child?.id || "",
          childName: child?.childName || "",
          deviceId: deviceInfo?.id || state?.deviceId || child?.deviceId || "",
          deviceCode: deviceInfo?.deviceCode || state?.deviceCode || child?.deviceCode || "",
          startTrack: 23,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start companion mode");

      setCompanionActive(true);
      setStage(data.message || "Companion mode active");
      setLatestResult(null);
    } catch (error) {
      console.log("Companion mode error:", error);
      setCompanionActive(false);
      setPageError(error.message || "Failed to start companion mode.");
      setStage("Companion mode failed");
    }
  };

  const stopCompanionMode = async () => {
    try {
      await fetch(`${SERVER}/companion-stop`, { method: "POST" });
    } catch (error) {
      console.log("Companion stop error:", error);
    } finally {
      setCompanionActive(false);
    }
  };

  useEffect(() => {
    if (!loading && selectedMode === "companion" && !sessionStarted && !companionActive) {
      activateCompanionMode();
    }
  }, [loading, selectedMode, sessionStarted, companionActive]);

  useEffect(() => {
    if (!sessionStarted || sessionCompleted || !therapyPlanData?.sessionDurationMinutes) return;
    if (selectedMode !== "therapy") return;

    const maxSeconds = Number(therapyPlanData.sessionDurationMinutes) * 60;

    if (maxSeconds > 0 && elapsedSeconds >= maxSeconds) {
      stopPolling();
      stopTimer();
      setSessionCompleted(true);
      setSessionStarted(false);
      setSessionPaused(false);
      setIsBusy(false);
      setIsListening(false);
      setToyPromptActive(false);
      setStage("Session duration limit reached");
      setPageError("This therapy session reached the allowed time limit.");
    }
  }, [elapsedSeconds, sessionStarted, sessionCompleted, therapyPlanData, selectedMode]);

  const createSession = async () => {
    if (!child) return "";
    if (sessionId) return sessionId;

    const sessionRef = await addDoc(collection(db, "sessions"), {
      childId: child.id,
      childName: child.childName || state?.childName || "",
      childCode: child.childCode || state?.childCode || "",
      parentUid: child.parentUid || auth.currentUser?.uid || "",
      parentName: parent?.name || child.parentName || "",
      parentEmail: parent?.email || child.parentEmail || "",
      parentContact: parent?.contact || child.parentContact || "",
      therapistUid: therapist?.id || state?.therapistUid || child.therapistUid || "",
      therapistName: therapist?.name || child.therapistName || "",
      therapistContact: therapist?.contact || child.therapistContact || "",
      deviceId: state?.deviceId || child.deviceId || child.deviceCode || "",
      deviceCode: state?.deviceCode || child.deviceCode || child.deviceId || "",
      deviceName:
        state?.deviceName ||
        child.deviceName ||
        deviceInfo?.deviceName ||
        "Assigned Device",
      levelId: levelInfo?.id || state?.assignedLevelId || child.assignedLevelId || "",
      levelTitle: levelInfo?.title || child.assignedLevelName || "",
      therapyPlan: therapyPlanData || null,
      sessionMode: "therapy",
      sessionDate: getTodayKey(),
      startedAt: serverTimestamp(),
      endedAt: null,
      status: "active",
      totalItems: items.length,
      attemptedItems: 0,
      exactCount: 0,
      closeCount: 0,
      partialCount: 0,
      incorrectCount: 0,
      overallScore: 0,
    });

    setSessionId(sessionRef.id);
    return sessionRef.id;
  };

  const saveAttempt = async (resultData, itemData, currentAttempt, activeSessionId) => {
    if (!activeSessionId || !itemData) return;

    await addDoc(collection(db, "sessions", activeSessionId, "attempts"), {
      itemId: itemData.id,
      itemText: itemData.text || "",
      itemType: itemData.type || "word",
      itemImage: itemData.imageUrl || "",
      mp3Track: Number(itemData.mp3Track || 0),
      attemptNumber: currentAttempt,
      recognizedText: resultData.recognizedText || "",
      targetText: resultData.targetText || "",
      score: resultData.score || 0,
      matchStatus: resultData.matchStatus || "incorrect",
      feedback: resultData.feedback || "",
      feedbackTrack: Number(resultData.feedbackTrack || 0),
      movedToNext: !!resultData.moveNext,
      shouldRetry: !!resultData.shouldRetry,
      createdAt: serverTimestamp(),
      time: resultData.time || new Date().toISOString(),
    });
  };

  const updateDailyUsage = async (childData, finalProgress) => {
    if (!childData?.id) return;

    const todayKey = getTodayKey();
    const dailyUsageRef = doc(db, "children", childData.id, "dailyUsage", todayKey);
    const todayCount = await getTodaySessionCount(childData);

    await setDoc(
      dailyUsageRef,
      {
        childId: childData.id,
        date: todayKey,
        sessionCount: todayCount + 1,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await updateDoc(doc(db, "children", childData.id), {
      lastSessionDate: todayKey,
      todaySessionCount: todayCount + 1,
      latestOverallScore: finalProgress.overallScore,
      latestSessionCompletedAt: serverTimestamp(),
    });
  };

  const updateSessionSummary = async (activeSessionId, updatedProgress, completed = false) => {
    if (!activeSessionId) return;

    await updateDoc(doc(db, "sessions", activeSessionId), {
      attemptedItems: updatedProgress.attemptedItems,
      exactCount: updatedProgress.exact,
      closeCount: updatedProgress.close,
      partialCount: updatedProgress.partial,
      incorrectCount: updatedProgress.incorrect,
      overallScore: updatedProgress.overallScore,
      status: completed ? "completed" : "active",
      endedAt: completed ? serverTimestamp() : null,
    });
  };

  const triggerPractice = async (itemData, currentAttempt, itemIndex) => {
    try {
      if (!itemData?.text) throw new Error("Current item text is missing.");

      const parsedTrack = Number(itemData.mp3Track || 0);
      if (!parsedTrack || parsedTrack < 1) {
        throw new Error("Current item MP3 track is missing or invalid.");
      }

      setIsBusy(true);
      setIsListening(false);
      setToyPromptActive(true);
      setPageError("");
      setLatestResult(null);
      setStage("Sending item to toy...");

      const activeSessionId = await createSession();

      const response = await fetch(`${SERVER}/practice-trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: itemData.type || "word",
          itemId: itemData.id,
          type: itemData.type || "word",
          targetText: itemData.text || "",
          displayText: itemData.displayText || itemData.text || "",
          attempt: currentAttempt,
          sessionId: activeSessionId,
          mp3Track: parsedTrack,
          promptDelayMs: Number(itemData.promptDelayMs || 2500),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to trigger practice");

      const taskKey = data?.task?.taskKey || "";
      setStage("Prompt is playing...");
      startPolling(itemData, currentAttempt, activeSessionId, taskKey, itemIndex);
    } catch (error) {
      console.log("Trigger error:", error);
      setStage("Trigger failed");
      setPageError(error.message || "Failed to trigger practice.");
      setIsBusy(false);
      setIsListening(false);
      setToyPromptActive(false);
    }
  };

  const startPolling = (
    itemData,
    currentAttempt,
    activeSessionId,
    taskKey = "",
    itemIndex = 0
  ) => {
    stopPolling();
    pollStartedAtRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      try {
        if (pollStartedAtRef.current && Date.now() - pollStartedAtRef.current > POLL_TIMEOUT_MS) {
          stopPolling();
          setIsListening(false);
          setToyPromptActive(false);
          setStage("Polling timeout");
          setPageError("No response was received in time.");
          setIsBusy(false);
          return;
        }

        const url = taskKey
          ? `${SERVER}/practice-result?taskKey=${encodeURIComponent(taskKey)}`
          : `${SERVER}/practice-result`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.ready) {
          if (data.stage === "waiting-for-esp") {
            setToyPromptActive(true);
            setIsListening(false);
            setStage("Preparing...");
          } else if (data.stage === "playing-prompt") {
            setToyPromptActive(true);
            setIsListening(false);
            setStage("Playing prompt...");
          } else if (data.stage === "listening") {
            setToyPromptActive(false);
            setIsListening(true);
            setStage("Listening...");
          } else if (data.stage === "processing-whisper") {
            setToyPromptActive(false);
            setIsListening(false);
            setStage("Checking response...");
          } else {
            setStage("Waiting...");
          }
          return;
        }

        stopPolling();
        setIsListening(false);
        setToyPromptActive(false);
        await handlePracticeResult(data, itemData, currentAttempt, activeSessionId, itemIndex);
      } catch (error) {
        console.log("Polling error:", error);
        stopPolling();
        setIsListening(false);
        setToyPromptActive(false);
        setStage("Polling failed");
        setPageError(error.message || "Polling failed.");
        setIsBusy(false);
      }
    }, POLL_INTERVAL_MS);
  };

  const handlePracticeResult = async (
    resultData,
    itemData,
    currentAttempt,
    activeSessionId,
    itemIndex
  ) => {
    setLatestResult(resultData);
    setStage("Result received");

    await saveAttempt(resultData, itemData, currentAttempt, activeSessionId);

    let updatedProgress = null;

    setProgress((prev) => {
      const next = { ...prev };

      if (resultData.moveNext) {
        next.attemptedItems += 1;
        if (resultData.matchStatus === "exact") next.exact += 1;
        else if (resultData.matchStatus === "close") next.close += 1;
        else if (resultData.matchStatus === "partial") next.partial += 1;
        else next.incorrect += 1;
      }

      next.overallScore =
        next.attemptedItems > 0
          ? Math.round(
              ((next.exact * 100 +
                next.close * 80 +
                next.partial * 50 +
                next.incorrect * 20) /
                (next.attemptedItems * 100)) *
                100
            )
          : 0;

      updatedProgress = next;
      return next;
    });

    if (updatedProgress) {
      await updateSessionSummary(activeSessionId, updatedProgress, false);
    }

    if (resultData.shouldRetry && currentAttempt < MAX_ATTEMPTS) {
      const nextAttempt = currentAttempt + 1;
      setAttempt(nextAttempt);
      setStage(`Try again ${nextAttempt}/${MAX_ATTEMPTS}`);

      setTimeout(() => {
        triggerPractice(itemData, nextAttempt, itemIndex);
      }, 3200);

      return;
    }

    setAttempt(1);

    const nextIndex = itemIndex + 1;

    if (nextIndex < items.length) {
      setStage("Moving to next item...");

      setTimeout(() => {
        setLatestResult(null);
        setPageError("");
        setCurrentIndex(nextIndex);
        setIsBusy(false);

        const nextItem = items[nextIndex];
        if (nextItem) {
          setTimeout(() => {
            triggerPractice(nextItem, 1, nextIndex);
          }, 1400);
        }
      }, 1800);
    } else if (updatedProgress) {
      await finishTherapySession(activeSessionId, updatedProgress);
    }
  };

  const finishTherapySession = async (activeSessionId, finalProgress) => {
    setSessionCompleted(true);
    setSessionStarted(false);
    setSessionPaused(false);
    setIsBusy(false);
    setIsListening(false);
    setToyPromptActive(false);
    setStage("Session completed");
    stopTimer();
    stopPolling();

    await updateSessionSummary(activeSessionId, finalProgress, true);
    await updateDailyUsage(child, finalProgress);

    try {
      await addDoc(collection(db, "sessionSummaries"), {
        sessionId: activeSessionId,
        childId: child?.id || state?.childId || "",
        childName: child?.childName || state?.childName || "",
        childCode: child?.childCode || state?.childCode || "",
        levelId: levelInfo?.id || "",
        levelTitle: levelInfo?.title || "",
        sessionMode: "therapy",
        totalItems: items.length,
        attemptedItems: finalProgress.attemptedItems,
        exactCount: finalProgress.exact,
        closeCount: finalProgress.close,
        partialCount: finalProgress.partial,
        incorrectCount: finalProgress.incorrect,
        overallScore: finalProgress.overallScore,
        createdAt: serverTimestamp(),
        elapsedSeconds,
      });
    } catch (error) {
      console.log("Summary save error:", error);
    }

    try {
      await fetch(`${SERVER}/practice-reset`, { method: "POST" });
    } catch (error) {
      console.log("Practice reset after finish error:", error);
    }

    setTimeout(() => {
      setSelectedMode("companion");
      setCompanionActive(false);
      setStage("Returning to companion mode...");
    }, 1000);
  };

  const beginTherapySession = async () => {
    setPageError("");
    setSessionBlocked(false);

    const therapyAccess = await evaluateTherapyAvailability(child, therapyPlanData);
    setTherapyModeAllowed(therapyAccess.allowed);
    setTherapyRestrictionMessage(therapyAccess.reason || "");

    if (!therapyAccess.allowed) {
      setSelectedMode("companion");
      setSessionBlocked(true);
      setPageError(therapyAccess.reason);
      setStage("Therapy mode unavailable");
      return;
    }

    if (!items.length) {
      setSessionBlocked(true);
      setPageError("No items found in the assigned level.");
      return;
    }

    await stopCompanionMode();

    setSelectedMode("therapy");
    setSessionStarted(true);
    setSessionCompleted(false);
    setSessionPaused(false);
    setCurrentIndex(0);
    setAttempt(1);
    setElapsedSeconds(0);
    setSessionId("");
    setProgress({
      attemptedItems: 0,
      exact: 0,
      close: 0,
      partial: 0,
      incorrect: 0,
      overallScore: 0,
    });
    setLatestResult(null);
    setStage("Therapy session started");
    startTimer();

    const firstItem = items[0];
    if (firstItem) {
      setTimeout(() => {
        triggerPractice(firstItem, 1, 0);
      }, 600);
    }
  };

  const pauseSession = async () => {
    if (!sessionStarted || sessionCompleted || sessionPaused) return;

    stopPolling();
    stopTimer();

    try {
      await fetch(`${SERVER}/practice-reset`, { method: "POST" });
    } catch (error) {
      console.log("Practice reset on pause error:", error);
    }

    setSessionPaused(true);
    setIsBusy(false);
    setIsListening(false);
    setToyPromptActive(false);
    setStage("Session paused");
  };

  const resumeSession = async () => {
    if (!sessionStarted || sessionCompleted || !sessionPaused) return;

    setSessionPaused(false);
    startTimer();
    setStage("Session resumed");

    if (currentItem) {
      setTimeout(() => {
        triggerPractice(currentItem, attempt || 1, currentIndex);
      }, 800);
    }
  };

  const endSession = async () => {
    Alert.alert("End session", "Do you want to end this therapy session now?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End",
        style: "destructive",
        onPress: async () => {
          stopPolling();
          stopTimer();

          if (!sessionId) {
            setSessionStarted(false);
            setSessionCompleted(true);
            setSessionPaused(false);
            setIsBusy(false);
            setIsListening(false);
            setToyPromptActive(false);
            setStage("Session ended");
            setSelectedMode("companion");
            setCompanionActive(false);

            try {
              await fetch(`${SERVER}/practice-reset`, { method: "POST" });
            } catch (error) {
              console.log("Practice reset after manual end error:", error);
            }

            return;
          }

          const finalProgress = { ...progress };
          await finishTherapySession(sessionId, finalProgress);
        },
      },
    ]);
  };

  const restartAll = async () => {
    stopPolling();
    stopTimer();

    try {
      await fetch(`${SERVER}/practice-reset`, { method: "POST" });
    } catch (error) {
      console.log("Practice reset error:", error);
    }

    await stopCompanionMode();

    setSessionId("");
    setSessionStarted(false);
    setSessionCompleted(false);
    setSessionBlocked(false);
    setSessionPaused(false);
    setCurrentIndex(0);
    setAttempt(1);
    setStage("Ready");
    setLatestResult(null);
    setIsBusy(false);
    setIsListening(false);
    setToyPromptActive(false);
    setElapsedSeconds(0);
    setProgress({
      attemptedItems: 0,
      exact: 0,
      close: 0,
      partial: 0,
      incorrect: 0,
      overallScore: 0,
    });
    setPageError("");
    setSelectedMode("companion");
    setCompanionActive(false);

    const therapyAccess = await evaluateTherapyAvailability(child, therapyPlanData);
    setTherapyModeAllowed(therapyAccess.allowed);
    setTherapyRestrictionMessage(therapyAccess.reason || "");
  };

  const scoreCards = [
    { label: "Exact", value: progress.exact, icon: "✅" },
    { label: "Close", value: progress.close, icon: "🌟" },
    { label: "Partial", value: progress.partial, icon: "🙂" },
    { label: "Incorrect", value: progress.incorrect, icon: "🔁" },
  ];

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading device page...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[
        styles.page,
        selectedMode === "companion" ? styles.pageCompanion : styles.pageTherapy,
      ]}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topStrip}>
        <TopInfoCard
          label="Child"
          title={child?.childName || state?.childName || "-"}
          subtitle={child?.childCode || state?.childCode || "-"}
        />
        <TopInfoCard
          label="Level"
          title={levelInfo?.title || child?.assignedLevelName || "-"}
          subtitle={`${items.length} items`}
        />
        <TopInfoCard
          label="Device"
          title={deviceInfo?.deviceName || state?.deviceName || "-"}
          subtitle={deviceInfo?.deviceStatus || "-"}
        />
        <TopInfoCard
          label={selectedMode === "therapy" ? "Session Timer" : "Companion"}
          title={
            selectedMode === "therapy"
              ? formatTime(elapsedSeconds)
              : companionActive
              ? "Active"
              : "Starting"
          }
          subtitle={selectedMode === "therapy" ? "Therapy session" : "Friendly mode"}
          dark
        />
      </View>

      {!therapyModeAllowed && (
        <Banner
          type="warning"
          text={`Therapy mode is resting. ${therapyRestrictionMessage}`}
        />
      )}

      {!!pageError && <Banner type="error" text={pageError} />}

      <View style={styles.mainCard}>
        <View style={styles.headerArea}>
          <View style={{ flex: 1 }}>
            <View
              style={[
                styles.modePill,
                selectedMode === "therapy" ? styles.modePillTherapy : styles.modePillCompanion,
              ]}
            >
              <Text
                style={[
                  styles.modePillText,
                  selectedMode === "therapy"
                    ? styles.modePillTextTherapy
                    : styles.modePillTextCompanion,
                ]}
              >
                {selectedMode === "therapy" ? "Therapy Mode" : "Companion Mode"}
              </Text>
            </View>

            <Text style={styles.headerTitle}>Speech Practice Device</Text>
            <Text style={styles.headerSubtitle}>
              {selectedMode === "therapy"
                ? "A guided therapy session is running automatically for the child."
                : "The device is in companion mode and waiting for friendly interaction."}
            </Text>
          </View>
        </View>

        <View style={styles.layout}>
          <View style={styles.practiceCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusChip}>
                <Text style={styles.statusChipText}>
                  {selectedMode === "therapy"
                    ? `Item ${items.length > 0 ? currentIndex + 1 : 0} / ${items.length}`
                    : "Friendly Interaction"}
                </Text>
              </View>

              <View style={[styles.statusChip, styles.statusChipSecondary]}>
                <Text style={[styles.statusChipText, styles.statusChipSecondaryText]}>
                  {selectedMode === "therapy" ? currentItem?.type || "-" : "keyword listening"}
                </Text>
              </View>
            </View>

            {selectedMode === "therapy" ? (
              <>
                <View style={styles.imageFrame}>
                  {currentItem?.imageUrl ? (
                    <Image
                      source={{ uri: currentItem.imageUrl }}
                      style={styles.itemImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={styles.imagePlaceholder}>No image available</Text>
                  )}
                </View>

                <View style={styles.wordArea}>
                  <Text style={styles.wordText}>{currentItem?.text || "No item found"}</Text>
                  <Text style={styles.feedbackText}>{friendlyFeedback}</Text>
                </View>

                <View style={styles.liveStatusBox}>
                  <Text style={styles.liveStatusLabel}>Live Status</Text>
                  <Text style={styles.liveStatusValue}>
                    {isListening
                      ? "Listening..."
                      : toyPromptActive
                      ? "Playing prompt..."
                      : stage}
                  </Text>
                </View>
              </>
            ) : (
              <LinearGradient
                colors={["#fff8ef", "#fff1e3"]}
                style={styles.companionCard}
              >
                <Text style={styles.companionEmoji}>🧸</Text>
                <Text style={styles.companionTitle}>Companion Mode</Text>
                <Text style={styles.companionText}>{friendlyFeedback}</Text>

                <View style={[styles.liveStatusBox, { marginTop: 18 }]}>
                  <Text style={styles.liveStatusLabel}>Current Status</Text>
                  <Text style={styles.liveStatusValue}>{stage}</Text>
                </View>
              </LinearGradient>
            )}

            <View style={styles.controlStack}>
              {selectedMode === "companion" ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      (!therapyModeAllowed || sessionBlocked || !items.length) && styles.btnDisabled,
                    ]}
                    onPress={beginTherapySession}
                    disabled={!therapyModeAllowed || sessionBlocked || !items.length}
                  >
                    <Text style={styles.primaryBtnText}>Start Therapy Session</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.ghostBtn} onPress={restartAll}>
                    <Text style={styles.ghostBtnText}>Restart Device Flow</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {sessionPaused ? (
                    <TouchableOpacity
                      style={[styles.primaryBtn, sessionCompleted && styles.btnDisabled]}
                      onPress={resumeSession}
                      disabled={sessionCompleted}
                    >
                      <Text style={styles.primaryBtnText}>Resume Session</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.primaryBtn, styles.runningBtn]}>
                      <Text style={styles.primaryBtnText}>Therapy Running</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.secondaryBtn,
                      (!sessionStarted || sessionCompleted || sessionPaused) && styles.btnDisabled,
                    ]}
                    onPress={pauseSession}
                    disabled={!sessionStarted || sessionCompleted || sessionPaused}
                  >
                    <Text style={styles.secondaryBtnText}>Pause</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.dangerBtn,
                      (!sessionStarted || sessionCompleted) && styles.btnDisabled,
                    ]}
                    onPress={endSession}
                    disabled={!sessionStarted || sessionCompleted}
                  >
                    <Text style={styles.dangerBtnText}>End</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.ghostBtn} onPress={restartAll}>
                    <Text style={styles.ghostBtnText}>Restart</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          <View style={styles.sideColumn}>
            <View style={styles.sideCard}>
              <Text style={styles.sideLabel}>Session Progress</Text>

              <View style={styles.progressCircle}>
                <Text style={styles.progressCircleValue}>{completionPercent}%</Text>
                <Text style={styles.progressCircleSub}>Completed</Text>
              </View>

              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${completionPercent}%` }]} />
              </View>

              <Text style={styles.sideNote}>
                {progress.attemptedItems} of {items.length} items attempted
              </Text>
            </View>

            <View style={[styles.sideCard, styles.sideCardHighlight]}>
              <Text style={styles.sideLabel}>Overall Progress</Text>
              <Text style={styles.overallScore}>{progress.overallScore}%</Text>
              <Text style={styles.sideNote}>
                Overall therapy progress based on completed practice items.
              </Text>
            </View>

            <View style={styles.sideCard}>
              <Text style={styles.sideLabel}>Current Status</Text>

              <View style={styles.statusGrid}>
                <StatusItem label="Stage" value={stage} />
                <StatusItem label="Attempt" value={`${attempt}/${MAX_ATTEMPTS}`} />
                <StatusItem
                  label="Session"
                  value={
                    sessionCompleted
                      ? "Completed"
                      : sessionPaused
                      ? "Paused"
                      : sessionStarted
                      ? "Active"
                      : "Ready"
                  }
                />
                <StatusItem label="Mode" value={selectedMode} />
              </View>
            </View>

            <View style={styles.sideCard}>
              <Text style={styles.sideLabel}>Result Summary</Text>
              <View style={styles.resultGrid}>
                {scoreCards.map((item) => (
                  <View key={item.label} style={styles.resultTile}>
                    <Text style={styles.resultTileIcon}>{item.icon}</Text>
                    <Text style={styles.resultTileValue}>{item.value}</Text>
                    <Text style={styles.resultTileLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sideCard}>
              <Text style={styles.sideLabel}>Quick Details</Text>
              <InfoRow label="Child Code" value={child?.childCode || "-"} />
              <InfoRow
                label="Device Code"
                value={deviceInfo?.deviceCode || state?.deviceCode || "-"}
              />
              <InfoRow
                label="Level"
                value={levelInfo?.title || child?.assignedLevelName || "-"}
              />
              <InfoRow
                label="Therapist"
                value={therapist?.name || child?.therapistName || "Not assigned"}
              />
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function TopInfoCard({ label, title, subtitle, dark = false }) {
  return (
    <View style={[styles.topCard, dark && styles.topCardDark]}>
      <Text style={[styles.topCardLabel, dark && styles.topCardLabelDark]}>{label}</Text>
      <Text style={[styles.topCardTitle, dark && styles.topCardTitleDark]}>{title}</Text>
      <Text style={[styles.topCardSub, dark && styles.topCardSubDark]}>{subtitle}</Text>
    </View>
  );
}

function Banner({ type, text }) {
  return (
    <View style={[styles.banner, type === "warning" ? styles.warningBanner : styles.errorBanner]}>
      <Text style={[styles.bannerText, type === "warning" ? styles.warningText : styles.errorText]}>
        {text}
      </Text>
    </View>
  );
}

function StatusItem({ label, value }) {
  return (
    <View style={styles.statusItem}>
      <Text style={styles.statusItemLabel}>{label}</Text>
      <Text style={styles.statusItemValue}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={styles.infoRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  pageTherapy: {
    backgroundColor: "#eef6ff",
  },
  pageCompanion: {
    backgroundColor: "#fff7ef",
  },
  pageContent: {
    padding: 16,
    paddingBottom: 34,
  },

  loadingWrap: {
    flex: 1,
    backgroundColor: "#eef6ff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e4968",
  },

  topStrip: {
    gap: 12,
    marginBottom: 16,
  },
  topCard: {
    backgroundColor: "rgba(255,255,255,0.86)",
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
    ...shadows.card,
  },
  topCardDark: {
    backgroundColor: "#133d54",
  },
  topCardLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#5b7d98",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  topCardLabelDark: {
    color: "#ffffff",
  },
  topCardTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: "#163a5a",
  },
  topCardTitleDark: {
    color: "#ffffff",
  },
  topCardSub: {
    marginTop: 4,
    color: "#6f8ea7",
    fontSize: 13,
    fontWeight: "600",
  },
  topCardSubDark: {
    color: "#ffffff",
  },

  banner: {
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  warningBanner: {
    backgroundColor: "#fff4da",
    borderWidth: 1,
    borderColor: "#f3d17f",
  },
  errorBanner: {
    backgroundColor: "#ffe8e8",
    borderWidth: 1,
    borderColor: "#efb3b3",
  },
  bannerText: {
    fontWeight: "700",
    lineHeight: 20,
  },
  warningText: {
    color: "#8a6000",
  },
  errorText: {
    color: "#b03737",
  },

  mainCard: {
    backgroundColor: "rgba(255,255,255,0.84)",
    borderRadius: 30,
    padding: 18,
    ...shadows.card,
  },
  headerArea: {
    marginBottom: 18,
  },
  modePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  modePillTherapy: {
    backgroundColor: "#ddf5ff",
  },
  modePillCompanion: {
    backgroundColor: "#ffe8cf",
  },
  modePillText: {
    fontSize: 13,
    fontWeight: "800",
  },
  modePillTextTherapy: {
    color: "#0e6887",
  },
  modePillTextCompanion: {
    color: "#bb651f",
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#102f49",
    marginBottom: 8,
  },
  headerSubtitle: {
    color: "#617f97",
    lineHeight: 21,
    fontSize: 14,
  },

  layout: {
    gap: 16,
  },
  practiceCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 26,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d7e7f5",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  statusChip: {
    backgroundColor: "#e8f8ff",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  statusChipSecondary: {
    backgroundColor: "#edf4f8",
  },
  statusChipText: {
    color: "#0f637c",
    fontSize: 13,
    fontWeight: "800",
  },
  statusChipSecondaryText: {
    color: "#4f6980",
  },

  imageFrame: {
    minHeight: 270,
    borderRadius: 28,
    backgroundColor: "#f5fbff",
    borderWidth: 2,
    borderColor: "#d7eef9",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    marginBottom: 18,
  },
  itemImage: {
    width: "100%",
    height: 240,
  },
  imagePlaceholder: {
    color: "#7b97aa",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },

  wordArea: {
    alignItems: "center",
    marginBottom: 16,
  },
  wordText: {
    fontSize: 34,
    fontWeight: "900",
    color: "#0f2f49",
    textAlign: "center",
    marginBottom: 8,
  },
  feedbackText: {
    fontSize: 15,
    color: "#67839a",
    textAlign: "center",
    lineHeight: 22,
  },

  liveStatusBox: {
    backgroundColor: "#f4fbff",
    borderWidth: 1,
    borderColor: "#dbeef9",
    borderRadius: 20,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  liveStatusLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#1890aa",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  liveStatusValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#173d5d",
    textAlign: "center",
  },

  companionCard: {
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 360,
    borderWidth: 2,
    borderColor: "#ffd5b5",
    marginBottom: 16,
  },
  companionEmoji: {
    fontSize: 58,
    marginBottom: 14,
  },
  companionTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#16324a",
    marginBottom: 10,
  },
  companionText: {
    color: "#6b7f91",
    textAlign: "center",
    lineHeight: 22,
    fontSize: 15,
  },

  controlStack: {
    gap: 10,
    marginTop: 16,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  runningBtn: {
    opacity: 0.95,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryBtn: {
    backgroundColor: "#eef5f8",
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#446074",
    fontSize: 15,
    fontWeight: "900",
  },
  dangerBtn: {
    backgroundColor: "#fff0f0",
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
  },
  dangerBtnText: {
    color: "#d14d4d",
    fontSize: 15,
    fontWeight: "900",
  },
  ghostBtn: {
    backgroundColor: "#f7f9fb",
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
  },
  ghostBtnText: {
    color: "#2c4458",
    fontSize: 15,
    fontWeight: "900",
  },
  btnDisabled: {
    opacity: 0.55,
  },

  sideColumn: {
    gap: 14,
  },
  sideCard: {
    backgroundColor: "rgba(248,252,255,0.96)",
    borderWidth: 1,
    borderColor: "#dcecf6",
    borderRadius: 24,
    padding: 18,
  },
  sideCardHighlight: {
    backgroundColor: "#eefcff",
  },
  sideLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#10849c",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  progressCircle: {
    width: 126,
    height: 126,
    borderRadius: 63,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#daf5ff",
    marginBottom: 16,
  },
  progressCircleValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#103a58",
  },
  progressCircleSub: {
    color: "#6a879e",
    fontWeight: "700",
    fontSize: 12,
  },
  progressBar: {
    width: "100%",
    height: 14,
    borderRadius: 999,
    backgroundColor: "#e6f0f6",
    overflow: "hidden",
    marginBottom: 12,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  sideNote: {
    color: "#5c768b",
    fontSize: 13,
    lineHeight: 20,
  },

  overallScore: {
    fontSize: 44,
    fontWeight: "900",
    color: "#0f3c5f",
    marginBottom: 8,
  },

  statusGrid: {
    gap: 12,
  },
  statusItem: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
  },
  statusItemLabel: {
    color: "#7592a8",
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "700",
  },
  statusItemValue: {
    color: "#183d5e",
    fontSize: 14,
    fontWeight: "900",
  },

  resultGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  resultTile: {
    width: "47%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  resultTileIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  resultTileValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#183d5e",
    marginBottom: 4,
  },
  resultTileLabel: {
    color: "#6a879e",
    fontSize: 12,
    fontWeight: "700",
  },

  infoRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eaf0f4",
  },
  infoRowLabel: {
    color: "#7592a8",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  infoRowValue: {
    color: "#183d5e",
    fontSize: 14,
    fontWeight: "900",
  },
});