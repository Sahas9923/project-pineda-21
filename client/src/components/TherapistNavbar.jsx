import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "../styles/TherapistNavbar.css";

import { auth, db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";

const TherapistNavbar = () => {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [therapistData, setTherapistData] = useState({
    name: "Therapist",
    email: "",
    therapistId: "",
    imageUrl: "",
  });

  useEffect(() => {
    const fetchTherapistData = async () => {
      try {
        setLoadingProfile(true);

        const user = auth.currentUser;
        if (!user) {
          setLoadingProfile(false);
          return;
        }

        const therapistRef = doc(db, "therapists", user.uid);
        const therapistSnap = await getDoc(therapistRef);

        if (therapistSnap.exists()) {
          const data = therapistSnap.data();

          setTherapistData({
            name: data.name || "Therapist",
            email: data.email || user.email || "",
            therapistId: data.therapistId || "",
            imageUrl: data.imageUrl || "",
          });
        } else {
          setTherapistData({
            name: "Therapist",
            email: user.email || "",
            therapistId: "",
            imageUrl: "",
          });
        }
      } catch (error) {
        console.error("Error fetching therapist navbar data:", error);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchTherapistData();
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      alert("❌ Failed to logout.");
    }
  };

  return (
    <header className="therapist-navbar">
      <div className="therapist-navbar-left">
        <h2
          className="therapist-navbar-logo"
          onClick={() => navigate("/therapist-dashboard")}
        >
          🧸 Pineda Therapist
        </h2>
      </div>

      <nav className="therapist-navbar-center">
        <NavLink to="/therapist-dashboard" className="therapist-nav-link">
          Dashboard
        </NavLink>

        <NavLink to="/patients" className="therapist-nav-link">
          Patients
        </NavLink>

        <NavLink to="/reports" className="therapist-nav-link">
          Reports
        </NavLink>

      </nav>

      <div className="therapist-navbar-right" ref={dropdownRef}>
        <button
          type="button"
          className="therapist-profile-btn"
          onClick={() => setShowDropdown((prev) => !prev)}
        >
          {therapistData.imageUrl ? (
            <img
              src={therapistData.imageUrl}
              alt="Therapist"
              className="therapist-avatar"
            />
          ) : (
            <div className="therapist-avatar-fallback">🧑‍⚕️</div>
          )}

          <div className="therapist-user-text">
            <span className="therapist-user-name">
              {loadingProfile ? "Loading..." : therapistData.name}
            </span>
            <span className="therapist-user-role">Therapist</span>
          </div>

          <span className="therapist-arrow">{showDropdown ? "▲" : "▼"}</span>
        </button>

        {showDropdown && (
          <div className="therapist-dropdown">
            <div className="therapist-dropdown-top">
              {therapistData.imageUrl ? (
                <img
                  src={therapistData.imageUrl}
                  alt="Therapist"
                  className="therapist-dropdown-avatar"
                />
              ) : (
                <div className="therapist-dropdown-avatar-fallback">🧑‍⚕️</div>
              )}

              <div className="therapist-dropdown-user">
                <h4>{therapistData.name || "Therapist"}</h4>
                <p>{therapistData.email || "No email"}</p>
                <p>{therapistData.therapistId || "No therapist ID"}</p>
              </div>
            </div>

            <button
              type="button"
              className="therapist-dropdown-btn"
              onClick={() => {
                setShowDropdown(false);
                navigate("/settings");
              }}
            >
              ⚙️ Profile / Settings
            </button>

            <button
              type="button"
              className="therapist-dropdown-btn therapist-logout-btn"
              onClick={handleLogout}
            >
              🚪 Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default TherapistNavbar;