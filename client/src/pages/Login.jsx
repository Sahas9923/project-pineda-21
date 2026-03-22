import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // ✅ IMPORTANT
import "../styles/Login.css";


const LoginPage = () => {

  const navigate = useNavigate(); // ✅ MUST be inside component

  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState("parent");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [slmcNumber, setSlmcNumber] = useState("");
  const [experience, setExperience] = useState("");
  const [contact, setContact] = useState("");
  const [linkedin, setLinkedin] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!isRegister) {
      if (role === "parent") {
        navigate("/parent-dashboard"); // ✅ redirect works
      } else if (role === "therapist") {
        navigate("/therapist"); // optional
      }
    } else {
      alert(`Account Created as ${role}`);
    }
  };

  return (
    <div className="login-container">

      {/* LEFT SIDE */}
      <div className="left-panel">

         <div className="teddy-rain">
            {[...Array(20)].map((_, i) => (
                <span key={i}>🧸</span>
            ))}
        </div>

        <div className="info-content">
          <h1>Pineda</h1>
          <p>AI-Powered Speech Therapy Platform</p>

          <div className="features">
            <div>🎯 Improve speech skills</div>
            <div>🧠 Smart diagnosis & tracking</div>
            <div>🎤 Voice feedback system</div>
            <div>👨‍⚕️ Therapist + Parent support</div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="right-panel">
        <div className="login-box">

          {/* HEADER */}
          <div className="header">
            <div className="logo-icon">🧸</div>
            <h2>Welcome to Pineda</h2>

            <div className="sound-btn-container">
            <button
            className="sound-btn"
            onClick={() => {
                const speak = () => {
                const msg = new SpeechSynthesisUtterance(
                    "Welcome to Pineda. Let's practice speaking together."
                );

                msg.rate = 0.85;   // slower for clarity
                msg.pitch = 1.4;   // more friendly / feminine

                const voices = window.speechSynthesis.getVoices();

                // try to select female voice
                const femaleVoice = voices.find(
                    (voice) =>
                    voice.name.toLowerCase().includes("zira") ||
                    voice.name.toLowerCase().includes("samantha") ||
                    voice.name.toLowerCase().includes("female") ||
                    voice.name.toLowerCase().includes("google")
                );

                if (femaleVoice) {
                    msg.voice = femaleVoice;
                }

                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(msg);
                };

                // ensure voices loaded
                if (speechSynthesis.getVoices().length === 0) {
                speechSynthesis.onvoiceschanged = speak;
                } else {
                speak();
                }
            }}
            >
            🔊 Play Welcome
        </button>
        </div>

            <p className="subtitle">
              {isRegister ? "Create your account" : "Sign in to continue"}
            </p>
          </div>

          {/* TABS */}
          <div className="tabs">
            <button
              className={!isRegister ? "active" : ""}
              onClick={() => setIsRegister(false)}
            >
              Sign In
            </button>
            <button
              className={isRegister ? "active" : ""}
              onClick={() => setIsRegister(true)}
            >
              Register
            </button>
          </div>

          {/* ROLE */}
          <div className="role-switch">
            <button
              className={role === "parent" ? "selected" : ""}
              onClick={() => setRole("parent")}
            >
              👨‍👩‍👦 Parent
            </button>
            <button
              className={role === "therapist" ? "selected" : ""}
              onClick={() => setRole("therapist")}
            >
              🧑‍⚕️ Therapist
            </button>
          </div>

          {/* FORM */}
          <form onSubmit={handleSubmit}>

            {isRegister && (
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {/* Therapist Fields */}
            {isRegister && role === "therapist" && (
              <>
                <input
                  type="text"
                  placeholder="SLMC Number"
                  value={slmcNumber}
                  onChange={(e) => setSlmcNumber(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Years of Experience"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Contact Number"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="LinkedIn (optional)"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                />
              </>
            )}

            <button className="submit-btn">
              {isRegister ? "Create Account" : "Sign In"}
            </button>
          </form>

          {/* DEVICE BUTTON */}
          <button className="device-btn">
            🧸 Open Device / Toy Mode
          </button>

        </div>
      </div>
    </div>
  );
};

export default LoginPage;