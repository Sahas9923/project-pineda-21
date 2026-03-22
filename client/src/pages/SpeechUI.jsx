import { useEffect, useState } from "react";
import io from "socket.io-client";
import "../sstyles/SpeechUI.css";

const socket = io("http://192.168.1.2:3000"); // 🔥 replace with your PC IP

function SpeechUI() {
  const [result, setResult] = useState(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    // Listen for results from server
    socket.on("speech-result", (data) => {
      setResult(data);
      setListening(false);
    });

    return () => socket.off("speech-result");
  }, []);

  return (
    <div className="container">
      <h1>🎤 Speech Learning</h1>

      {/* Status */}
      <div className={`status ${listening ? "active" : ""}`}>
        {listening ? "Listening..." : "Waiting for speech"}
      </div>

      {/* Result Card */}
      {result && (
        <div className="card">
          <h2>🗣️ You said:</h2>
          <p className="speech">{result.speech}</p>

          <h3 className={result.correct ? "correct" : "wrong"}>
            {result.correct ? "✅ Correct!" : "❌ Try Again"}
          </h3>
        </div>
      )}
    </div>
  );
}

export default SpeechUI;