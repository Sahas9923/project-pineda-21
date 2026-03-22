import React from "react";
import "../styles/ParentDashboard.css";

const ParentDashboard = () => {
  return (
    <div className="dashboard-container">

      {/* SIDEBAR */}
      <div className="sidebar">
        <h2 className="logo">🧸 Pineda</h2>

        <ul>
          <li className="active">Dashboard</li>
          <li>Child Progress</li>
          <li>Reports</li>
          <li>Sessions</li>
          <li>Settings</li>
        </ul>
      </div>

      {/* MAIN */}
      <div className="main">

        {/* TOP BAR */}
        <div className="topbar">
          <h2>Parent Dashboard</h2>
          <div className="profile">👨‍👩‍👦 Parent</div>
        </div>

        {/* STATS */}
        <div className="cards">
          <div className="card">
            <h3>Videos Completed</h3>
            <p>12</p>
          </div>

          <div className="card">
            <h3>Exercises Done</h3>
            <p>34</p>
          </div>

          <div className="card">
            <h3>Progress</h3>
            <p>75%</p>
          </div>

          <div className="card">
            <h3>Sessions</h3>
            <p>8</p>
          </div>
        </div>

        {/* CHILD PROGRESS */}
        <div className="progress-section">
          <h3>Child Progress</h3>

          <div className="progress-bar">
            <div className="progress-fill" style={{ width: "75%" }}></div>
          </div>

          <p>Level 3 - Articulation Training</p>
        </div>

        {/* RECENT ACTIVITY */}
        <div className="activity">
          <h3>Recent Activity</h3>

          <ul>
            <li>✔ Completed pronunciation exercise</li>
            <li>🎤 Practiced vowel sounds</li>
            <li>📊 Progress improved by 5%</li>
          </ul>
        </div>

      </div>
    </div>
  );
};

export default ParentDashboard;