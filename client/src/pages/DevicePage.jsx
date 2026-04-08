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
const SUCCESS_THRESHOLD = 70;
const SESSION_END_TO_COMPANION_DELAY_MS = 10000;

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
  const [isPromptPlaying, setIsPromptPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [progress, setProgress] = useState({
    attemptedItems: 0,
    completedItems: 0,
    overallScore: 0,
    initialAverage: 0,
    middleAverage: 0,
    endAverage: 0,
    totalInitial: 0,
    totalMiddle: 0,
    totalEnd: 0,
  });

  const timerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const currentAudioRef = useRef(null);
  const isMountedRef = useRef(true);
  const speechRef = useRef(null);
  const companionTimeoutRef = useRef(null);

  const sessionPausedRef = useRef(false);
  const sessionCompletedRef = useRef(false);
  const sessionStartedRef = useRef(false);
  const sessionIdRef = useRef("");

  const currentItem = useMemo(() => items[currentIndex] || null, [items, currentIndex]);

  const completionPercent =
    items.length > 0 ? Math.round((progress.completedItems / items.length) * 100) : 0;

  const friendlyFeedback = useMemo(() => {
    if (selectedMode === "companion") {
      if (pageError) return pageError;
      return companionActive ? "Companion mode is active." : "Companion mode is ready.";
    }

    if (!latestResult) {
      if (sessionPaused) return "Therapy session paused.";
      if (sessionCompleted) return "Therapy session completed.";
      if (isPromptPlaying) return "Listen carefully.";
      if (isListening) return "Please speak now.";
      if (isUploading) return "Checking response.";
      return "Therapy session is running.";
    }

    return latestResult.feedback || "Good try.";
  }, [
    selectedMode,
    companionActive,
    pageError,
    latestResult,
    sessionPaused,
    sessionCompleted,
    isPromptPlaying,
    isListening,
    isUploading,
  ]);

  const speakText = (text) => {
    try {
      if (!text || typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      speechRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error("Speech synthesis error:", error);
    }
  };

  const stopSpeech = () => {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (error) {
      console.error("Stop speech error:", error);
    }
  };

  const clearCompanionTimeout = () => {
    if (companionTimeoutRef.current) {
      clearTimeout(companionTimeoutRef.current);
      companionTimeoutRef.current = null;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

  const stopCurrentAudio = () => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      }
    } catch (error) {
      console.error("Audio stop error:", error);
    }
  };

  const cleanupRecorder = () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch (error) {
      console.error("Recorder cleanup error:", error);
    }

    try {
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
    } catch (error) {
      console.error("Stream cleanup error:", error);
    }

    mediaRecorderRef.current = null;
    setIsListening(false);
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
      const aCreated = a?.createdAt?.seconds || 0;
      const bCreated = b?.createdAt?.seconds || 0;
      return aCreated - bCreated;
    });
  };

  const getItemPromptAudioUrl = (item) => {
    if (!item) return "";
    return item.audioUrl || "";
  };

  const getItemMediaUrl = (item) => {
    if (!item) return "";
    if (item.visualType === "video") return item.videoUrl || "";
    if (item.visualType === "gif") return item.gifUrl || "";
    return item.imageUrl || "";
  };

  const getFallbackMp3Track = (itemData, itemIndex) => {
    const parsed = Number(itemData?.mp3Track);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
    return itemIndex + 1;
  };

  const generateRandomPhonemeScores = () => {
    const initial = Math.floor(Math.random() * 41) + 60;
    const middle = Math.floor(Math.random() * 41) + 55;
    const end = Math.floor(Math.random() * 41) + 60;
    const total = Math.round((initial + middle + end) / 3);

    return {
      initial,
      middle,
      end,
      total,
    };
  };

  const buildSimulationFeedback = (total, currentAttempt) => {
    if (total >= SUCCESS_THRESHOLD) return "Excellent, well done!";
    if (currentAttempt < MAX_ATTEMPTS) return "Try again.";
    return "Good try. Moving to the next item.";
  };

  const playAudioUrl = (audioUrl) => {
    return new Promise((resolve, reject) => {
      if (!audioUrl) {
        resolve();
        return;
      }

      try {
        stopCurrentAudio();

        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        setIsPromptPlaying(true);

        audio.onended = () => {
          setIsPromptPlaying(false);
          currentAudioRef.current = null;
          resolve();
        };

        audio.onerror = (error) => {
          setIsPromptPlaying(false);
          currentAudioRef.current = null;
          reject(error);
        };

        audio.play().catch((error) => {
          setIsPromptPlaying(false);
          currentAudioRef.current = null;
          reject(error);
        });
      } catch (error) {
        setIsPromptPlaying(false);
        reject(error);
      }
    });
  };

  const safeReadJson = async (response, fallbackMessage = "Request failed") => {
    const text = await response.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        text?.startsWith("<")
          ? "Server returned HTML instead of JSON. Check route URL."
          : fallbackMessage
      );
    }

    if (!response.ok) {
      throw new Error(data?.error || data?.message || fallbackMessage);
    }

    return data;
  };

  const postJson = async (url, body, fallbackMessage = "Request failed") => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return safeReadJson(response, fallbackMessage);
  };

  const getJson = async (url, fallbackMessage = "Request failed") => {
    const response = await fetch(url);
    return safeReadJson(response, fallbackMessage);
  };

  const canContinueTherapy = () => {
    return (
      isMountedRef.current &&
      sessionStartedRef.current &&
      !sessionPausedRef.current &&
      !sessionCompletedRef.current
    );
  };

  const queueNextItemRun = (itemData, nextAttempt, itemIndex, activeSessionId, delay = 900) => {
    setTimeout(async () => {
      if (!canContinueTherapy()) return;

      const safeSessionId =
        activeSessionId || sessionIdRef.current || (await createSession());

      if (!itemData) return;

      runCurrentItem(itemData, nextAttempt, itemIndex, safeSessionId);
    }, delay);
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
        state?.deviceCode ||
        state?.deviceId ||
        childData.deviceCode ||
        childData.deviceId ||
        "";

      if (deviceDocId) {
        const deviceSnap = await getDoc(doc(db, "devices", deviceDocId));
        if (deviceSnap.exists()) {
          setDeviceInfo({ id: deviceSnap.id, ...deviceSnap.data() });
        } else {
          setDeviceInfo({
            id: deviceDocId,
            deviceCode: childData.deviceCode || state?.deviceCode || "",
            deviceId: childData.deviceId || state?.deviceId || "",
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
    isMountedRef.current = true;
    loadPageData();

    return () => {
      isMountedRef.current = false;
      stopTimer();
      stopCurrentAudio();
      cleanupRecorder();
      stopSpeech();
      clearCompanionTimeout();
    };
  }, []);

  useEffect(() => {
    sessionPausedRef.current = sessionPaused;
  }, [sessionPaused]);

  useEffect(() => {
    sessionCompletedRef.current = sessionCompleted;
  }, [sessionCompleted]);

  useEffect(() => {
    sessionStartedRef.current = sessionStarted;
  }, [sessionStarted]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionStarted || sessionCompleted || !therapyPlanData?.sessionDurationMinutes) return;
    if (selectedMode !== "therapy") return;

    const maxSeconds = Number(therapyPlanData.sessionDurationMinutes) * 60;

    if (maxSeconds > 0 && elapsedSeconds >= maxSeconds) {
      const autoFinishFromTimeLimit = async () => {
        stopTimer();
        stopCurrentAudio();
        cleanupRecorder();
        stopSpeech();

        setIsBusy(false);
        setIsListening(false);
        setIsUploading(false);
        setIsPromptPlaying(false);
        setStage("Session duration limit reached");

        const finalProgress = { ...progress };

        if (sessionId) {
          await finishTherapySession(sessionId, finalProgress);
        } else {
          setSessionCompleted(true);
          setSessionStarted(false);
          setSessionPaused(false);
          setSelectedMode("companion");
          setCompanionActive(false);
          setLatestResult(null);

          clearCompanionTimeout();
          companionTimeoutRef.current = setTimeout(async () => {
            await stopCompanionMode();
            await activateCompanionMode();
          }, SESSION_END_TO_COMPANION_DELAY_MS);
        }
      };

      autoFinishFromTimeLimit();
    }
  }, [
    elapsedSeconds,
    sessionStarted,
    sessionCompleted,
    therapyPlanData,
    selectedMode,
    sessionId,
    progress,
  ]);

  const activateCompanionMode = async () => {
    try {
      setSelectedMode("companion");
      setCompanionActive(true);
      setLatestResult(null);
      setStage("Companion mode active");

      await postJson(
        `${SERVER}/companion-start`,
        {
          childId: child?.id || state?.childId || "",
          childName: child?.childName || state?.childName || "",
          deviceId: deviceInfo?.deviceId || state?.deviceId || "",
          deviceCode: deviceInfo?.deviceCode || state?.deviceCode || "",
          startTrack: 23,
        },
        "Failed to activate companion mode."
      );
    } catch (error) {
      console.error("Companion start error:", error);
      setPageError(error.message || "Failed to activate companion mode.");
    }
  };

  const stopCompanionMode = async () => {
    try {
      await postJson(`${SERVER}/companion-stop`, {}, "Failed to stop companion mode.");
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

  const createSession = async () => {
    if (!child) return "";
    if (sessionIdRef.current) return sessionIdRef.current;

    const finalDeviceCode =
      state?.deviceCode ||
      child.deviceCode ||
      deviceInfo?.deviceCode ||
      state?.deviceId ||
      child.deviceId ||
      "";

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
      deviceCode: finalDeviceCode,
      deviceName:
        child.deviceName ||
        state?.deviceName ||
        deviceInfo?.deviceName ||
        "Assigned Device",
      levelId: levelInfo?.id || state?.assignedLevelId || child.assignedLevelId || "",
      levelTitle: levelInfo?.title || child.assignedLevelName || "",
      therapyPlan: therapyPlanData || null,
      sessionMode: "therapy",
      sessionSource: "laptop",
      sessionDate: getTodayKey(),
      startedAt: serverTimestamp(),
      endedAt: null,
      status: "active",
      totalItems: items.length,
      attemptedItems: 0,
      completedItems: 0,
      overallScore: 0,
      initialAverage: 0,
      middleAverage: 0,
      endAverage: 0,
    });

    setSessionId(sessionRef.id);
    sessionIdRef.current = sessionRef.id;
    return sessionRef.id;
  };

  const saveAttempt = async (resultData, itemData, currentAttempt, activeSessionId, itemIndex) => {
    if (!activeSessionId || !itemData) return;

    await addDoc(collection(db, "sessions", activeSessionId, "attempts"), {
      itemId: itemData.id,
      itemText: itemData.text || "",
      itemType: itemData.type || "word",
      visualType: itemData.visualType || "image",
      imageUrl: itemData.imageUrl || "",
      gifUrl: itemData.gifUrl || "",
      videoUrl: itemData.videoUrl || "",
      audioUrl: itemData.audioUrl || "",
      mp3Track: getFallbackMp3Track(itemData, itemIndex),
      attemptNumber: currentAttempt,
      recognizedText: resultData.recognizedText || "",
      targetText: resultData.targetText || itemData.text || "",
      score: Number(resultData.score || 0),
      phonemePositionScores: {
        initial: Number(resultData?.phonemePositionScores?.initial || 0),
        middle: Number(resultData?.phonemePositionScores?.middle || 0),
        end: Number(resultData?.phonemePositionScores?.end || 0),
      },
      createdAt: serverTimestamp(),
      time: resultData.time || new Date().toISOString(),
      feedback: resultData.feedback || "",
      movedToNext: !!resultData.moveNext,
      shouldRetry: !!resultData.shouldRetry,
      analysisMode: "simulated_initial_middle_end",
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
      latestInitialAverage: finalProgress.initialAverage,
      latestMiddleAverage: finalProgress.middleAverage,
      latestEndAverage: finalProgress.endAverage,
      latestSessionCompletedAt: serverTimestamp(),
    });
  };

  const updateSessionSummary = async (activeSessionId, updatedProgress, completed = false) => {
    if (!activeSessionId) return;

    await updateDoc(doc(db, "sessions", activeSessionId), {
      attemptedItems: updatedProgress.attemptedItems,
      completedItems: updatedProgress.completedItems,
      overallScore: updatedProgress.overallScore,
      initialAverage: updatedProgress.initialAverage,
      middleAverage: updatedProgress.middleAverage,
      endAverage: updatedProgress.endAverage,
      status: completed ? "completed" : "active",
      endedAt: completed ? serverTimestamp() : null,
      scoringMode: "simulated_initial_middle_end",
    });
  };

  const startLaptopRecording = async () => {
    return new Promise(async (resolve, reject) => {
      try {
        cleanupRecorder();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingStreamRef.current = stream;

        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        const chunks = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          console.error("Recorder error:", event);
          cleanupRecorder();
          reject(new Error("Microphone recording failed."));
        };

        recorder.onstop = async () => {
          try {
            setIsListening(false);
            const audioBlob = new Blob(chunks, { type: "audio/webm" });
            cleanupRecorder();
            resolve(audioBlob);
          } catch (error) {
            cleanupRecorder();
            reject(error);
          }
        };

        setIsListening(true);
        recorder.start();

        setTimeout(() => {
          try {
            if (recorder.state !== "inactive") {
              recorder.stop();
            }
          } catch (error) {
            cleanupRecorder();
            reject(error);
          }
        }, 3500);
      } catch (error) {
        cleanupRecorder();
        reject(error);
      }
    });
  };

  const triggerPracticeTask = async (itemData, currentAttempt, activeSessionId, itemIndex) => {
    if (!itemData?.id) {
      throw new Error("Item id is missing.");
    }

    if (!itemData?.text?.trim()) {
      throw new Error("Item text is missing.");
    }

    const data = await postJson(
      `${SERVER}/practice-trigger`,
      {
        category: itemData?.type || "word",
        itemId: itemData?.id || "",
        type: itemData?.type || "word",
        targetText: itemData?.text || "",
        displayText: itemData?.text || "",
        attempt: currentAttempt,
        sessionId: activeSessionId || "",
        mp3Track: getFallbackMp3Track(itemData, itemIndex),
        promptDelayMs: Number(itemData?.promptDelayMs || 700),
      },
      "Failed to create practice task."
    );

    return data?.task || null;
  };

  const sendPracticeAudioToBackend = async (audioBlob) => {
    const arrayBuffer = await audioBlob.arrayBuffer();

    const response = await fetch(`${SERVER}/practice-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: arrayBuffer,
    });

    return safeReadJson(response, "Failed to process audio.");
  };

  const getPracticeResult = async (taskKey) => {
    return getJson(
      `${SERVER}/practice-result?taskKey=${encodeURIComponent(taskKey || "")}`,
      "Failed to get practice result."
    );
  };

  const notifyPracticeStage = async (stageName, taskKey) => {
    try {
      await postJson(`${SERVER}/practice-stage`, { stage: stageName, taskKey }, "Stage update failed.");
    } catch (error) {
      console.error("Stage notify error:", error);
    }
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

    await saveAttempt(resultData, itemData, currentAttempt, activeSessionId, itemIndex);

    if (resultData.feedback) {
      speakText(resultData.feedback);
    }

    let updatedProgress = null;

    setProgress((prev) => {
      const next = { ...prev };

      if (resultData.moveNext) {
        next.attemptedItems += 1;
        next.completedItems += 1;
        next.totalInitial += Number(resultData?.phonemePositionScores?.initial || 0);
        next.totalMiddle += Number(resultData?.phonemePositionScores?.middle || 0);
        next.totalEnd += Number(resultData?.phonemePositionScores?.end || 0);
      }

      next.initialAverage =
        next.completedItems > 0 ? Math.round(next.totalInitial / next.completedItems) : 0;
      next.middleAverage =
        next.completedItems > 0 ? Math.round(next.totalMiddle / next.completedItems) : 0;
      next.endAverage =
        next.completedItems > 0 ? Math.round(next.totalEnd / next.completedItems) : 0;

      next.overallScore = Math.round(
        (next.initialAverage + next.middleAverage + next.endAverage) / 3
      );

      updatedProgress = next;
      return next;
    });

    if (updatedProgress) {
      await updateSessionSummary(activeSessionId, updatedProgress, false);
    }

    if (resultData.shouldRetry && currentAttempt < MAX_ATTEMPTS) {
      const nextAttempt = currentAttempt + 1;
      setAttempt(nextAttempt);
      setIsBusy(false);
      setStage(`Retrying attempt ${nextAttempt}...`);

      queueNextItemRun(itemData, nextAttempt, itemIndex, activeSessionId, 1400);
      return;
    }

    setAttempt(1);

    const nextIndex = itemIndex + 1;
    const reachedHundred =
      updatedProgress &&
      items.length > 0 &&
      updatedProgress.completedItems >= items.length;

    if (reachedHundred) {
      await finishTherapySession(activeSessionId, updatedProgress);
      return;
    }

    if (nextIndex < items.length) {
      const nextItem = items[nextIndex];

      setStage("Moving to next item...");
      setLatestResult(null);
      setPageError("");
      setCurrentIndex(nextIndex);
      setIsBusy(false);

      queueNextItemRun(nextItem, 1, nextIndex, activeSessionId, 1200);
      return;
    }

    if (updatedProgress) {
      await finishTherapySession(activeSessionId, updatedProgress);
    }
  };

  const uploadAttemptAudio = async (
    audioBlob,
    itemData,
    currentAttempt,
    activeSessionId,
    itemIndex,
    taskKey
  ) => {
    try {
      setIsUploading(true);
      setStage("Checking response...");

      await notifyPracticeStage("processing-whisper", taskKey);

      const audioResult = await sendPracticeAudioToBackend(audioBlob);

      let finalResult = audioResult;

      if (!audioResult?.ready && taskKey) {
        finalResult = await getPracticeResult(taskKey);
      }

      setIsUploading(false);

      const simulatedScores = generateRandomPhonemeScores();
      const passed = simulatedScores.total >= SUCCESS_THRESHOLD;

      const normalizedResult = {
        success: !!finalResult?.ready || !!finalResult?.success,
        recognizedText: finalResult?.recognizedText || "",
        targetText: finalResult?.targetText || itemData?.text || "",
        score: simulatedScores.total,
        phonemePositionScores: {
          initial: simulatedScores.initial,
          middle: simulatedScores.middle,
          end: simulatedScores.end,
        },
        feedback: buildSimulationFeedback(simulatedScores.total, currentAttempt),
        shouldRetry: !passed && currentAttempt < MAX_ATTEMPTS,
        moveNext: passed || currentAttempt >= MAX_ATTEMPTS,
        time: finalResult?.time || new Date().toISOString(),
        scoringMode: "simulated_initial_middle_end",
      };

      await handlePracticeResult(
        normalizedResult,
        itemData,
        currentAttempt,
        activeSessionId,
        itemIndex
      );
    } catch (error) {
      console.error("Upload failed:", error);
      setIsUploading(false);
      setIsBusy(false);
      setStage("Upload failed");
      setPageError(error.message || "Failed to upload and process audio.");
    }
  };

  const runCurrentItem = async (
    itemData,
    currentAttempt,
    itemIndex,
    activeSessionIdFromCaller = ""
  ) => {
    try {
      if (!canContinueTherapy()) return;

      if (!itemData?.text?.trim()) {
        throw new Error("Current item text is missing.");
      }

      const activeSessionId =
        activeSessionIdFromCaller || sessionIdRef.current || (await createSession());

      if (!itemData?.audioUrl) {
        const simulatedSkipResult = {
          recognizedText: "",
          targetText: itemData?.text || "",
          score: 0,
          phonemePositionScores: { initial: 0, middle: 0, end: 0 },
          feedback: "Audio missing. Moving to the next item.",
          shouldRetry: false,
          moveNext: true,
          time: new Date().toISOString(),
        };

        await handlePracticeResult(
          simulatedSkipResult,
          itemData,
          currentAttempt,
          activeSessionId,
          itemIndex
        );
        return;
      }

      setIsBusy(true);
      setPageError("");
      setLatestResult(null);
      setStage("Preparing item...");

      const createdTask = await triggerPracticeTask(
        itemData,
        currentAttempt,
        activeSessionId,
        itemIndex
      );
      const taskKey = createdTask?.taskKey || "";

      const promptAudioUrl = getItemPromptAudioUrl(itemData);

      setStage("Playing prompt...");
      await notifyPracticeStage("playing-prompt", taskKey);
      await playAudioUrl(promptAudioUrl);

      if (!canContinueTherapy()) {
        setIsBusy(false);
        return;
      }

      setStage("Get ready...");
      await new Promise((resolve) =>
        setTimeout(resolve, Number(itemData?.promptDelayMs || 700))
      );

      if (!canContinueTherapy()) {
        setIsBusy(false);
        return;
      }

      setStage("Listening...");
      await notifyPracticeStage("listening", taskKey);
      const audioBlob = await startLaptopRecording();

      if (!canContinueTherapy()) {
        setIsBusy(false);
        return;
      }

      await uploadAttemptAudio(
        audioBlob,
        itemData,
        currentAttempt,
        activeSessionId,
        itemIndex,
        taskKey
      );
    } catch (error) {
      console.error("Run item error:", error);
      console.error("Failing item:", itemData);

      setIsBusy(false);
      setIsListening(false);
      setIsUploading(false);
      setIsPromptPlaying(false);
      setStage("Item failed");
      setPageError(error.message || "Failed to run current item.");
    }
  };

  const finishTherapySession = async (activeSessionId, finalProgress) => {
    setSessionCompleted(true);
    setSessionStarted(false);
    setSessionPaused(false);
    sessionCompletedRef.current = true;
    sessionStartedRef.current = false;
    sessionPausedRef.current = false;

    setIsBusy(false);
    setIsListening(false);
    setIsUploading(false);
    setIsPromptPlaying(false);
    setStage("Session completed - switching to companion mode soon");

    stopTimer();
    stopCurrentAudio();
    cleanupRecorder();
    stopSpeech();

    speakText("Excellent. Session completed. Moving to companion mode.");

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
        sessionSource: "laptop",
        totalItems: items.length,
        attemptedItems: finalProgress.attemptedItems,
        completedItems: finalProgress.completedItems,
        overallScore: finalProgress.overallScore,
        initialAverage: finalProgress.initialAverage,
        middleAverage: finalProgress.middleAverage,
        endAverage: finalProgress.endAverage,
        createdAt: serverTimestamp(),
        elapsedSeconds,
        scoringMode: "simulated_initial_middle_end",
      });
    } catch (error) {
      console.error("Summary save error:", error);
    }

    clearCompanionTimeout();
    companionTimeoutRef.current = setTimeout(async () => {
      try {
        await stopCompanionMode();
      } catch (error) {
        console.error("Stop companion before restart error:", error);
      }

      setSelectedMode("companion");
      setCompanionActive(false);
      setLatestResult(null);
      setCurrentIndex(0);
      setAttempt(1);
      setStage("Companion mode active");

      await activateCompanionMode();
    }, SESSION_END_TO_COMPANION_DELAY_MS);
  };

  const beginTherapySession = async () => {
    setPageError("");
    setSessionBlocked(false);
    clearCompanionTimeout();
    stopSpeech();

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
    sessionStartedRef.current = true;
    sessionCompletedRef.current = false;
    sessionPausedRef.current = false;

    setCurrentIndex(0);
    setAttempt(1);
    setElapsedSeconds(0);
    setSessionId("");
    sessionIdRef.current = "";

    setProgress({
      attemptedItems: 0,
      completedItems: 0,
      overallScore: 0,
      initialAverage: 0,
      middleAverage: 0,
      endAverage: 0,
      totalInitial: 0,
      totalMiddle: 0,
      totalEnd: 0,
    });
    setLatestResult(null);
    setStage("Therapy session started");
    startTimer();

    const firstItem = items[0];
    if (firstItem) {
      queueNextItemRun(firstItem, 1, 0, "", 500);
    }
  };

  const pauseSession = async () => {
    if (!sessionStarted || sessionCompleted || sessionPaused) return;

    stopTimer();
    stopCurrentAudio();
    cleanupRecorder();
    stopSpeech();

    setSessionPaused(true);
    sessionPausedRef.current = true;

    setIsBusy(false);
    setIsListening(false);
    setIsUploading(false);
    setIsPromptPlaying(false);
    setStage("Session paused");
  };

  const resumeSession = async () => {
    if (!sessionStarted || sessionCompleted || !sessionPaused) return;

    setSessionPaused(false);
    sessionPausedRef.current = false;

    startTimer();
    setStage("Session resumed");

    if (currentItem) {
      setTimeout(async () => {
        if (!canContinueTherapy()) return;
        const activeSessionId = await createSession();
        runCurrentItem(currentItem, attempt || 1, currentIndex, activeSessionId);
      }, 700);
    }
  };

  const endSession = async () => {
    stopTimer();
    stopCurrentAudio();
    cleanupRecorder();
    stopSpeech();
    clearCompanionTimeout();

    try {
      await postJson(`${SERVER}/practice-reset`, {}, "Failed to reset practice state.");
    } catch (error) {
      console.error("Practice reset error:", error);
    }

    if (!sessionIdRef.current) {
      setSessionStarted(false);
      setSessionCompleted(true);
      setSessionPaused(false);
      sessionStartedRef.current = false;
      sessionCompletedRef.current = true;
      sessionPausedRef.current = false;

      setIsBusy(false);
      setIsListening(false);
      setIsUploading(false);
      setIsPromptPlaying(false);
      setStage("Session ended");
      setSelectedMode("companion");
      setCompanionActive(false);
      return;
    }

    const finalProgress = { ...progress };
    await finishTherapySession(sessionIdRef.current, finalProgress);
  };

  const restartAll = async () => {
    stopTimer();
    stopCurrentAudio();
    cleanupRecorder();
    stopSpeech();
    clearCompanionTimeout();

    try {
      await postJson(`${SERVER}/practice-reset`, {}, "Failed to reset practice state.");
    } catch (error) {
      console.error("Practice reset error:", error);
    }

    await stopCompanionMode();

    setSessionId("");
    sessionIdRef.current = "";

    setSessionStarted(false);
    setSessionCompleted(false);
    setSessionBlocked(false);
    setSessionPaused(false);
    sessionStartedRef.current = false;
    sessionCompletedRef.current = false;
    sessionPausedRef.current = false;

    setCurrentIndex(0);
    setAttempt(1);
    setStage("Ready");
    setLatestResult(null);
    setIsBusy(false);
    setIsListening(false);
    setIsUploading(false);
    setIsPromptPlaying(false);
    setElapsedSeconds(0);
    setProgress({
      attemptedItems: 0,
      completedItems: 0,
      overallScore: 0,
      initialAverage: 0,
      middleAverage: 0,
      endAverage: 0,
      totalInitial: 0,
      totalMiddle: 0,
      totalEnd: 0,
    });
    setPageError("");
    setSelectedMode("companion");
    setCompanionActive(false);

    const therapyAccess = await evaluateTherapyAvailability(child, therapyPlanData);
    setTherapyModeAllowed(therapyAccess.allowed);
    setTherapyRestrictionMessage(therapyAccess.reason || "");
  };

  const renderMedia = () => {
    if (!currentItem) {
      return <div className="image-placeholder">No item found</div>;
    }

    const mediaUrl = getItemMediaUrl(currentItem);

    if (!mediaUrl) {
      return <div className="image-placeholder">No media available</div>;
    }

    if (currentItem.visualType === "video") {
      return (
        <video
          src={mediaUrl}
          className="item-image"
          autoPlay
          muted
          loop
          playsInline
          controls
        />
      );
    }

    return (
      <img
        src={mediaUrl}
        alt={currentItem.text || "practice item"}
        className="item-image"
      />
    );
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
                : "Ready"}
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
                    ? "A guided laptop-based stimulation therapy session is running."
                    : "The device is in companion mode."}
                </p>
              </div>
            </div>

            <div className={`practice-zone ${selectedMode === "companion" ? "companion-only" : ""}`}>
              {selectedMode === "therapy" ? (
                <div className="therapy-main-screen">
                  <div className="practice-status-row">
                    <div className="status-chip">
                      Item {items.length > 0 ? currentIndex + 1 : 0} / {items.length}
                    </div>
                    <div className="status-chip secondary">
                      {currentItem?.type || "-"}
                    </div>
                  </div>

                  <div className="therapy-content-grid">
                    <div className="therapy-visual-panel">
                      <div className="image-frame large-frame">{renderMedia()}</div>

                      <div className="word-area compact-word-area">
                        <h2>{currentItem?.text || "No item found"}</h2>
                        <p>{friendlyFeedback}</p>
                      </div>
                    </div>

                    <div className="therapy-info-panel">
                      <div className="side-panel-card compact-card">
                        <span className="side-label">Session Overview</span>

                        <div className="session-mini-grid">
                          <div className="mini-stat">
                            <small>Progress</small>
                            <strong>{progress.completedItems}/{items.length}</strong>
                          </div>
                          <div className="mini-stat">
                            <small>Attempt</small>
                            <strong>{attempt}/{MAX_ATTEMPTS}</strong>
                          </div>
                          <div className="mini-stat">
                            <small>Timer</small>
                            <strong>{formatTime(elapsedSeconds)}</strong>
                          </div>
                          <div className="mini-stat">
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
                        </div>
                      </div>

                      <div className="side-panel-card compact-card highlight">
                        <span className="side-label">Overall Score</span>
                        <strong className="overall-score compact-score">
                          {progress.overallScore}%
                        </strong>
                        <p>Stored for therapist reporting.</p>
                      </div>

                      <div className="side-panel-card compact-card">
                        <span className="side-label">Live Status</span>
                        <div className="live-status-inline">
                          <strong>
                            {isPromptPlaying
                              ? "Playing prompt..."
                              : isListening
                              ? "Listening..."
                              : isUploading
                              ? "Checking response..."
                              : stage}
                          </strong>
                        </div>
                      </div>

                      {latestResult && (
                        <div className="side-panel-card compact-card">
                          <span className="side-label">Recognized</span>
                          <div className="recognized-box">
                            <strong>{latestResult.recognizedText || "No speech detected"}</strong>
                          </div>
                        </div>
                      )}

                      <div className="side-panel-card compact-card">
                        <span className="side-label">Position Scores</span>
                        <div className="status-grid score-grid-3">
                          <div>
                            <small>Initial</small>
                            <strong>{progress.initialAverage}%</strong>
                          </div>
                          <div>
                            <small>Middle</small>
                            <strong>{progress.middleAverage}%</strong>
                          </div>
                          <div>
                            <small>End</small>
                            <strong>{progress.endAverage}%</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="control-row therapy-controls">
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
                  </div>
                </div>
              ) : (
                <div className="practice-hero companion-hero">
                  <div className="practice-status-row">
                    <div className="status-chip">Friendly Interaction</div>
                    <div className="status-chip secondary">keyword listening</div>
                  </div>

                  <div className="companion-center-card">
                    <div className="companion-emoji">🧸</div>
                    <h2>Companion Mode</h2>
                    <p>{friendlyFeedback}</p>

                    <div className="live-status-box">
                      <span>Current Status</span>
                      <strong>{stage}</strong>
                    </div>
                  </div>

                  <div className="control-row">
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