import React, { useEffect, useState } from "react";
import TherapistNavbar from "../components/TherapistNavbar";
import "../styles/TherapistDashboard.css";

import { auth, db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";

const TherapistDashboard = () => {
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
            email: data.email || user.email || "No email found",
            therapistId: data.therapistId || "No Therapist ID",
          });
        } else {
          setTherapistData({
            name: "Therapist",
            email: user.email || "No email found",
            therapistId: "No Therapist ID",
          });
        }
      } catch (error) {
        console.error("Error fetching therapist data:", error);
      }
    };

    fetchTherapistData();
  }, []);

  return (
    <div className="therapist-container">
      <TherapistNavbar />

      <div className="therapist-content">
        <div className="therapist-top">
          <div className="welcome-section">
            <h1>👨‍⚕️ Welcome {therapistData.name || "Therapist"}</h1>
            <p className="therapist-subtitle">
              Here is your therapy practice overview
            </p>
          </div>

          <div className="therapist-profile-card">
            <div className="profile-placeholder">👤</div>

            <div className="profile-details">
              <h3>{therapistData.name || "Therapist"}</h3>
              <p>
                <strong>Email:</strong> {therapistData.email}
              </p>
              <p>
                <strong>Therapist ID:</strong> {therapistData.therapistId}
              </p>
            </div>
          </div>
        </div>

        <div className="cards">
          <div className="card">
            <h3>👶 Total Patients</h3>
            <p>24 Active</p>
          </div>

          <div className="card">
            <h3>📅 Sessions Today</h3>
            <p>6 Sessions</p>
          </div>

          <div className="card">
            <h3>📊 Reports Generated</h3>
            <p>18 Reports</p>
          </div>

          <div className="card">
            <h3>⭐ Performance</h3>
            <p>Excellent</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TherapistDashboard;