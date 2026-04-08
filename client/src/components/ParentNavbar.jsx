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
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [parentData, setParentData] = useState({
    name: "Parent",
    email: "",
    parentId: "",
    imageUrl: "",
  });

  useEffect(() => {
    const fetchParentData = async () => {
      try {
        setLoadingProfile(true);

        const user = auth.currentUser;
        if (!user) {
          setLoadingProfile(false);
          return;
        }

        const parentRef = doc(db, "parents", user.uid);
        const parentSnap = await getDoc(parentRef);

        if (parentSnap.exists()) {
          const data = parentSnap.data();

          setParentData({
            name: data.name || "Parent",
            email: data.email || user.email || "",
            parentId: data.parentId || "",
            imageUrl: data.imageUrl || "",
          });
        } else {
          setParentData({
            name: "Parent",
            email: user.email || "",
            parentId: "",
            imageUrl: "",
          });
        }
      } catch (error) {
        console.error("Error fetching parent navbar data:", error);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchParentData();
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
    <header className="parent-navbar">
      <div className="parent-navbar-glow parent-navbar-glow-left"></div>
      <div className="parent-navbar-glow parent-navbar-glow-right"></div>

      <div className="parent-navbar-left">
        <h2
          className="parent-navbar-logo"
          onClick={() => navigate("/parent-dashboard")}
        >
          <span className="parent-logo-badge">🧸</span>
          <span className="parent-logo-text">Pineda</span>
        </h2>
      </div>

      <nav className="parent-navbar-center">
        <NavLink to="/parent-dashboard" className="parent-nav-link">
          Dashboard
        </NavLink>

        <NavLink to="/child-info" className="parent-nav-link">
          Child Info
        </NavLink>

        <NavLink to="/parent-progress" className="parent-nav-link">
          Progress
        </NavLink>
      </nav>

      <div className="parent-navbar-right" ref={dropdownRef}>
        <button
          type="button"
          className="parent-profile-btn"
          onClick={() => setShowDropdown((prev) => !prev)}
        >
          {parentData.imageUrl ? (
            <img
              src={parentData.imageUrl}
              alt="Parent"
              className="parent-avatar"
            />
          ) : (
            <div className="parent-avatar-fallback">👤</div>
          )}

          <div className="parent-user-text">
            <span className="parent-user-name">
              {loadingProfile ? "Loading..." : parentData.name}
            </span>
            <span className="parent-user-role">Parent Workspace</span>
          </div>

          <span className="parent-arrow">{showDropdown ? "▲" : "▼"}</span>
        </button>

        {showDropdown && (
          <div className="parent-dropdown">
            <div className="parent-dropdown-top">
              {parentData.imageUrl ? (
                <img
                  src={parentData.imageUrl}
                  alt="Parent"
                  className="parent-dropdown-avatar"
                />
              ) : (
                <div className="parent-dropdown-avatar-fallback">👤</div>
              )}

              <div className="parent-dropdown-user">
                <h4>{parentData.name || "Parent"}</h4>
                <p>{parentData.email || "No email"}</p>
                <p>{parentData.parentId || "No parent ID"}</p>
              </div>
            </div>

            <button
              type="button"
              className="parent-dropdown-btn"
              onClick={() => {
                setShowDropdown(false);
                navigate("/parent-settings");
              }}
            >
              ⚙️ Profile / Settings
            </button>

            <button
              type="button"
              className="parent-dropdown-btn parent-logout-btn"
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

export default ParentNavbar;