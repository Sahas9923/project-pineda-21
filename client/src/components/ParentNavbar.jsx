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
    name: "Parent",
    email: "",
    parentId: "",
    imageUrl: "",
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
        console.error("Error fetching parent data:", error);
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
      <div className="navbar-left">
        <h2 className="navbar-logo" onClick={() => navigate("/parent-dashboard")}>
          🧸 Pineda
        </h2>
      </div>

      <nav className="navbar-center">
        <NavLink to="/parent-dashboard" className="nav-link">
          Dashboard
        </NavLink>

        <NavLink to="/child-info" className="nav-link">
          Child Info
        </NavLink>

        <NavLink to="/progress" className="nav-link">
          Progress
        </NavLink>
      </nav>

      <div className="navbar-right" ref={dropdownRef}>
        <button
          type="button"
          className="navbar-profile-btn"
          onClick={() => setShowDropdown((prev) => !prev)}
        >
          {parentData.imageUrl ? (
            <img
              src={parentData.imageUrl}
              alt="Parent"
              className="navbar-avatar"
            />
          ) : (
            <div className="navbar-avatar-fallback">👤</div>
          )}

          <div className="navbar-user-text">
            <span className="navbar-user-name">{parentData.name}</span>
          </div>

          <span className="navbar-arrow">{showDropdown ? "▲" : "▼"}</span>
        </button>

        {showDropdown && (
          <div className="navbar-dropdown">
            <div className="navbar-dropdown-top">
              {parentData.imageUrl ? (
                <img
                  src={parentData.imageUrl}
                  alt="Parent"
                  className="navbar-dropdown-avatar"
                />
              ) : (
                <div className="navbar-dropdown-avatar-fallback">👤</div>
              )}

              <div className="navbar-dropdown-user">
                <h4>{parentData.name}</h4>
                <p>{parentData.email || "No email"}</p>
                <p>{parentData.parentId || "No parent ID"}</p>
              </div>
            </div>

            <button
              type="button"
              className="navbar-dropdown-btn"
              onClick={() => {
                setShowDropdown(false);
                navigate("/parent-settings");
              }}
            >
              ⚙️ Profile / Settings
            </button>

            <button
              type="button"
              className="navbar-dropdown-btn navbar-logout-btn"
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