import React, { useEffect, useState } from "react";
import ParentNavbar from "../components/ParentNavbar";
import "../styles/ParentDashboard.css";

import { auth, db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";

const ParentDashboard = () => {
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
            email: data.email || user.email || "No email found",
            parentId: data.parentId || "No Parent ID",
          });
        } else {
          setParentData({
            name: "Parent",
            email: user.email || "No email found",
            parentId: "No Parent ID",
          });
        }
      } catch (error) {
        console.error("Error fetching parent data:", error);
      }
    };

    fetchParentData();
  }, []);

  return (
    <div className="dashboard-container">
      <ParentNavbar />

      <div className="dashboard-content">
        <div className="dashboard-top">
          <div className="welcome-section">
            <h1>👋 Welcome {parentData.name || "Parent"}</h1>
            <p className="dashboard-subtitle">
              Here is your child’s learning overview
            </p>
          </div>

          <div className="parent-profile-card">
            <div className="profile-placeholder">👤</div>

            <div className="profile-details">
              <h3>{parentData.name || "Parent"}</h3>
              <p>
                <strong>Email:</strong> {parentData.email}
              </p>
              <p>
                <strong>Parent ID:</strong> {parentData.parentId}
              </p>
            </div>
          </div>
        </div>

        <div className="cards">
          <div className="card">
            <h3>🎯 Child Level</h3>
            <p>Level 3 - Improving</p>
          </div>

          <div className="card">
            <h3>📈 Progress</h3>
            <p>75% Completion</p>
          </div>

          <div className="card">
            <h3>🎤 Sessions</h3>
            <p>12 Completed</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentDashboard;