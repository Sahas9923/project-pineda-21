import React, { useEffect, useMemo, useState } from "react";
import ParentNavbar from "../components/ParentNavbar";
import "../styles/ParentDashboard.css";

import { auth, db } from "../firebase/config";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";



import {
  FaChild,
  FaUserMd,
  FaChartLine,
  FaPuzzlePiece,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaEnvelope,
  FaClock,
} from "react-icons/fa";

import sahasImg from "../assets/sahas.png";
import thiliniImg from "../assets/thilini.png";

const geoUrl =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const cityCoordinates = {
  Colombo: [79.8612, 6.9271],
  Negombo: [79.8358, 7.2083],
  Kandy: [80.6337, 7.2906],
  Galle: [80.217, 6.0535],
  Jaffna: [80.0074, 9.6615],
  Kurunegala: [80.3647, 7.4863],
  Matara: [80.546, 5.9485],
  Anuradhapura: [80.4037, 8.3114],
  Batticaloa: [81.701, 7.7102],
  London: [-0.1276, 51.5072],
  Dubai: [55.2708, 25.2048],
  Sydney: [151.2093, -33.8688],
  Toronto: [-79.3832, 43.6532],
  Singapore: [103.8198, 1.3521],
  NewYork: [-74.006, 40.7128],
  Melbourne: [144.9631, -37.8136],
};

const ParentDashboard = () => {
  const [parentName, setParentName] = useState("Parent");
  const [childrenList, setChildrenList] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const parentRef = doc(db, "parents", user.uid);
      const parentSnap = await getDoc(parentRef);

      if (parentSnap.exists()) {
        const parentData = parentSnap.data();
        setParentName(parentData.name || "Parent");
      }

      const childQuery = query(
        collection(db, "children"),
        where("parentUid", "==", user.uid)
      );
      const childSnapshot = await getDocs(childQuery);

      const childData = childSnapshot.docs.map((childDoc) => ({
        id: childDoc.id,
        ...childDoc.data(),
      }));

      setChildrenList(childData);

      const uniqueTherapistIds = [
        ...new Set(
          childData
            .map((child) => child.therapistUid)
            .filter((therapistUid) => !!therapistUid)
        ),
      ];

      const therapistResults = [];

      for (const therapistUid of uniqueTherapistIds) {
        const therapistRef = doc(db, "therapists", therapistUid);
        const therapistSnap = await getDoc(therapistRef);

        if (therapistSnap.exists()) {
          const therapistData = therapistSnap.data();

          let firstLocation = null;
          try {
            const locationsSnapshot = await getDocs(
              collection(db, "therapists", therapistUid, "locations")
            );

            if (!locationsSnapshot.empty) {
              const locations = locationsSnapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));

              firstLocation =
                locations.find((loc) => loc.isPrimary) || locations[0] || null;
            }
          } catch (error) {
            console.log("No location data found for therapist:", therapistUid);
          }

          const rawCity = firstLocation?.city || therapistData.city || "Colombo";
          const normalizedCityKey = rawCity.replace(/\s+/g, "");

          therapistResults.push({
            id: therapistUid,
            ...therapistData,
            city: rawCity,
            coordinates:
              cityCoordinates[rawCity] ||
              cityCoordinates[normalizedCityKey] ||
              cityCoordinates.Colombo,
            locationData: firstLocation,
            description:
              therapistData.description ||
              "A dedicated speech therapy professional supporting child communication development through guided and structured therapy sessions.",
          });
        }
      }

      setTherapists(therapistResults);
    } catch (error) {
      console.error("Error fetching parent dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const therapistCount = therapists.length;
    const childCount = childrenList.length;

    const assignedDeviceCount = childrenList.filter(
      (child) => child.deviceAssigned
    ).length;

    const assignedLevelCount = childrenList.filter(
      (child) => child.assignedLevelId || child.assignedLevelName
    ).length;

    return {
      childCount,
      therapistCount,
      assignedDeviceCount,
      assignedLevelCount,
    };
  }, [childrenList, therapists]);

  return (
    <div className="parent-dashboard-page">
      <ParentNavbar />

      <div className="parent-dashboard-container">
        <section className="dashboard-hero">
          <div className="hero-left">
            <div className="hero-badge">🧸 Welcome to Pineda</div>
            <h1>Hello, {parentName}</h1>
            <p>
              Track your child’s therapy journey, connect with therapists, and
              explore the people behind the Pineda platform in one modern parent
              dashboard.
            </p>

            <div className="hero-actions">
              <button className="hero-btn primary-btn">View Child Info</button>
              <button className="hero-btn secondary-btn">View Progress</button>
            </div>
          </div>

          <div className="hero-right">
            <div className="hero-glass-card">
              <h3>Pineda Mission</h3>
              <p>
                Pineda was created to make speech therapy more supportive,
                engaging, and accessible for children, parents, and therapists
                through thoughtful design and modern technology.
              </p>
            </div>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><FaChild /></div>
            <div>
              <h3>{stats.childCount}</h3>
              <p>Registered Children</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon"><FaUserMd /></div>
            <div>
              <h3>{stats.therapistCount}</h3>
              <p>Connected Therapists</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon"><FaPuzzlePiece /></div>
            <div>
              <h3>{stats.assignedDeviceCount}</h3>
              <p>Assigned Devices</p>
            </div>
          </div>

        </section>

        <section className="dashboard-section">
          <div className="section-head">
            <h2>Therapist Network</h2>
            <p>
              Explore connected therapists across cities. Click a therapist
              marker to view their details.
            </p>
          </div>

          <div className="map-card">
            <div className="map-wrapper">
              
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <div className="section-head">
            <h2>About Pineda</h2>
            <p>
              Built with purpose to support children, families, and therapists
              through a more human-centered speech therapy experience.
            </p>
          </div>

          <div className="about-project-card">
            <p>
              Pineda is an AI-supported speech therapy platform designed to make
              therapy interaction more engaging for children, more informative
              for parents, and more manageable for therapists. The platform
              combines progress visibility, therapist support, and child-friendly
              digital interaction to create a more connected therapy experience.
            </p>
          </div>

          <div className="founders-grid">
            <div className="founder-card">
              <img
                src={sahasImg}
                alt="Sahas Suraweera"
                className="founder-image"
              />
              <div className="founder-content">
                <span className="founder-role">Co-Founder & Project Lead</span>
                <h3>Sahas Suraweera</h3>
                <p>
                  Sahas Suraweera leads the vision, planning, and overall system
                  direction of Pineda. He focuses on building an accessible and
                  meaningful solution that supports speech therapy through
                  engaging technology, structured progress visibility, and
                  child-friendly interaction.
                </p>
              </div>
            </div>

            <div className="founder-card">
              <img
                src={thiliniImg}
                alt="Thilini Piyumika"
                className="founder-image"
              />
              <div className="founder-content">
                <span className="founder-role">
                  Co-Founder & Design / Development Lead
                </span>
                <h3>Thilini Piyumika</h3>
                <p>
                  Thilini Piyumika contributes to the creative and technical
                  development of Pineda, with focus on interface design, user
                  experience, and practical system implementation. Her work
                  helps ensure the platform remains supportive, clear, and
                  engaging for children, parents, and therapists.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {selectedTherapist && (
        <div
          className="therapist-modal-overlay"
          onClick={() => setSelectedTherapist(null)}
        >
          <div
            className="therapist-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={() => setSelectedTherapist(null)}
            >
              ✕
            </button>

            <div className="modal-header">
              <img
                src={selectedTherapist.imageUrl || thiliniImg}
                alt={selectedTherapist.name || "Therapist"}
                className="modal-therapist-image"
              />

              <div>
                <h2>{selectedTherapist.name || "Therapist"}</h2>
                <p className="modal-role">
                  {selectedTherapist.specialization || "Speech Therapist"}
                </p>
                <p className="modal-city">
                  <FaMapMarkerAlt /> {selectedTherapist.city || "City not set"}
                </p>
              </div>
            </div>

            <div className="modal-body">
              <p>{selectedTherapist.description}</p>

              <div className="modal-info-grid">
                <div className="modal-info-item">
                  <FaPhoneAlt />
                  <span>{selectedTherapist.contact || "No contact available"}</span>
                </div>

                <div className="modal-info-item">
                  <FaEnvelope />
                  <span>{selectedTherapist.email || "No email available"}</span>
                </div>

                <div className="modal-info-item">
                  <FaClock />
                  <span>
                    {selectedTherapist.locationData?.availableDays || "Days not set"}
                  </span>
                </div>

                <div className="modal-info-item">
                  <FaClock />
                  <span>
                    {selectedTherapist.locationData?.availableTime || "Time not set"}
                  </span>
                </div>
              </div>

              <div className="modal-extra-card">
                <h4>Practice Location</h4>
                <p>
                  {selectedTherapist.locationData?.placeName || "Not specified"}
                </p>
                <p>{selectedTherapist.locationData?.address || "No address available"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="dashboard-loading-overlay">
          <div className="dashboard-loading-card">Loading dashboard...</div>
        </div>
      )}
    </div>
  );
};

export default ParentDashboard;