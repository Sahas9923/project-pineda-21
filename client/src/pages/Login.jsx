import React, { useMemo, useState } from "react";
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

  const [message, setMessage] = useState({
    text: "",
    type: "",
  });

  const teddyItems = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        id: index + 1,
        sizeClass: index % 3 === 0 ? "large" : index % 2 === 0 ? "small" : "",
      })),
    []
  );

  const showMessage = (text, type = "error") => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage({ text: "", type: "" });
    }, 3000);
  };

  const goToDashboard = (userRole) => {
    if (userRole === "parent") {
      navigate("/parent-dashboard");
    } else if (userRole === "therapist") {
      navigate("/therapist-dashboard");
    } else {
      showMessage("Invalid role.", "error");
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

    await setDoc(doc(db, "users", uid), {
      name: userData.name,
      email: userData.email,
      role: userData.role,
      readableId,
      createdAt: serverTimestamp(),
    });

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
          showMessage("Please enter your full name.", "error");
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
          showMessage("Parent account created successfully!", "success");
          setTimeout(() => goToDashboard("parent"), 700);
        } else if (role === "therapist") {
          showMessage("Therapist account created successfully!", "success");
          setTimeout(() => goToDashboard("therapist"), 700);
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
            showMessage("Login successful!", "success");
            setTimeout(() => goToDashboard("parent"), 700);
            return;
          }

          if (userData.role === "therapist") {
            showMessage("Login successful!", "success");
            setTimeout(() => goToDashboard("therapist"), 700);
            return;
          }
        }

        const parentDoc = await getDoc(doc(db, "parents", uid));
        const therapistDoc = await getDoc(doc(db, "therapists", uid));

        if (parentDoc.exists()) {
          showMessage("Login successful!", "success");
          setTimeout(() => goToDashboard("parent"), 700);
        } else if (therapistDoc.exists()) {
          showMessage("Login successful!", "success");
          setTimeout(() => goToDashboard("therapist"), 700);
        } else {
          showMessage("User role not found!", "error");
        }
      }
    } catch (error) {
      console.error("Auth error:", error);

      if (error.code === "auth/email-already-in-use") {
        showMessage("This email is already registered.", "error");
      } else if (error.code === "auth/invalid-email") {
        showMessage("Invalid email address.", "error");
      } else if (error.code === "auth/weak-password") {
        showMessage("Password should be at least 6 characters.", "error");
      } else if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        showMessage("Invalid credentials.", "error");
      } else {
        showMessage(error.message || "Something went wrong.", "error");
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

      if (!userDoc.exists() && !parentDoc.exists() && !therapistDoc.exists()) {
        await createUserDocuments(uid, {
          name: user.displayName || "User",
          email: user.email || "",
          role: role,
        });

        showMessage("Google sign in successful!", "success");
        setTimeout(() => goToDashboard(role), 700);
        return;
      }

      if (userDoc.exists()) {
        const userData = userDoc.data();

        if (userData.role === "parent") {
          showMessage("Google sign in successful!", "success");
          setTimeout(() => goToDashboard("parent"), 700);
          return;
        }

        if (userData.role === "therapist") {
          showMessage("Google sign in successful!", "success");
          setTimeout(() => goToDashboard("therapist"), 700);
          return;
        }
      }

      if (parentDoc.exists()) {
        showMessage("Google sign in successful!", "success");
        setTimeout(() => goToDashboard("parent"), 700);
      } else if (therapistDoc.exists()) {
        showMessage("Google sign in successful!", "success");
        setTimeout(() => goToDashboard("therapist"), 700);
      } else {
        showMessage("User role not found!", "error");
      }
    } catch (error) {
      console.error("Google login error:", error);
      showMessage(error.message || "Google sign in failed.", "error");
    }
  };

  return (
    <div className="login-container">
      <div className="left-panel">
        <div className="left-panel-glow left-glow-one"></div>
        <div className="left-panel-glow left-glow-two"></div>
        <div className="left-grid-overlay"></div>

        <div className="teddy-rain">
          {teddyItems.map((item) => (
            <span key={item.id} className={item.sizeClass}>
              🧸
            </span>
          ))}
        </div>

        <div className="info-content">
          <div className="brand-badge">PINEDA V2</div>

          <div className="hero-logo-wrap">
            <div className="hero-logo-ring"></div>
            <div className="hero-logo-core">🧸</div>
          </div>

          <h1>Pineda</h1>
          <p className="hero-description">
            Advanced speech learning and therapy platform for guided child
            development, therapist-led plans, toy-assisted interaction, and
            future-ready intelligent learning experiences.
          </p>

          <div className="feature-pills">
            <span>Speech Practice</span>
            <span>Therapist Guided</span>
            <span>Progress Tracking</span>
          </div>

          <div className="features">
            <div>🎯 Structured sound, word, sentence, and advanced activities</div>
            <div>🧠 Smart prototype-ready tracking with scalable reporting</div>
            <div>🎤 Laptop + mic mode with future toy and AR expansion</div>
            <div>👨‍⚕️ Therapist, parent, and guided learning support</div>
          </div>
        </div>
      </div>

      <div className="right-panel">
        <div className="right-panel-orb orb-one"></div>
        <div className="right-panel-orb orb-two"></div>

        <div className="login-box">
          <div className="header">
            <div className="logo-icon">
              <span>🧸</span>
            </div>

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

          {message.text && (
            <div className={`smooth-alert ${message.type}`}>
              {message.type === "success" ? "✅" : "⚠️"} {message.text}
            </div>
          )}

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
        </div>
      </div>
    </div>
  );
};

export default LoginPage;