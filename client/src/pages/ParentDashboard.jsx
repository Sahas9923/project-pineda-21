import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  FaPuzzlePiece,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaEnvelope,
  FaClock,
} from "react-icons/fa";

import sahasImg from "../assets/sahas.png";
import thiliniImg from "../assets/thilini.png";

const cityCoordinates = {
  Colombo: { lat: 6.9271, lng: 79.8612 },
  Negombo: { lat: 7.2083, lng: 79.8358 },
  Kandy: { lat: 7.2906, lng: 80.6337 },
  Galle: { lat: 6.0535, lng: 80.217 },
  Jaffna: { lat: 9.6615, lng: 80.0074 },
  Kurunegala: { lat: 7.4863, lng: 80.3647 },
  Matara: { lat: 5.9485, lng: 80.546 },
  Anuradhapura: { lat: 8.3114, lng: 80.4037 },
  Batticaloa: { lat: 7.7102, lng: 81.701 },
  London: { lat: 51.5072, lng: -0.1276 },
  Dubai: { lat: 25.2048, lng: 55.2708 },
  Sydney: { lat: -33.8688, lng: 151.2093 },
  Toronto: { lat: 43.6532, lng: -79.3832 },
  Singapore: { lat: 1.3521, lng: 103.8198 },
  NewYork: { lat: 40.7128, lng: -74.006 },
  Melbourne: { lat: -37.8136, lng: 144.9631 },
};

const ParentDashboard = () => {
  const navigate = useNavigate();

  const [parentName, setParentName] = useState("Parent");
  const [childrenList, setChildrenList] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [allTherapists, setAllTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const buildTherapistObject = async (therapistId, therapistData) => {
    let allLocations = [];
    let firstLocation = null;

    try {
      const locationsSnapshot = await getDocs(
        collection(db, "therapists", therapistId, "locations")
      );

      if (!locationsSnapshot.empty) {
        allLocations = locationsSnapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        firstLocation =
          allLocations.find((loc) => loc.isPrimary) || allLocations[0] || null;
      }
    } catch (error) {
      console.log("No location data found for therapist:", therapistId);
    }

    const rawCity = firstLocation?.city || therapistData.city || "Colombo";
    const normalizedCityKey = rawCity.replace(/\s+/g, "");

    const matchedCoordinates =
      cityCoordinates[rawCity] ||
      cityCoordinates[normalizedCityKey] ||
      cityCoordinates.Colombo;

    return {
      id: therapistId,
      ...therapistData,
      city: rawCity,
      coordinates: matchedCoordinates,
      locationData: firstLocation,
      locations: allLocations,
      description:
        therapistData.description ||
        "A dedicated speech therapy professional supporting child communication development through guided and structured therapy sessions.",
    };
  };

  const fetchAllTherapists = async () => {
    try {
      const therapistSnapshot = await getDocs(collection(db, "therapists"));

      const therapistResults = await Promise.all(
        therapistSnapshot.docs.map(async (therapistDoc) => {
          return await buildTherapistObject(therapistDoc.id, therapistDoc.data());
        })
      );

      setAllTherapists(therapistResults);
    } catch (error) {
      console.error("Error fetching all therapists:", error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }

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

      const therapistResults = await Promise.all(
        uniqueTherapistIds.map(async (therapistUid) => {
          const therapistRef = doc(db, "therapists", therapistUid);
          const therapistSnap = await getDoc(therapistRef);

          if (!therapistSnap.exists()) return null;

          return await buildTherapistObject(therapistUid, therapistSnap.data());
        })
      );

      setTherapists(therapistResults.filter(Boolean));

      await fetchAllTherapists();
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
      (child) => child.deviceAssigned || child.deviceId || child.deviceCode
    ).length;

    return {
      childCount,
      therapistCount,
      assignedDeviceCount,
    };
  }, [childrenList, therapists]);

  const mapEmbedUrl = useMemo(() => {
    if (selectedTherapist?.coordinates) {
      const { lat, lng } = selectedTherapist.coordinates;
      return `https://www.google.com/maps?q=${lat},${lng}&z=11&output=embed`;
    }

    if (allTherapists.length > 0 && allTherapists[0]?.coordinates) {
      const { lat, lng } = allTherapists[0].coordinates;
      return `https://www.google.com/maps?q=${lat},${lng}&z=8&output=embed`;
    }

    return "https://www.google.com/maps?q=Sri%20Lanka&z=7&output=embed";
  }, [selectedTherapist, allTherapists]);

  return (
    <div className="parent-dashboard-page">
      <ParentNavbar />

      <div className="parent-dashboard-background">
        <div className="parent-dashboard-orb orb-one"></div>
        <div className="parent-dashboard-orb orb-two"></div>
        <div className="parent-dashboard-orb orb-three"></div>
        <div className="parent-dashboard-grid"></div>
      </div>

      <div className="parent-dashboard-container">
        <section className="parent-hero-section">
          <div className="parent-hero-card parent-hero-main">
            <span className="parent-hero-badge">🧸 PINEDA Parent Workspace</span>
            <h1>Hello, {parentName}</h1>
            <p>
              Track your child’s therapy journey, connect with therapists, and
              explore the team behind Pineda through a calm and modern parent
              dashboard experience.
            </p>

            <div className="parent-hero-actions">
              <button
                className="parent-hero-btn parent-hero-btn-primary"
                onClick={() => navigate("/child-info")}
              >
                View Child Info
              </button>

              <button
                className="parent-hero-btn parent-hero-btn-secondary"
                onClick={() => navigate("/parent-progress")}
              >
                View Progress
              </button>
            </div>

            <div className="parent-inline-stats">
              <div className="parent-inline-stat">
                <span>Children</span>
                <strong>{stats.childCount}</strong>
              </div>
              <div className="parent-inline-stat">
                <span>Therapists</span>
                <strong>{stats.therapistCount}</strong>
              </div>
              <div className="parent-inline-stat">
                <span>Devices</span>
                <strong>{stats.assignedDeviceCount}</strong>
              </div>
            </div>
          </div>

          <div className="parent-hero-card parent-hero-side">
            <h3>Pineda Mission</h3>
            <p>
              Pineda was created to make speech therapy more supportive,
              engaging, and accessible for children, parents, and therapists
              through thoughtful design and modern technology.
            </p>
          </div>
        </section>

        <section className="parent-stats-section">
          <div className="parent-stats-grid">
            <div className="parent-stat-card">
              <div className="parent-stat-icon">
                <FaChild />
              </div>
              <div>
                <h3>{stats.childCount}</h3>
                <p>Registered Children</p>
              </div>
            </div>

            <div className="parent-stat-card">
              <div className="parent-stat-icon">
                <FaUserMd />
              </div>
              <div>
                <h3>{stats.therapistCount}</h3>
                <p>Assigned Therapists</p>
              </div>
            </div>

            <div className="parent-stat-card">
              <div className="parent-stat-icon">
                <FaPuzzlePiece />
              </div>
              <div>
                <h3>{stats.assignedDeviceCount}</h3>
                <p>Assigned Devices</p>
              </div>
            </div>
          </div>
        </section>

        <section className="parent-dashboard-section">
          <div className="parent-section-head">
            <h2>Therapist Network</h2>
            <p>
              Explore all therapists registered with Pineda and select a card to
              view therapist details and location on the map.
            </p>
          </div>

          <div className="parent-map-card">
            <div className="parent-map-wrapper">
              <iframe
                title="Therapist Network Map"
                src={mapEmbedUrl}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            {allTherapists.length > 0 ? (
              <div className="parent-therapist-grid">
                {allTherapists.map((therapist) => (
                  <button
                    key={therapist.id}
                    type="button"
                    className={`parent-therapist-card ${
                      selectedTherapist?.id === therapist.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedTherapist(therapist)}
                  >
                    <div className="parent-therapist-card-top">
                      <img
                        src={therapist.imageUrl || thiliniImg}
                        alt={therapist.name || "Therapist"}
                        className="parent-therapist-image"
                      />

                      <div className="parent-therapist-content">
                        <h4>{therapist.name || "Therapist"}</h4>
                        <p>{therapist.specialization || "Speech Therapist"}</p>
                        <span>
                          <FaMapMarkerAlt /> {therapist.city || "Colombo"}
                        </span>
                      </div>
                    </div>

                    <div className="parent-therapist-meta">
                      <div className="parent-meta-chip">
                        {therapist.locationData?.placeName || "Location not added"}
                      </div>
                      <div className="parent-meta-subtext">
                        {therapist.locationData?.availableDays || "Days not set"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="parent-empty-note">
                No therapist locations found yet.
              </div>
            )}
          </div>
        </section>

        <section className="parent-dashboard-section">
          <div className="parent-section-head">
            <h2>About Pineda</h2>
            <p>
              Built with purpose to support children, families, and therapists
              through a more human-centered speech therapy experience.
            </p>
          </div>

          <div className="parent-about-card">
            <p>
              Pineda is an AI-supported speech therapy platform designed to make
              therapy interaction more engaging for children, more informative
              for parents, and more manageable for therapists. The platform
              combines progress visibility, therapist support, and child-friendly
              digital interaction to create a more connected therapy experience.
            </p>
          </div>

          <div className="parent-founders-grid">
            <div className="parent-founder-card">
              <img
                src={sahasImg}
                alt="Sahas Suraweera"
                className="parent-founder-image"
              />
              <div className="parent-founder-content">
                <span className="parent-founder-role">
                  Co-Founder & Project Lead
                </span>
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

            <div className="parent-founder-card">
              <img
                src={thiliniImg}
                alt="Thilini Piyumika"
                className="parent-founder-image"
              />
              <div className="parent-founder-content">
                <span className="parent-founder-role">
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
          className="parent-modal-overlay"
          onClick={() => setSelectedTherapist(null)}
        >
          <div
            className="parent-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="parent-modal-close"
              onClick={() => setSelectedTherapist(null)}
            >
              ✕
            </button>

            <div className="parent-modal-header">
              <img
                src={selectedTherapist.imageUrl || thiliniImg}
                alt={selectedTherapist.name || "Therapist"}
                className="parent-modal-image"
              />

              <div>
                <h2>{selectedTherapist.name || "Therapist"}</h2>
                <p className="parent-modal-role">
                  {selectedTherapist.specialization || "Speech Therapist"}
                </p>
                <p className="parent-modal-city">
                  <FaMapMarkerAlt /> {selectedTherapist.city || "City not set"}
                </p>
              </div>
            </div>

            <div className="parent-modal-body">
              <p>{selectedTherapist.description}</p>

              <div className="parent-modal-info-grid">
                <div className="parent-modal-info-item">
                  <FaPhoneAlt />
                  <span>{selectedTherapist.contact || "No contact available"}</span>
                </div>

                <div className="parent-modal-info-item">
                  <FaEnvelope />
                  <span>{selectedTherapist.email || "No email available"}</span>
                </div>

                <div className="parent-modal-info-item">
                  <FaClock />
                  <span>
                    {selectedTherapist.locationData?.availableDays || "Days not set"}
                  </span>
                </div>

                <div className="parent-modal-info-item">
                  <FaClock />
                  <span>
                    {selectedTherapist.locationData?.availableTime || "Time not set"}
                  </span>
                </div>
              </div>

              <div className="parent-modal-location-card">
                <h4>Primary Practice Location</h4>
                <p>
                  {selectedTherapist.locationData?.placeName || "Not specified"}
                </p>
                <p>
                  {selectedTherapist.locationData?.address || "No address available"}
                </p>
              </div>

              {selectedTherapist.locations?.length > 0 && (
                <div className="parent-all-locations">
                  <h4>All Uploaded Locations</h4>

                  <div className="parent-location-grid">
                    {selectedTherapist.locations.map((location) => (
                      <div className="parent-location-card" key={location.id}>
                        <div className="parent-location-head">
                          <h5>{location.placeName || "Unnamed Place"}</h5>
                          {location.isPrimary && (
                            <span className="parent-primary-badge">
                              Primary
                            </span>
                          )}
                        </div>

                        <p><strong>Address:</strong> {location.address || "N/A"}</p>
                        <p><strong>City:</strong> {location.city || "N/A"}</p>
                        <p><strong>Contact:</strong> {location.contactNumber || "N/A"}</p>
                        <p><strong>Days:</strong> {location.availableDays || "N/A"}</p>
                        <p><strong>Time:</strong> {location.availableTime || "N/A"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="parent-loading-overlay">
          <div className="parent-loading-card">Loading dashboard...</div>
        </div>
      )}
    </div>
  );
};

export default ParentDashboard;