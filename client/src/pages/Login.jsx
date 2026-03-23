import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Login.css";

// Firebase
import { auth, db } from "../firebase/config";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

const LoginPage = () => {
  const navigate = useNavigate();

  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState("parent");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const goToDashboard = (userRole) => {
    if (userRole === "parent") {
      navigate("/parent-dashboard");
    } else if (userRole === "therapist") {
      navigate("/therapist-dashboard");
    } else {
      alert("❌ Invalid role.");
    }
  };

  const generateReadableId = async (userRole) => {
    const counterDocId =
      userRole === "parent" ? "parentCounter" : "therapistCounter";
    const prefix = userRole === "parent" ? "PAR" : "THE";

    const counterRef = doc(db, "counters", counterDocId);

    const newCount = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);

      let count = 1;

      if (!counterSnap.exists()) {
        transaction.set(counterRef, { count: 1 });
        return 1;
      } else {
        count = counterSnap.data().count + 1;
        transaction.update(counterRef, { count });
        return count;
      }
    });

    return `${prefix}-${String(newCount).padStart(4, "0")}`;
  };

  const createUserDocuments = async (uid, userData) => {
    const readableId = await generateReadableId(userData.role);

    // users collection
    await setDoc(doc(db, "users", uid), {
      name: userData.name,
      email: userData.email,
      role: userData.role,
      readableId,
      createdAt: serverTimestamp(),
    });

    // parents collection
    if (userData.role === "parent") {
      await setDoc(doc(db, "parents", uid), {
        parentId: readableId,
        name: userData.name,
        email: userData.email,
        role: "parent",
        contact: "",
        address: "",
        imageUrl: "", 
        createdAt: serverTimestamp(),
      });
    }

    // therapists collection
    if (userData.role === "therapist") {
      await setDoc(doc(db, "therapists", uid), {
        therapistId: readableId,
        name: userData.name,
        email: userData.email,
        role: "therapist",
        contact: "",
        slmcNumber: "",
        experience: "",
        imageUrl: "", 
        createdAt: serverTimestamp(),
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (isRegister) {
        if (!name.trim()) {
          alert("❌ Please enter your full name.");
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        const uid = userCredential.user.uid;

        await createUserDocuments(uid, {
          name: name.trim(),
          email: email.trim(),
          role,
        });

        if (role === "parent") {
          alert("✅ Parent account created successfully!");
          goToDashboard("parent");
        } else if (role === "therapist") {
          alert("✅ Therapist account created successfully!");
          goToDashboard("therapist");
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        const uid = userCredential.user.uid;

        const userDoc = await getDoc(doc(db, "users", uid));

        if (userDoc.exists()) {
          const userData = userDoc.data();

          if (userData.role === "parent") {
            alert("✅ Login successful!");
            goToDashboard("parent");
            return;
          }

          if (userData.role === "therapist") {
            alert("✅ Login successful!");
            goToDashboard("therapist");
            return;
          }
        }

        const parentDoc = await getDoc(doc(db, "parents", uid));
        const therapistDoc = await getDoc(doc(db, "therapists", uid));

        if (parentDoc.exists()) {
          alert("✅ Login successful!");
          goToDashboard("parent");
        } else if (therapistDoc.exists()) {
          alert("✅ Login successful!");
          goToDashboard("therapist");
        } else {
          alert("❌ User role not found!");
        }
      }
    } catch (error) {
      console.error("Auth error:", error);

      if (error.code === "auth/email-already-in-use") {
        alert("❌ This email is already registered.");
      } else if (error.code === "auth/invalid-email") {
        alert("❌ Invalid email address.");
      } else if (error.code === "auth/weak-password") {
        alert("❌ Password should be at least 6 characters.");
      } else if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        alert("❌ Invalid credentials.");
      } else {
        alert("❌ " + error.message);
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      const user = result.user;
      const uid = user.uid;

      const userRef = doc(db, "users", uid);
      const parentRef = doc(db, "parents", uid);
      const therapistRef = doc(db, "therapists", uid);

      const userDoc = await getDoc(userRef);
      const parentDoc = await getDoc(parentRef);
      const therapistDoc = await getDoc(therapistRef);

      // new google user -> create based on selected role
      if (!userDoc.exists() && !parentDoc.exists() && !therapistDoc.exists()) {
        await createUserDocuments(uid, {
          name: user.displayName || "User",
          email: user.email || "",
          role: role,
        });

        alert("✅ Google sign in successful!");
        goToDashboard(role);
        return;
      }

      // existing user
      if (userDoc.exists()) {
        const userData = userDoc.data();

        if (userData.role === "parent") {
          alert("✅ Google sign in successful!");
          goToDashboard("parent");
          return;
        }

        if (userData.role === "therapist") {
          alert("✅ Google sign in successful!");
          goToDashboard("therapist");
          return;
        }
      }

      if (parentDoc.exists()) {
        alert("✅ Google sign in successful!");
        goToDashboard("parent");
      } else if (therapistDoc.exists()) {
        alert("✅ Google sign in successful!");
        goToDashboard("therapist");
      } else {
        alert("❌ User role not found!");
      }
    } catch (error) {
      console.error("Google login error:", error);
      alert("❌ " + error.message);
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
          <div className="header">
            <div className="logo-icon">🧸</div>
            <h2>Welcome to Pineda</h2>

            <div className="sound-btn-container">
              <button
                type="button"
                className="sound-btn"
                onClick={() => {
                  const speak = () => {
                    const msg = new SpeechSynthesisUtterance(
                      "Welcome to Pineda. Let's practice speaking together."
                    );

                    msg.rate = 0.85;
                    msg.pitch = 1.4;

                    const voices = window.speechSynthesis.getVoices();

                    const femaleVoice = voices.find(
                      (voice) =>
                        voice.name.toLowerCase().includes("zira") ||
                        voice.name.toLowerCase().includes("samantha") ||
                        voice.name.toLowerCase().includes("female") ||
                        voice.name.toLowerCase().includes("google")
                    );

                    if (femaleVoice) msg.voice = femaleVoice;

                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(msg);
                  };

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

          <div className="tabs">
            <button
              type="button"
              className={!isRegister ? "active" : ""}
              onClick={() => setIsRegister(false)}
            >
              Sign In
            </button>
            <button
              type="button"
              className={isRegister ? "active" : ""}
              onClick={() => setIsRegister(true)}
            >
              Register
            </button>
          </div>

          <div className="role-switch">
            <button
              type="button"
              className={role === "parent" ? "selected" : ""}
              onClick={() => setRole("parent")}
            >
              👨‍👩‍👦 Parent
            </button>
            <button
              type="button"
              className={role === "therapist" ? "selected" : ""}
              onClick={() => setRole("therapist")}
            >
              🧑‍⚕️ Therapist
            </button>
          </div>

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

            <button type="submit" className="submit-btn">
              {isRegister ? "Create Account" : "Sign In"}
            </button>
          </form>

          <button
            type="button"
            className="google-btn"
            onClick={handleGoogleLogin}
          >
            <span className="google-icon">G</span>
            <span>Continue with Google</span>
          </button>

          <button type="button" className="device-btn">
            🧸 Open Device / Toy Mode
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;