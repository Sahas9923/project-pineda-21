import React, { useEffect, useState } from "react";
import TherapistNavbar from "../components/TherapistNavbar";
import "../styles/TherapistSettings.css";

import { auth, db, storage } from "../firebase/config";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const TherapistSettings = () => {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  const [therapistData, setTherapistData] = useState({
    name: "",
    email: "",
    therapistId: "",
    contact: "",
    slmcNumber: "",
    experience: "",
    imageUrl: "",
  });

  const [locations, setLocations] = useState([]);

  const [selectedImage, setSelectedImage] = useState(null);
  const [previewImage, setPreviewImage] = useState("");

  const [locationForm, setLocationForm] = useState({
    locationName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    district: "",
    isPrimary: false,
  });

  useEffect(() => {
    const fetchTherapistData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setLoading(false);
          return;
        }

        const therapistRef = doc(db, "therapists", user.uid);
        const therapistSnap = await getDoc(therapistRef);

        if (therapistSnap.exists()) {
          const data = therapistSnap.data();

          setTherapistData({
            name: data.name || "",
            email: data.email || user.email || "",
            therapistId: data.therapistId || "",
            contact: data.contact || "",
            slmcNumber: data.slmcNumber || "",
            experience: data.experience || "",
            imageUrl: data.imageUrl || "",
          });

          setPreviewImage(data.imageUrl || "");
        }

        const locationsRef = collection(db, "therapists", user.uid, "locations");
        const q = query(locationsRef, orderBy("createdAt", "desc"));
        const locationSnap = await getDocs(q);

        const locationList = locationSnap.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setLocations(locationList);
      } catch (error) {
        console.error("Error fetching therapist settings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTherapistData();
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setTherapistData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLocationChange = (e) => {
    const { name, value, type, checked } = e.target;
    setLocationForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedImage(file);
    setPreviewImage(URL.createObjectURL(file));
  };

  const refreshLocations = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const locationsRef = collection(db, "therapists", user.uid, "locations");
      const q = query(locationsRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);

      const list = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      setLocations(list);
    } catch (error) {
      console.error("Error refreshing locations:", error);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();

    try {
      setSavingProfile(true);

      const user = auth.currentUser;
      if (!user) {
        alert("❌ No authenticated user found.");
        return;
      }

      let imageUrl = therapistData.imageUrl || "";

      if (selectedImage) {
        const imageRef = ref(storage, `therapistProfiles/${user.uid}`);
        await uploadBytes(imageRef, selectedImage);
        imageUrl = await getDownloadURL(imageRef);
      }

      const therapistRef = doc(db, "therapists", user.uid);

      await updateDoc(therapistRef, {
        contact: therapistData.contact,
        slmcNumber: therapistData.slmcNumber,
        experience: therapistData.experience,
        imageUrl: imageUrl,
        updatedAt: serverTimestamp(),
      });

      setTherapistData((prev) => ({
        ...prev,
        imageUrl,
      }));

      setPreviewImage(imageUrl);
      setSelectedImage(null);

      alert("✅ Therapist profile updated successfully!");
    } catch (error) {
      console.error("Error updating therapist profile:", error);
      alert("❌ Failed to update therapist profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();

    try {
      setSavingLocation(true);

      const user = auth.currentUser;
      if (!user) {
        alert("❌ No authenticated user found.");
        return;
      }

      if (!locationForm.locationName.trim() || !locationForm.city.trim()) {
        alert("❌ Please enter at least location name and city.");
        return;
      }

      const locationsRef = collection(db, "therapists", user.uid, "locations");

      await addDoc(locationsRef, {
        therapistId: therapistData.therapistId || "",
        locationName: locationForm.locationName.trim(),
        addressLine1: locationForm.addressLine1.trim(),
        addressLine2: locationForm.addressLine2.trim(),
        city: locationForm.city.trim(),
        district: locationForm.district.trim(),
        isPrimary: locationForm.isPrimary,
        createdAt: serverTimestamp(),
      });

      setLocationForm({
        locationName: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        district: "",
        isPrimary: false,
      });

      await refreshLocations();
      alert("✅ Location added successfully!");
    } catch (error) {
      console.error("Error adding location:", error);
      alert("❌ Failed to add location.");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeleteLocation = async (locationId) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      await deleteDoc(doc(db, "therapists", user.uid, "locations", locationId));
      await refreshLocations();

      alert("✅ Location removed successfully!");
    } catch (error) {
      console.error("Error deleting location:", error);
      alert("❌ Failed to remove location.");
    }
  };

  if (loading) {
    return (
      <div className="therapist-settings-page">
        <TherapistNavbar />
        <div className="therapist-settings-container">
          <h2>Loading settings...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="therapist-settings-page">
      <TherapistNavbar />

      <div className="therapist-settings-container">
        <div className="settings-header">
          <h1>⚙️ Therapist Settings</h1>
          <p>Update your profile and manage multiple work locations</p>
        </div>

        <form className="settings-card" onSubmit={handleSaveProfile}>
          <h2 className="section-title">Profile Details</h2>

          <div className="image-section">
            <div className="image-wrapper">
              {previewImage ? (
                <img
                  src={previewImage}
                  alt="Therapist Profile"
                  className="profile-image"
                />
              ) : (
                <div className="image-placeholder">👤</div>
              )}
            </div>

            <div className="image-upload-box">
              <label className="upload-label">Upload Profile Image</label>
              <input type="file" accept="image/*" onChange={handleImageChange} />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" value={therapistData.name} disabled />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input type="email" value={therapistData.email} disabled />
            </div>

            <div className="form-group">
              <label>Therapist ID</label>
              <input type="text" value={therapistData.therapistId} disabled />
            </div>

            <div className="form-group">
              <label>Contact Number</label>
              <input
                type="text"
                name="contact"
                placeholder="Enter contact number"
                value={therapistData.contact}
                onChange={handleProfileChange}
              />
            </div>

            <div className="form-group">
              <label>SLMC Number</label>
              <input
                type="text"
                name="slmcNumber"
                placeholder="Enter SLMC number"
                value={therapistData.slmcNumber}
                onChange={handleProfileChange}
              />
            </div>

            <div className="form-group full-width">
              <label>Experience</label>
              <input
                type="text"
                name="experience"
                placeholder="e.g. 5 years in speech therapy"
                value={therapistData.experience}
                onChange={handleProfileChange}
              />
            </div>
          </div>

          <button type="submit" className="save-btn" disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </form>

        <form className="settings-card location-card" onSubmit={handleAddLocation}>
          <h2 className="section-title">Add Location</h2>

          <div className="form-grid">
            <div className="form-group">
              <label>Location Name</label>
              <input
                type="text"
                name="locationName"
                placeholder="e.g. Colombo Branch"
                value={locationForm.locationName}
                onChange={handleLocationChange}
              />
            </div>

            <div className="form-group">
              <label>City</label>
              <input
                type="text"
                name="city"
                placeholder="Enter city"
                value={locationForm.city}
                onChange={handleLocationChange}
              />
            </div>

            <div className="form-group">
              <label>Address Line 1</label>
              <input
                type="text"
                name="addressLine1"
                placeholder="Street / Building"
                value={locationForm.addressLine1}
                onChange={handleLocationChange}
              />
            </div>

            <div className="form-group">
              <label>Address Line 2</label>
              <input
                type="text"
                name="addressLine2"
                placeholder="Area / Landmark"
                value={locationForm.addressLine2}
                onChange={handleLocationChange}
              />
            </div>

            <div className="form-group">
              <label>District</label>
              <input
                type="text"
                name="district"
                placeholder="Enter district"
                value={locationForm.district}
                onChange={handleLocationChange}
              />
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="isPrimary"
                  checked={locationForm.isPrimary}
                  onChange={handleLocationChange}
                />
                Mark as Primary Location
              </label>
            </div>
          </div>

          <button type="submit" className="save-btn" disabled={savingLocation}>
            {savingLocation ? "Adding..." : "Add Location"}
          </button>
        </form>

        <div className="settings-card">
          <h2 className="section-title">Saved Locations</h2>

          {locations.length === 0 ? (
            <p className="empty-text">No locations added yet.</p>
          ) : (
            <div className="locations-list">
              {locations.map((location) => (
                <div className="location-item" key={location.id}>
                  <div className="location-info">
                    <h3>
                      {location.locationName}
                      {location.isPrimary && (
                        <span className="primary-badge">Primary</span>
                      )}
                    </h3>
                    <p><strong>City:</strong> {location.city || "-"}</p>
                    <p><strong>District:</strong> {location.district || "-"}</p>
                    <p><strong>Address 1:</strong> {location.addressLine1 || "-"}</p>
                    <p><strong>Address 2:</strong> {location.addressLine2 || "-"}</p>
                    <p><strong>Therapist ID:</strong> {location.therapistId || "-"}</p>
                  </div>

                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteLocation(location.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TherapistSettings;