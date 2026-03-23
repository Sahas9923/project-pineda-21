import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "../styles/ParentNavbar.css";

import { auth, db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";

const ParentNavbar = () => {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  const [showDropdown, setShowDropdown] = useState(false);
  const [parentData, setParentData] = useState({
    name: "",
    email: "",
    parentId: "",
  });

  useEffect(() => {
    const fetchParentData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const parentRef = doc(db, "parents", user.uid);
        const parentSnap = await getDoc(parentRef);

        if (parentSnap.exists()) {
          const data = parentSnap.data();
          setParentData({
            name: data.name || "Parent",
            email: data.email || user.email || "",
            parentId: data.parentId || "",
          });
        } else {
          setParentData({
            name: "Parent",
            email: user.email || "",
            parentId: "",
          });
        }
      } catch (error) {
        console.error("Error fetching parent navbar data:", error);
      }
    };

    fetchParentData();
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
    <div className="parent-navbar">
      <h2 className="logo">🧸 Pineda</h2>

      <div className="nav-links">
        <NavLink to="/parent-dashboard">Dashboard</NavLink>
        <NavLink to="/child-info">Child Info</NavLink>
        <NavLink to="/progress">Progress</NavLink>
      </div>

      <div className="navbar-profile-wrapper" ref={dropdownRef}>
        <div
          className="navbar-profile"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <div className="profile-icon">👤</div>

          <div className="profile-text">
            <p className="profile-name">{parentData.name || "Parent"}</p>
            <p className="profile-email">{parentData.email}</p>
          </div>

          <span className="dropdown-arrow">{showDropdown ? "▲" : "▼"}</span>
        </div>

        {showDropdown && (
          <div className="profile-dropdown">
            <div className="dropdown-user-info">
              <div className="dropdown-avatar">👤</div>
              <div>
                <h4>{parentData.name || "Parent"}</h4>
                <p>{parentData.email}</p>
                <p>{parentData.parentId}</p>
              </div>
            </div>

            <button
              className="dropdown-btn"
              onClick={() => {
                setShowDropdown(false);
                navigate("/settings");
              }}
            >
              ⚙️ Profile / Settings
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

export default ParentNavbar;