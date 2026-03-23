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
  const [therapistData, setTherapistData] = useState({
    name: "",
    email: "",
    therapistId: "",
  });

  useEffect(() => {
    const fetchTherapistData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const therapistRef = doc(db, "therapists", user.uid);
        const therapistSnap = await getDoc(therapistRef);

        if (therapistSnap.exists()) {
          const data = therapistSnap.data();
          setTherapistData({
            name: data.name || "Therapist",
            email: data.email || user.email || "",
            therapistId: data.therapistId || "",
          });
        } else {
          setTherapistData({
            name: "Therapist",
            email: user.email || "",
            therapistId: "",
          });
        }
      } catch (error) {
        console.error("Error fetching therapist navbar data:", error);
      }
    };

    fetchTherapistData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      alert("✅ Logged out successfully!");
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      alert("❌ Failed to logout.");
    }
  };

  return (
    <div className="therapist-navbar">
      <h2 className="logo">🧸 Pineda Therapist</h2>

      <div className="nav-links">
        <NavLink to="/therapist-dashboard">Dashboard</NavLink>
        <NavLink to="/patients">Patients</NavLink>
        <NavLink to="/reports">Reports</NavLink>
      </div>

      <div className="navbar-profile-wrapper" ref={dropdownRef}>
        <div
          className="navbar-profile"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <div className="profile-icon">👤</div>

          <div className="profile-text">
            <p className="profile-name">{therapistData.name || "Therapist"}</p>
            <p className="profile-email">{therapistData.email}</p>
          </div>

          <span className="dropdown-arrow">{showDropdown ? "▲" : "▼"}</span>
        </div>

        {showDropdown && (
          <div className="profile-dropdown">
            <div className="dropdown-user-info">
              <div className="dropdown-avatar">👤</div>
              <div>
                <h4>{therapistData.name || "Therapist"}</h4>
                <p>{therapistData.email}</p>
                <p>{therapistData.therapistId}</p>
              </div>
            </div>

            <button
              className="dropdown-btn"
              onClick={() => {
                setShowDropdown(false);
                navigate("/therapist-settings");
              }}
            >
              ⚙️ Settings
            </button>

            <button className="dropdown-btn logout-btn" onClick={handleLogout}>
              🚪 Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TherapistNavbar;