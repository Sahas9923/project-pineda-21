import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import "../styles/DevicePage.css";

import { auth, db } from "../firebase/config";
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

const SERVER = "https://project-pineda-21-backend.onrender.com";
const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 35000;

const DevicePage = () => {
  const { state } = useLocation();

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
    } catch {
      //
    }

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
      console.error("Load page error:", error);
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
      console.error("Companion mode error:", error);
      setCompanionActive(false);
      setPageError(error.message || "Failed to start companion mode.");
      setStage("Companion mode failed");
    }
  };

  const stopCompanionMode = async () => {
    try {
      await fetch(`${SERVER}/companion-stop`, { method: "POST" });
    } catch (error) {
      console.error("Companion stop error:", error);
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
      console.error("Trigger error:", error);
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
        console.error("Polling error:", error);
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
      console.error("Summary save error:", error);
    }

    try {
      await fetch(`${SERVER}/practice-reset`, { method: "POST" });
    } catch (error) {
      console.error("Practice reset after finish error:", error);
    }

    setTimeout(async () => {
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
      console.error("Practice reset on pause error:", error);
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
        console.error("Practice reset after manual end error:", error);
      }

      return;
    }

    const finalProgress = { ...progress };
    await finishTherapySession(sessionId, finalProgress);
  };

  const restartAll = async () => {
    stopPolling();
    stopTimer();

    try {
      await fetch(`${SERVER}/practice-reset`, { method: "POST" });
    } catch (error) {
      console.error("Practice reset error:", error);
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

  if (loading) {
    return (
      <div className="device-page">
        <div className="device-loading">Loading device page...</div>
      </div>
    );
  }

  return (
    <div className={`device-page ${selectedMode === "companion" ? "companion-theme" : ""}`}>
      <div className="device-shell">
        <div className="device-top-strip">
          <div className="strip-card">
            <span>Child</span>
            <strong>{child?.childName || state?.childName || "-"}</strong>
            <small>{child?.childCode || state?.childCode || "-"}</small>
          </div>

          <div className="strip-card">
            <span>Level</span>
            <strong>{levelInfo?.title || child?.assignedLevelName || "-"}</strong>
            <small>{items.length} items</small>
          </div>

          <div className="strip-card">
            <span>Device</span>
            <strong>{deviceInfo?.deviceName || state?.deviceName || "-"}</strong>
            <small>{deviceInfo?.deviceStatus || "-"}</small>
          </div>

          <div className="strip-card timer-card">
            <span>{selectedMode === "therapy" ? "Session Timer" : "Companion"}</span>
            <strong>
              {selectedMode === "therapy"
                ? formatTime(elapsedSeconds)
                : companionActive
                ? "Active"
                : "Starting"}
            </strong>
          </div>
        </div>

        {!therapyModeAllowed && (
          <div className="device-banner warning-banner">
            <strong>Therapy mode is resting.</strong> {therapyRestrictionMessage}
          </div>
        )}

        {pageError && (
          <div className="device-banner error-banner">
            <strong>Notice:</strong> {pageError}
          </div>
        )}

        <div className={`device-layout ${selectedMode === "companion" ? "companion-layout" : ""}`}>
          <div className="main-device-card">
            <div className="hero-header">
              <div className="hero-heading">
                <span className={`mode-pill ${selectedMode}`}>
                  {selectedMode === "therapy" ? "Therapy Mode" : "Companion Mode"}
                </span>
                <h1>Speech Practice Device</h1>
                <p>
                  {selectedMode === "therapy"
                    ? "A guided smart therapy experience is running automatically."
                    : "The device is in companion mode and listening for keywords."}
                </p>
              </div>
            </div>

            <div className={`practice-zone ${selectedMode === "companion" ? "companion-only" : ""}`}>
              <div className="practice-hero">
                <div className="practice-status-row">
                  <div className="status-chip">
                    {selectedMode === "therapy"
                      ? `Item ${items.length > 0 ? currentIndex + 1 : 0} / ${items.length}`
                      : "Friendly Interaction"}
                  </div>
                  <div className="status-chip secondary">
                    {selectedMode === "therapy" ? currentItem?.type || "-" : "keyword listening"}
                  </div>
                </div>

                {selectedMode === "therapy" ? (
                  <>
                    <div className="image-frame">
                      {currentItem?.imageUrl ? (
                        <img
                          src={currentItem.imageUrl}
                          alt={currentItem.text || "practice item"}
                          className="item-image"
                        />
                      ) : (
                        <div className="image-placeholder">No image available</div>
                      )}
                    </div>

                    <div className="word-area">
                      <h2>{currentItem?.text || "No item found"}</h2>
                      <p>{friendlyFeedback}</p>
                    </div>

                    <div className="live-status-box">
                      <span>Live Status</span>
                      <strong>
                        {isListening
                          ? "Listening..."
                          : toyPromptActive
                          ? "Playing prompt..."
                          : stage}
                      </strong>
                    </div>
                  </>
                ) : (
                  <div className="companion-center-card">
                    <div className="companion-emoji">🧸</div>
                    <h2>Companion Mode</h2>
                    <p>{friendlyFeedback}</p>
                    <div className="live-status-box">
                      <span>Current Status</span>
                      <strong>{stage}</strong>
                    </div>
                  </div>
                )}

                <div className="control-row">
                  {selectedMode === "companion" ? (
                    <>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={beginTherapySession}
                        disabled={!therapyModeAllowed || sessionBlocked || !items.length}
                      >
                        Start Therapy Session
                      </button>

                      <button type="button" className="ghost-btn" onClick={restartAll}>
                        Restart Device Flow
                      </button>
                    </>
                  ) : (
                    <>
                      {sessionPaused ? (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={resumeSession}
                          disabled={sessionCompleted}
                        >
                          Resume Session
                        </button>
                      ) : (
                        <button type="button" className="primary-btn" disabled>
                          Therapy Running
                        </button>
                      )}

                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={pauseSession}
                        disabled={!sessionStarted || sessionCompleted || sessionPaused}
                      >
                        Pause
                      </button>

                      <button
                        type="button"
                        className="danger-btn"
                        onClick={endSession}
                        disabled={!sessionStarted || sessionCompleted}
                      >
                        End
                      </button>

                      <button type="button" className="ghost-btn" onClick={restartAll}>
                        Restart
                      </button>
                    </>
                  )}
                </div>
              </div>

              {selectedMode === "therapy" && (
                <div className="therapy-side-panel">
                  <div className="side-panel-card">
                    <span className="side-label">Session Progress</span>
                    <div className="progress-ring-box">
                      <strong>{completionPercent}%</strong>
                      <small>Completed</small>
                    </div>

                    <div className="progress-bar-wrap">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${completionPercent}%` }} />
                      </div>
                    </div>

                    <p>
                      {progress.attemptedItems} of {items.length} items attempted
                    </p>
                  </div>

                  <div className="side-panel-card highlight">
                    <span className="side-label">Overall Progress</span>
                    <strong className="overall-score">{progress.overallScore}%</strong>
                    <p>Overall therapy progress based on completed practice items.</p>
                  </div>

                  <div className="side-panel-card">
                    <span className="side-label">Current Status</span>
                    <div className="status-grid">
                      <div>
                        <small>Stage</small>
                        <strong>{stage}</strong>
                      </div>
                      <div>
                        <small>Attempt</small>
                        <strong>{attempt}/{MAX_ATTEMPTS}</strong>
                      </div>
                      <div>
                        <small>Status</small>
                        <strong>
                          {sessionCompleted
                            ? "Completed"
                            : sessionPaused
                            ? "Paused"
                            : sessionStarted
                            ? "Active"
                            : "Ready"}
                        </strong>
                      </div>
                      <div>
                        <small>Mode</small>
                        <strong>{selectedMode}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevicePage;