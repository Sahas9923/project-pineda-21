import React, { useEffect, useState } from "react";
import ParentNavbar from "../components/ParentNavbar";
import "../styles/ParentSettings.css";

import { auth, db, storage } from "../firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const ParentSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    parentId: "",
    contact: "",
    address: "",
    imageUrl: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    fetchParentData();
  }, []);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  };

  const fetchParentData = async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) {
        showMessage("❌ No logged in user found.");
        return;
      }

      const parentRef = doc(db, "parents", user.uid);
      const parentSnap = await getDoc(parentRef);

      if (parentSnap.exists()) {
        const data = parentSnap.data();

        setFormData({
          name: data.name || "",
          email: data.email || user.email || "",
          parentId: data.parentId || "",
          contact: data.contact || "",
          address: data.address || "",
          imageUrl: data.imageUrl || "",
        });

        setImagePreview(data.imageUrl || "");
      } else {
        setFormData({
          name: "",
          email: user.email || "",
          parentId: "",
          contact: "",
          address: "",
          imageUrl: "",
        });
      }
    } catch (error) {
      console.error("Error fetching parent settings:", error);
      showMessage("❌ Failed to load parent information.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);

      const user = auth.currentUser;
      if (!user) {
        showMessage("❌ User not found.");
        return;
      }

      let updatedImageUrl = formData.imageUrl || "";

      if (imageFile) {
        const fileName = `parent-profile-${user.uid}-${Date.now()}`;
        const storageRef = ref(storage, `parents/${user.uid}/${fileName}`);
        await uploadBytes(storageRef, imageFile);
        updatedImageUrl = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, "parents", user.uid), {
        name: formData.name.trim(),
        email: formData.email.trim(),
        contact: formData.contact.trim(),
        address: formData.address.trim(),
        imageUrl: updatedImageUrl,
      });

      await updateDoc(doc(db, "users", user.uid), {
        name: formData.name.trim(),
        email: formData.email.trim(),
      });

      const childrenQuery = query(
        collection(db, "children"),
        where("parentUid", "==", user.uid)
      );

      const childrenSnap = await getDocs(childrenQuery);

      for (const childDoc of childrenSnap.docs) {
        await updateDoc(doc(db, "children", childDoc.id), {
          parentName: formData.name.trim(),
          parentEmail: formData.email.trim(),
          parentContact: formData.contact.trim(),
        });
      }

      setFormData((prev) => ({
        ...prev,
        imageUrl: updatedImageUrl,
      }));

      showMessage("✅ Parent account updated successfully.");
    } catch (error) {
      console.error("Error updating parent settings:", error);
      showMessage("❌ Failed to update account information.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="parent-settings-page">
      <ParentNavbar />

      <div className="parent-settings-container">
        <div className="settings-header">
          <div>
            <h1>Parent Settings</h1>
            <p>
              View and update your parent account information, contact details,
              and profile image.
            </p>
          </div>
        </div>

        {message && <div className="settings-message">{message}</div>}

        {loading ? (
          <div className="settings-state-card">Loading parent information...</div>
        ) : (
          <div className="settings-grid">
            <div className="settings-profile-card">
              <div className="profile-top">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Parent Profile"
                    className="settings-profile-image"
                  />
                ) : (
                  <div className="settings-profile-placeholder">👤</div>
                )}

                <div className="profile-top-text">
                  <h2>{formData.name || "Parent Name"}</h2>
                  <p>{formData.email || "parent@email.com"}</p>
                  <span>{formData.parentId || "No Parent ID"}</span>
                </div>
              </div>

              <div className="quick-info-list">
                <div className="quick-info-item">
                  <strong>Parent ID</strong>
                  <span>{formData.parentId || "N/A"}</span>
                </div>

                <div className="quick-info-item">
                  <strong>Contact</strong>
                  <span>{formData.contact || "Not added"}</span>
                </div>

                <div className="quick-info-item">
                  <strong>Address</strong>
                  <span>{formData.address || "Not added"}</span>
                </div>
              </div>
            </div>

            <div className="settings-form-card">
              <div className="card-head">
                <h2>Update Account Information</h2>
                <p>Edit the details below and save changes.</p>
              </div>

              <form className="settings-form" onSubmit={handleUpdate}>
                <div className="form-grid">
                  <div className="input-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Enter full name"
                    />
                  </div>

                  <div className="input-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="Enter email"
                    />
                  </div>

                  <div className="input-group">
                    <label>Parent ID</label>
                    <input
                      type="text"
                      name="parentId"
                      value={formData.parentId}
                      disabled
                      placeholder="Parent ID"
                    />
                  </div>

                  <div className="input-group">
                    <label>Contact Number</label>
                    <input
                      type="text"
                      name="contact"
                      value={formData.contact}
                      onChange={handleChange}
                      placeholder="Enter contact number"
                    />
                  </div>
                </div>

                <div className="input-group full-width">
                  <label>Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Enter address"
                    rows="4"
                  />
                </div>

                <div className="input-group full-width">
                  <label className="upload-label" htmlFor="parentImageUpload">
                    Change Profile Image
                  </label>
                  <input
                    id="parentImageUpload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden-file-input"
                  />
                </div>

                <div className="form-actions">
                  <button
                    type="submit"
                    className="save-btn"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentSettings;