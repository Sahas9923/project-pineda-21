import React, { useEffect, useState } from "react";
import TherapistNavbar from "../components/TherapistNavbar";
import "../styles/TherapistSettings.css";

import { auth, db, storage } from "../firebase/config";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const TherapistSettings = () => {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [message, setMessage] = useState("");

  const [therapistData, setTherapistData] = useState({
    name: "",
    email: "",
    therapistId: "",
    contact: "",
    slmcNumber: "",
    experience: "",
    specialization: "",
    imageUrl: "",
    availableOnline: false,
  });

  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState("");

  const [locations, setLocations] = useState([]);
  const [editingLocationId, setEditingLocationId] = useState(null);

  const [locationForm, setLocationForm] = useState({
    placeName: "",
    address: "",
    city: "",
    contactNumber: "",
    availableDays: "",
    availableTime: "",
    isPrimary: false,
  });

  useEffect(() => {
    fetchTherapistData();
  }, []);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  };

  const fetchTherapistData = async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) return;

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
          specialization: data.specialization || "",
          imageUrl: data.imageUrl || "",
          availableOnline: data.availableOnline || false,
        });

        setProfileImagePreview(data.imageUrl || "");
      }

      const locationSnapshot = await getDocs(
        collection(db, "therapists", user.uid, "locations")
      );

      const locationList = locationSnapshot.docs.map((locationDoc) => ({
        id: locationDoc.id,
        ...locationDoc.data(),
      }));

      setLocations(locationList);
    } catch (error) {
      console.error("Error fetching therapist data:", error);
      showMessage("❌ Failed to load therapist settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleProfileChange = (e) => {
    const { name, value, type, checked } = e.target;

    setTherapistData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleLocationChange = (e) => {
    const { name, value, type, checked } = e.target;

    setLocationForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setProfileImageFile(file);
    setProfileImagePreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();

    try {
      setSavingProfile(true);

      const user = auth.currentUser;
      if (!user) {
        showMessage("❌ User not found.");
        return;
      }

      let updatedImageUrl = therapistData.imageUrl || "";

      if (profileImageFile) {
        const fileName = `therapist-profile-${user.uid}-${Date.now()}`;
        const storageRef = ref(storage, `therapists/${user.uid}/${fileName}`);
        await uploadBytes(storageRef, profileImageFile);
        updatedImageUrl = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, "therapists", user.uid), {
        name: therapistData.name.trim(),
        email: therapistData.email.trim(),
        contact: therapistData.contact.trim(),
        slmcNumber: therapistData.slmcNumber.trim(),
        experience: therapistData.experience.trim(),
        specialization: therapistData.specialization.trim(),
        availableOnline: therapistData.availableOnline,
        imageUrl: updatedImageUrl,
      });

      await updateDoc(doc(db, "users", user.uid), {
        name: therapistData.name.trim(),
        email: therapistData.email.trim(),
      });

      setTherapistData((prev) => ({
        ...prev,
        imageUrl: updatedImageUrl,
      }));

      showMessage("✅ Therapist profile updated successfully.");
    } catch (error) {
      console.error("Error updating therapist profile:", error);
      showMessage("❌ Failed to update therapist profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const resetLocationForm = () => {
    setLocationForm({
      placeName: "",
      address: "",
      city: "",
      contactNumber: "",
      availableDays: "",
      availableTime: "",
      isPrimary: false,
    });
    setEditingLocationId(null);
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();

    try {
      setSavingLocation(true);

      const user = auth.currentUser;
      if (!user) {
        showMessage("❌ User not found.");
        return;
      }

      const locationPayload = {
        placeName: locationForm.placeName.trim(),
        address: locationForm.address.trim(),
        city: locationForm.city.trim(),
        contactNumber: locationForm.contactNumber.trim(),
        availableDays: locationForm.availableDays.trim(),
        availableTime: locationForm.availableTime.trim(),
        isPrimary: locationForm.isPrimary,
      };

      if (editingLocationId) {
        await updateDoc(
          doc(db, "therapists", user.uid, "locations", editingLocationId),
          locationPayload
        );
        showMessage("✅ Location updated successfully.");
      } else {
        await addDoc(
          collection(db, "therapists", user.uid, "locations"),
          locationPayload
        );
        showMessage("✅ Location added successfully.");
      }

      resetLocationForm();
      fetchTherapistData();
    } catch (error) {
      console.error("Error saving location:", error);
      showMessage("❌ Failed to save location.");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleEditLocation = (location) => {
    setEditingLocationId(location.id);
    setLocationForm({
      placeName: location.placeName || "",
      address: location.address || "",
      city: location.city || "",
      contactNumber: location.contactNumber || "",
      availableDays: location.availableDays || "",
      availableTime: location.availableTime || "",
      isPrimary: !!location.isPrimary,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteLocation = async (locationId) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      await deleteDoc(doc(db, "therapists", user.uid, "locations", locationId));
      showMessage("✅ Location deleted successfully.");

      if (editingLocationId === locationId) {
        resetLocationForm();
      }

      fetchTherapistData();
    } catch (error) {
      console.error("Error deleting location:", error);
      showMessage("❌ Failed to delete location.");
    }
  };

  return (
    <div className="therapist-settings-page">
      <TherapistNavbar />

      <div className="therapist-settings-container">
        <div className="settings-header">
          <h1>Therapist Settings</h1>
          <p>
            View and update your therapist profile, professional details, and
            practice locations.
          </p>
        </div>

        {message && <div className="settings-message">{message}</div>}

        {loading ? (
          <div className="settings-state-card">
            Loading therapist information...
          </div>
        ) : (
          <>
            <div className="settings-grid">
              <div className="settings-profile-card">
                <div className="profile-top">
                  {profileImagePreview ? (
                    <img
                      src={profileImagePreview}
                      alt="Therapist Profile"
                      className="settings-profile-image"
                    />
                  ) : (
                    <div className="settings-profile-placeholder">🧑‍⚕️</div>
                  )}

                  <div className="profile-top-text">
                    <h2>{therapistData.name || "Therapist Name"}</h2>
                    <p>{therapistData.email || "therapist@email.com"}</p>
                    <span>{therapistData.therapistId || "No Therapist ID"}</span>
                  </div>
                </div>

                <div className="quick-info-list">
                  <div className="quick-info-item">
                    <strong>Therapist ID</strong>
                    <span>{therapistData.therapistId || "N/A"}</span>
                  </div>

                  <div className="quick-info-item">
                    <strong>Contact</strong>
                    <span>{therapistData.contact || "Not added"}</span>
                  </div>

                  <div className="quick-info-item">
                    <strong>SLMC Number</strong>
                    <span>{therapistData.slmcNumber || "Not added"}</span>
                  </div>

                  <div className="quick-info-item">
                    <strong>Experience</strong>
                    <span>{therapistData.experience || "Not added"}</span>
                  </div>

                  <div className="quick-info-item">
                    <strong>Specialization</strong>
                    <span>{therapistData.specialization || "Not added"}</span>
                  </div>
                </div>
              </div>

              <div className="settings-form-card">
                <div className="card-head">
                  <h2>Update Account Information</h2>
                  <p>Edit therapist account information and save changes.</p>
                </div>

                <form className="settings-form" onSubmit={handleSaveProfile}>
                  <div className="form-grid">
                    <div className="input-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        name="name"
                        value={therapistData.name}
                        onChange={handleProfileChange}
                        placeholder="Enter full name"
                      />
                    </div>

                    <div className="input-group">
                      <label>Email Address</label>
                      <input
                        type="email"
                        name="email"
                        value={therapistData.email}
                        onChange={handleProfileChange}
                        placeholder="Enter email"
                      />
                    </div>

                    <div className="input-group">
                      <label>Therapist ID</label>
                      <input
                        type="text"
                        value={therapistData.therapistId}
                        disabled
                      />
                    </div>

                    <div className="input-group">
                      <label>Contact Number</label>
                      <input
                        type="text"
                        name="contact"
                        value={therapistData.contact}
                        onChange={handleProfileChange}
                        placeholder="Enter contact number"
                      />
                    </div>

                    <div className="input-group">
                      <label>SLMC Number</label>
                      <input
                        type="text"
                        name="slmcNumber"
                        value={therapistData.slmcNumber}
                        onChange={handleProfileChange}
                        placeholder="Enter SLMC number"
                      />
                    </div>

                    <div className="input-group">
                      <label>Experience</label>
                      <input
                        type="text"
                        name="experience"
                        value={therapistData.experience}
                        onChange={handleProfileChange}
                        placeholder="Enter experience"
                      />
                    </div>

                    <div className="input-group full-width">
                      <label>Specialization</label>
                      <input
                        type="text"
                        name="specialization"
                        value={therapistData.specialization}
                        onChange={handleProfileChange}
                        placeholder="Enter specialization"
                      />
                    </div>

                    <div className="input-group full-width">
                      <label className="upload-label" htmlFor="therapistImageUpload">
                        Change Profile Image
                      </label>
                      <input
                        id="therapistImageUpload"
                        type="file"
                        accept="image/*"
                        onChange={handleProfileImageChange}
                        className="hidden-file-input"
                      />
                    </div>

                    <div className="input-group full-width">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="availableOnline"
                          checked={therapistData.availableOnline}
                          onChange={handleProfileChange}
                        />
                        Available for online sessions
                      </label>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="save-btn"
                      disabled={savingProfile}
                    >
                      {savingProfile ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="settings-card">
              <div className="card-head">
                <h2>{editingLocationId ? "Edit Location" : "Add Location"}</h2>
                <p>
                  {editingLocationId
                    ? "Update your selected practice location."
                    : "Add a new clinic or working location."}
                </p>
              </div>

              <form className="settings-form" onSubmit={handleSaveLocation}>
                <div className="form-grid">
                  <div className="input-group">
                    <label>Place Name</label>
                    <input
                      type="text"
                      name="placeName"
                      value={locationForm.placeName}
                      onChange={handleLocationChange}
                      placeholder="Enter place name"
                    />
                  </div>

                  <div className="input-group">
                    <label>City</label>
                    <input
                      type="text"
                      name="city"
                      value={locationForm.city}
                      onChange={handleLocationChange}
                      placeholder="Enter city"
                    />
                  </div>

                  <div className="input-group full-width">
                    <label>Address</label>
                    <input
                      type="text"
                      name="address"
                      value={locationForm.address}
                      onChange={handleLocationChange}
                      placeholder="Enter address"
                    />
                  </div>

                  <div className="input-group">
                    <label>Contact Number</label>
                    <input
                      type="text"
                      name="contactNumber"
                      value={locationForm.contactNumber}
                      onChange={handleLocationChange}
                      placeholder="Enter contact number"
                    />
                  </div>

                  <div className="input-group">
                    <label>Available Days</label>
                    <input
                      type="text"
                      name="availableDays"
                      value={locationForm.availableDays}
                      onChange={handleLocationChange}
                      placeholder="Example: Mon, Wed, Fri"
                    />
                  </div>

                  <div className="input-group">
                    <label>Available Time</label>
                    <input
                      type="text"
                      name="availableTime"
                      value={locationForm.availableTime}
                      onChange={handleLocationChange}
                      placeholder="Example: 9.00 AM - 5.00 PM"
                    />
                  </div>

                  <div className="input-group full-width">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="isPrimary"
                        checked={locationForm.isPrimary}
                        onChange={handleLocationChange}
                      />
                      Mark this as primary location
                    </label>
                  </div>
                </div>

                <div className="form-actions multi-actions">
                  {editingLocationId && (
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={resetLocationForm}
                    >
                      Cancel Edit
                    </button>
                  )}

                  <button
                    type="submit"
                    className="save-btn"
                    disabled={savingLocation}
                  >
                    {savingLocation
                      ? "Saving..."
                      : editingLocationId
                      ? "Update Location"
                      : "Save Location"}
                  </button>
                </div>
              </form>
            </div>

            <div className="settings-card">
              <div className="card-head">
                <h2>Saved Locations</h2>
                <p>Manage your practice locations here.</p>
              </div>

              {locations.length === 0 ? (
                <p className="empty-text">No locations added yet.</p>
              ) : (
                <div className="locations-list">
                  {locations.map((location) => (
                    <div className="location-item" key={location.id}>
                      <div className="location-top">
                        <h3>
                          {location.placeName || "Unnamed Place"}
                          {location.isPrimary && (
                            <span className="primary-badge">Primary</span>
                          )}
                        </h3>
                      </div>

                      <div className="location-details-grid">
                        <p><strong>Address:</strong> {location.address || "N/A"}</p>
                        <p><strong>City:</strong> {location.city || "N/A"}</p>
                        <p><strong>Contact:</strong> {location.contactNumber || "N/A"}</p>
                        <p><strong>Days:</strong> {location.availableDays || "N/A"}</p>
                        <p><strong>Time:</strong> {location.availableTime || "N/A"}</p>
                      </div>

                      <div className="location-actions">
                        <button
                          className="edit-btn"
                          onClick={() => handleEditLocation(location)}
                        >
                          Edit
                        </button>

                        <button
                          className="delete-btn"
                          onClick={() => handleDeleteLocation(location.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TherapistSettings;