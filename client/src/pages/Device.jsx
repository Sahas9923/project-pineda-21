import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/Device.css";

const BACKEND_URL = "http://localhost:5000";
const PROMPT_DELAY_MS = 700;
const NEXT_ITEM_DELAY_MS = 1800;
const ESP_RESULT_POLL_MS = 1200;
const ESP_RESULT_TIMEOUT_MS = 30000;

const TEST_ITEMS = [
  {
    id: "sound-1",
    type: "sound",
    title: "A",
    targetText: "A",
    sound: "A",
    front: "A",
    middle: "A",
    end: "A",
    instruction: "Say the sound A",
  },
  {
    id: "sound-2",
    type: "sound",
    title: "B",
    targetText: "B",
    sound: "B",
    front: "B",
    middle: "B",
    end: "B",
    instruction: "Say the sound B",
  },
  {
    id: "word-1",
    type: "word",
    title: "Apple",
    targetText: "Apple",
    sound: "Apple",
    front: "Apple",
    middle: "Apple",
    end: "Apple",
    instruction: "Say the word Apple",
  },
  {
    id: "word-2",
    type: "word",
    title: "Ball",
    targetText: "Ball",
    sound: "Ball",
    front: "Ball",
    middle: "Ball",
    end: "Ball",
    instruction: "Say the word Ball",
  },
  {
    id: "sentence-1",
    type: "sentence",
    title: "I am happy",
    targetText: "I am happy",
    sound: "I am happy",
    front: "I am happy",
    middle: "I am happy",
    end: "I am happy",
    instruction: "Say the sentence I am happy",
  },
];

function mapSpokenFeedback(result) {
  const score = Number(result?.score || 0);
  const status = result?.status || "";

  if (status === "exact" || status === "correct") return "Good job!";
  if (status === "close") return "Very good!";
  if (status === "partial") return "Almost correct, try again.";
  if (score <= 0) return "Let's say it once more.";
  return "Let's try again.";
}

const DevicePage = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionNumber, setSessionNumber] = useState(1);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);

  const [checkingAudio, setCheckingAudio] = useState(false);
  const [recording, setRecording] = useState(false);
  const [listeningState, setListeningState] = useState("idle");
  const [statusText, setStatusText] = useState("Ready");

  const [recognizedText, setRecognizedText] = useState("");
  const [matchedTarget, setMatchedTarget] = useState("");
  const [matchStatus, setMatchStatus] = useState("-");
  const [score, setScore] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [spokenFeedback, setSpokenFeedback] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [overallProgress, setOverallProgress] = useState(0);
  const [autoRunEnabled, setAutoRunEnabled] = useState(true);
  const [currentTaskId, setCurrentTaskId] = useState("");

  const flowTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const speakingRef = useRef(false);
  const pollAbortRef = useRef(null);

  const resolvedDeviceId = useMemo(() => deviceId || "test-device-1", [deviceId]);
  const sessionId = useMemo(() => `TEST-SESSION-${sessionNumber}`, [sessionNumber]);
  const currentItem = TEST_ITEMS[currentItemIndex] || null;
  const totalItems = TEST_ITEMS.length;

  const clearScheduledTimeout = () => {
    if (flowTimeoutRef.current) {
      clearTimeout(flowTimeoutRef.current);
      flowTimeoutRef.current = null;
    }
  };

  const clearPolling = () => {
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
  };

  const stopSpeech = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
    } catch (error) {
      console.error("Speech stop error:", error);
    }
  }, []);

  const cleanupProcess = useCallback(() => {
    clearScheduledTimeout();
    clearPolling();
    setRecording(false);
    setCheckingAudio(false);
    setCurrentTaskId("");
  }, []);

  const resetResults = useCallback(() => {
    setRecognizedText("");
    setMatchedTarget("");
    setMatchStatus("-");
    setScore(0);
    setFeedbackText("");
    setSpokenFeedback("");
  }, []);

  const calculateOverallProgress = useCallback(
    (index, perItemScore = 0) => {
      const completedItems = index;
      const completedScore = completedItems * 100;
      const runningScore = completedScore + perItemScore;
      return Math.round(runningScore / totalItems);
    },
    [totalItems]
  );

  const speakText = useCallback(
    (text) => {
      return new Promise((resolve) => {
        if (!text) {
          resolve();
          return;
        }

        try {
          stopSpeech();

          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.9;
          utterance.pitch = 1;
          utterance.volume = 1;

          const voices = window.speechSynthesis.getVoices();
          const preferredVoice =
            voices.find((v) => /female|zira|samantha|google uk english female/i.test(v.name)) ||
            voices.find((v) => /en/i.test(v.lang)) ||
            null;

          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }

          speakingRef.current = true;

          utterance.onend = () => {
            speakingRef.current = false;
            resolve();
          };

          utterance.onerror = () => {
            speakingRef.current = false;
            resolve();
          };

          window.speechSynthesis.speak(utterance);
        } catch (error) {
          console.error("Speech synthesis error:", error);
          resolve();
        }
      });
    },
    [stopSpeech]
  );

  const goToNextItem = useCallback(() => {
    clearScheduledTimeout();

    if (currentItemIndex >= totalItems - 1) {
      setSessionStarted(false);
      setSessionEnded(true);
      setListeningState("ended");
      setStatusText("Session ended");
      setFeedbackText("Session completed.");
      setSpokenFeedback("Session completed.");
      return;
    }

    setListeningState("next-item");
    setStatusText("Moving to next item...");
    setCurrentItemIndex((prev) => prev + 1);
    setAttemptNumber(1);
    resetResults();
  }, [currentItemIndex, resetResults, totalItems]);

  const applyBackendResult = useCallback(
    async (result) => {
      const backendScore = Number(result.score || 0);
      const backendStatus = result.status || "incorrect";
      const target = result.expectedText || currentItem?.targetText || currentItem?.title || "";
      const simpleSpokenFeedback = result.spokenFeedback || mapSpokenFeedback(result);

      setRecognizedText(result.recognizedText || "");
      setMatchedTarget(target);
      setMatchStatus(backendStatus);
      setScore(backendScore);
      setOverallProgress(calculateOverallProgress(currentItemIndex, backendScore));
      setFeedbackText(result.feedback || "");
      setSpokenFeedback(simpleSpokenFeedback);
      setStatusText(`Feedback: ${backendStatus}`);
      setListeningState("feedback");

      await speakText(simpleSpokenFeedback);

      if (!isMountedRef.current) return;

      if (result.shouldRetry) {
        const nextAttempt = Number(result.nextAttemptNumber || attemptNumber + 1);
        setAttemptNumber(nextAttempt);
        setStatusText(`Retrying item (${nextAttempt}/${result.maxAttempts || 3})`);
        setListeningState("waiting");

        if (autoRunEnabled) {
          flowTimeoutRef.current = setTimeout(() => {
            runItemFlow();
          }, Number(result.retryAfterMs || 1500));
        }
      } else if (result.moveToNext) {
        setAttemptNumber(1);
        setListeningState("next-item");
        setStatusText("Next item");

        if (autoRunEnabled) {
          flowTimeoutRef.current = setTimeout(() => {
            goToNextItem();
          }, NEXT_ITEM_DELAY_MS);
        }
      }
    },
    [
      attemptNumber,
      autoRunEnabled,
      calculateOverallProgress,
      currentItem,
      currentItemIndex,
      goToNextItem,
      speakText,
    ]
  );

  const pollEspResult = useCallback(
    async (taskId) => {
      const controller = new AbortController();
      pollAbortRef.current = controller;
      const startedAt = Date.now();

      setCheckingAudio(true);
      setRecording(true);
      setListeningState("listening");
      setStatusText("Waiting for ESP audio...");
      setFeedbackText("ESP microphone is preparing or recording...");

      try {
        while (Date.now() - startedAt < ESP_RESULT_TIMEOUT_MS) {
          const response = await fetch(
            `${BACKEND_URL}/api/device/result?taskId=${encodeURIComponent(taskId)}`,
            {
              method: "GET",
              signal: controller.signal,
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result?.error || "Failed to get ESP result");
          }

          if (result?.ready === false) {
            await new Promise((resolve) => setTimeout(resolve, ESP_RESULT_POLL_MS));
            continue;
          }

          setRecording(false);
          setCheckingAudio(false);

          if (!result.success) {
            throw new Error(result?.details || result?.error || "ESP processing failed");
          }

          await applyBackendResult(result);
          return;
        }

        throw new Error("ESP audio result timeout");
      } catch (error) {
        if (error.name === "AbortError") return;

        console.error(error);
        setRecording(false);
        setCheckingAudio(false);
        setListeningState("feedback");
        setStatusText("ESP check failed");
        setFeedbackText(error.message || "Could not get result from ESP.");
        setSpokenFeedback("There was a problem. Let's try again.");
        await speakText("There was a problem. Let's try again.");
      }
    },
    [applyBackendResult, speakText]
  );

  const triggerEspRecording = useCallback(async () => {
    if (!sessionStarted || sessionEnded || !currentItem) return;
    if (recording || checkingAudio) return;

    setListeningState("processing");
    setStatusText("Creating recording task...");
    setFeedbackText("Sending item details to backend...");

    try {
      const payload = {
        sessionId,
        sessionNumber,
        deviceId: resolvedDeviceId,
        deviceCode: resolvedDeviceId,
        childId: "test-child",
        childName: "Test Child",
        childCode: "TC-001",
        levelId: "test-level-1",
        levelName: "Static Test Level",
        mode: "therapy",
        itemId: currentItem.id,
        itemType: currentItem.type,
        itemTitle: currentItem.title,
        itemSound: currentItem.sound,
        frontWord: currentItem.front,
        middleWord: currentItem.middle,
        endWord: currentItem.end,
        targetText: currentItem.targetText || currentItem.title,
        instruction: currentItem.instruction,
        attemptNumber,
        sessionDateKey: new Date().toISOString().slice(0, 10),
      };

      const response = await fetch(`${BACKEND_URL}/api/device/start-recording`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.details || result?.error || "Could not create ESP recording task");
      }

      setCurrentTaskId(result.taskId || "");
      setStatusText("Task sent. Waiting for ESP...");
      setFeedbackText("ESP will pick up the task and send audio.");

      await pollEspResult(result.taskId);
    } catch (error) {
      console.error(error);
      setListeningState("feedback");
      setStatusText("ESP trigger failed");
      setFeedbackText(error.message || "Could not start ESP recording.");
      setSpokenFeedback("ESP connection problem.");
      await speakText("ESP connection problem.");
    }
  }, [
    attemptNumber,
    checkingAudio,
    currentItem,
    pollEspResult,
    recording,
    resolvedDeviceId,
    sessionEnded,
    sessionId,
    sessionNumber,
    sessionStarted,
    speakText,
  ]);

  const runItemFlow = useCallback(async () => {
    if (!sessionStarted || sessionEnded || !currentItem) return;

    cleanupProcess();
    stopSpeech();

    setStatusText("Speaking prompt...");
    setListeningState("speaking-prompt");
    setFeedbackText(currentItem.instruction);

    const prompt = `${currentItem.instruction}.`;
    await speakText(prompt);

    if (!isMountedRef.current || !sessionStarted || sessionEnded) return;

    setListeningState("waiting");
    setStatusText("Get ready...");

    flowTimeoutRef.current = setTimeout(async () => {
      await triggerEspRecording();
    }, PROMPT_DELAY_MS);
  }, [
    cleanupProcess,
    currentItem,
    sessionEnded,
    sessionStarted,
    speakText,
    stopSpeech,
    triggerEspRecording,
  ]);

  const openSession = useCallback(() => {
    setSessionStarted(true);
    setSessionEnded(false);
    setCurrentItemIndex(0);
    setAttemptNumber(1);
    setOverallProgress(0);
    setCurrentTaskId("");
    resetResults();
    setStatusText("Session active");
    setListeningState("idle");
    setFeedbackText("Session started.");
  }, [resetResults]);

  const restartSession = useCallback(() => {
    cleanupProcess();
    stopSpeech();

    setSessionStarted(true);
    setSessionEnded(false);
    setCurrentItemIndex(0);
    setAttemptNumber(1);
    setOverallProgress(0);
    setCurrentTaskId("");
    resetResults();
    setStatusText("Session restarted");
    setListeningState("idle");
    setFeedbackText("Session restarted from the first item.");
  }, [cleanupProcess, resetResults, stopSpeech]);

  const pauseSession = useCallback(() => {
    cleanupProcess();
    stopSpeech();
    setListeningState("paused");
    setStatusText("Paused");
  }, [cleanupProcess, stopSpeech]);

  const endSession = useCallback(() => {
    cleanupProcess();
    stopSpeech();

    setSessionStarted(false);
    setSessionEnded(true);
    setListeningState("ended");
    setStatusText("Session ended");
    setFeedbackText("Session completed.");
    setSpokenFeedback("Session completed.");
  }, [cleanupProcess, stopSpeech]);

  useEffect(() => {
    if (sessionStarted && !sessionEnded && currentItem && autoRunEnabled) {
      runItemFlow();
    }
  }, [sessionStarted, sessionEnded, currentItemIndex, autoRunEnabled, runItemFlow, currentItem]);

  useEffect(() => {
    isMountedRef.current = true;
    const voiceLoad = () => window.speechSynthesis.getVoices();
    voiceLoad();
    window.speechSynthesis.onvoiceschanged = voiceLoad;

    return () => {
      isMountedRef.current = false;
      cleanupProcess();
      stopSpeech();
    };
  }, [cleanupProcess, stopSpeech]);

  const stateLabelMap = {
    idle: "Ready",
    "speaking-prompt": "Speaking Prompt",
    waiting: "Waiting",
    listening: "Listening from ESP",
    processing: "Processing",
    feedback: "Feedback Given",
    "next-item": "Next Item",
    paused: "Paused",
    ended: "Ended",
  };

  return (
    <div className="device-page">
      <div className="device-topbar">
        <div>
          <h1>Pineda Device Page</h1>
          <p>ESP microphone + backend + Whisper evaluation</p>
        </div>

        <button className="back-btn" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      <div className="device-summary-grid">
        <div className="device-card">
          <h3>Device Info</h3>
          <p><strong>Device ID:</strong> {resolvedDeviceId}</p>
          <p><strong>Device Name:</strong> ESP Speech Device</p>
          <p><strong>Mode:</strong> Therapy Test</p>
          <p><strong>I/O Mode:</strong> ESP mic + laptop speaker</p>
        </div>

        <div className="device-card">
          <h3>Session Info</h3>
          <p><strong>Session ID:</strong> {sessionStarted ? sessionId : "-"}</p>
          <p><strong>Session Number:</strong> {sessionNumber}</p>
          <p><strong>Current Level:</strong> Static Test Level</p>
          <p><strong>Current Item:</strong> {sessionStarted ? `${currentItemIndex + 1} / ${totalItems}` : "-"}</p>
          <p><strong>Attempt:</strong> {attemptNumber}</p>
          <p><strong>Task ID:</strong> {currentTaskId || "-"}</p>
        </div>

        <div className="device-card">
          <h3>Flow State</h3>
          <p><strong>Status:</strong> {statusText}</p>
          <p><strong>Listening State:</strong> {stateLabelMap[listeningState] || listeningState}</p>
          <p><strong>Auto Run:</strong> {autoRunEnabled ? "On" : "Off"}</p>
          <p><strong>Input Mode:</strong> ESP Microphone</p>

          <div className="button-stack">
            {!sessionStarted && !sessionEnded && (
              <button className="primary-btn" onClick={openSession}>
                Open Session
              </button>
            )}

            {sessionStarted && !sessionEnded && (
              <>
                <button className="primary-btn" onClick={restartSession}>
                  Restart Session
                </button>

                <button className="secondary-btn" onClick={pauseSession}>
                  Pause
                </button>

                <button
                  className="secondary-btn"
                  onClick={() => setAutoRunEnabled((prev) => !prev)}
                >
                  Auto Run: {autoRunEnabled ? "On" : "Off"}
                </button>

                <button className="end-btn" onClick={endSession}>
                  End Session
                </button>
              </>
            )}

            {sessionEnded && (
              <button
                className="primary-btn"
                onClick={() => {
                  setSessionNumber((prev) => prev + 1);
                  setSessionEnded(false);
                  setSessionStarted(false);
                  setCurrentItemIndex(0);
                  setAttemptNumber(1);
                  setOverallProgress(0);
                  setCurrentTaskId("");
                  setListeningState("idle");
                  resetResults();
                  setStatusText("Ready");
                }}
              >
                New Session
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="device-main-grid">
        <div className="device-card">
          <div className="section-head">
            <h2>Current Item</h2>
          </div>

          {sessionStarted && currentItem ? (
            <>
              <div className="current-item-box">
                <p><strong>Type:</strong> {currentItem.type}</p>
                <p><strong>Item ID:</strong> {currentItem.id}</p>
                <p><strong>Target Text:</strong></p>
                <div className="target-text-box">{currentItem.targetText}</div>
                <p><strong>Instruction:</strong> {currentItem.instruction}</p>
              </div>

              <div className="mic-controls">
                <button
                  className="primary-btn"
                  onClick={runItemFlow}
                  disabled={recording || checkingAudio}
                >
                  Run Current Item
                </button>

                <button
                  className="secondary-btn"
                  onClick={triggerEspRecording}
                  disabled={recording || checkingAudio}
                >
                  {recording ? "ESP Recording..." : "Start ESP Microphone"}
                </button>

                <button
                  className="next-btn"
                  onClick={goToNextItem}
                  disabled={recording || checkingAudio}
                >
                  Next Item
                </button>
              </div>

              <div className={`device-step-alert ${listeningState}`}>
                <strong>State:</strong> {stateLabelMap[listeningState] || listeningState}
              </div>

              <div className="transcript-box">
                <h4>Evaluation Result</h4>
                <p><strong>Expected Text:</strong> {matchedTarget || currentItem.targetText || "-"}</p>
                <p><strong>Recognized Text:</strong> {recognizedText || "-"}</p>
                <p><strong>Status:</strong> {matchStatus || "-"}</p>
                <p><strong>Score:</strong> {score}%</p>
                <p><strong>Feedback:</strong> {feedbackText || "-"}</p>
                <p><strong>Spoken Feedback:</strong> {spokenFeedback || "-"}</p>
              </div>
            </>
          ) : (
            <div className="transcript-box">
              <p>{sessionEnded ? "Session finished." : "Open a session to start testing items."}</p>
            </div>
          )}
        </div>

        <div className="device-card progress-card">
          <h2>Progress</h2>

          <div className="progress-group">
            <label>Session Progress</label>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.round(((currentItemIndex + (sessionEnded ? 1 : 0)) / totalItems) * 100)}%`,
                }}
              />
            </div>
            <span>
              {sessionEnded
                ? "100%"
                : `${Math.round((currentItemIndex / totalItems) * 100)}%`}
            </span>
          </div>

          <div className="progress-group">
            <label>Overall Score</label>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
            </div>
            <span>{overallProgress}%</span>
          </div>

          <div className="plan-box">
            <p><strong>Total Items:</strong> {totalItems}</p>
            <p><strong>Current Position:</strong> {sessionStarted ? currentItemIndex + 1 : 0}</p>
            <p><strong>Audio Input:</strong> ESP microphone</p>
            <p><strong>Backend:</strong> Whisper AI</p>
            <p><strong>Prompt Audio:</strong> Browser Speech Synthesis</p>
            <p><strong>Feedback Audio:</strong> Browser Speech Synthesis</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevicePage;