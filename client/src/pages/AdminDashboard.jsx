import React, { useEffect, useMemo, useState } from "react";
import "../styles/AdminDashboard.css";
import { db, storage } from "../firebase/config";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "autism", label: "Autism" },
  { value: "down_syndrome", label: "Down Syndrome" },
];

const ITEM_TYPE_OPTIONS = [
  { value: "sound", label: "Sound" },
  { value: "word", label: "Word" },
  { value: "sentence", label: "Sentence" },
  { value: "advanced", label: "Advanced" },
];

const VISUAL_TYPE_OPTIONS = [
  { value: "image", label: "Image" },
  { value: "gif", label: "GIF" },
  { value: "video", label: "Video" },
];

const AdminDashboard = () => {
  const [message, setMessage] = useState("");
  const [levels, setLevels] = useState([]);
  const [items, setItems] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState("general");
  const [selectedLevelId, setSelectedLevelId] = useState("");

  const [loadingLevels, setLoadingLevels] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [savingLevel, setSavingLevel] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [updatingLevel, setUpdatingLevel] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(false);
  const [deletingLevelId, setDeletingLevelId] = useState("");
  const [deletingItemId, setDeletingItemId] = useState("");

  const [levelTitle, setLevelTitle] = useState("");
  const [levelDescription, setLevelDescription] = useState("");
  const [levelStage, setLevelStage] = useState("1");

  const [editingLevelId, setEditingLevelId] = useState("");
  const [editLevelTitle, setEditLevelTitle] = useState("");
  const [editLevelDescription, setEditLevelDescription] = useState("");
  const [editLevelStage, setEditLevelStage] = useState("1");

  const [itemText, setItemText] = useState("");
  const [itemType, setItemType] = useState("sound");
  const [visualType, setVisualType] = useState("image");
  const [audioFile, setAudioFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [gifFile, setGifFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);

  const [editingItemId, setEditingItemId] = useState("");
  const [editItemText, setEditItemText] = useState("");
  const [editItemType, setEditItemType] = useState("sound");
  const [editVisualType, setEditVisualType] = useState("image");
  const [editAudioFile, setEditAudioFile] = useState(null);
  const [editImageFile, setEditImageFile] = useState(null);
  const [editGifFile, setEditGifFile] = useState(null);
  const [editVideoFile, setEditVideoFile] = useState(null);

  useEffect(() => {
    fetchLevels();
  }, []);

  useEffect(() => {
    if (selectedLevelId) {
      fetchItems(selectedLevelId);
    } else {
      setItems([]);
    }
  }, [selectedLevelId]);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  };

  const filteredLevels = useMemo(() => {
    return levels
      .filter((level) => level.category === selectedCategory)
      .sort((a, b) => Number(a.stage || 0) - Number(b.stage || 0));
  }, [levels, selectedCategory]);

  useEffect(() => {
    if (filteredLevels.length === 0) {
      setSelectedLevelId("");
      return;
    }

    const exists = filteredLevels.some((level) => level.id === selectedLevelId);
    if (!exists) {
      setSelectedLevelId(filteredLevels[0].id);
    }
  }, [filteredLevels, selectedLevelId]);

  const selectedLevel = useMemo(() => {
    return filteredLevels.find((level) => level.id === selectedLevelId) || null;
  }, [filteredLevels, selectedLevelId]);

  const fetchLevels = async () => {
    try {
      setLoadingLevels(true);
      const q = query(collection(db, "levels"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);

      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      setLevels(list);
    } catch (error) {
      console.error("Error fetching levels:", error);
      showMessage("❌ Failed to load levels.");
    } finally {
      setLoadingLevels(false);
    }
  };

  const fetchItems = async (levelId) => {
    try {
      setLoadingItems(true);

      const q = query(
        collection(db, "levels", levelId, "items"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);

      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      setItems(list);
    } catch (error) {
      console.error("Error fetching items:", error);
      showMessage("❌ Failed to load items.");
    } finally {
      setLoadingItems(false);
    }
  };

  const uploadSingleFile = async (file, folderPath) => {
    if (!file) return { url: "", path: "" };

    const safeName = `${Date.now()}-${file.name}`;
    const storageRef = ref(storage, `${folderPath}/${safeName}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    return {
      url,
      path: storageRef.fullPath,
    };
  };

  const deleteStorageFileIfExists = async (path) => {
    if (!path) return;
    try {
      await deleteObject(ref(storage, path));
    } catch (error) {
      console.warn("Delete skipped:", error);
    }
  };

  const deleteItemMedia = async (item) => {
    await deleteStorageFileIfExists(item.audioStoragePath);
    await deleteStorageFileIfExists(item.imageStoragePath);
    await deleteStorageFileIfExists(item.gifStoragePath);
    await deleteStorageFileIfExists(item.videoStoragePath);
  };

  const resetAddItemFiles = () => {
    setAudioFile(null);
    setImageFile(null);
    setGifFile(null);
    setVideoFile(null);

    const ids = ["audioUpload", "imageUpload", "gifUpload", "videoUpload"];
    ids.forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
  };

  const resetEditItemFiles = () => {
    setEditAudioFile(null);
    setEditImageFile(null);
    setEditGifFile(null);
    setEditVideoFile(null);
  };

  const handleAddLevel = async (e) => {
    e.preventDefault();

    if (!levelTitle.trim() || !levelDescription.trim()) {
      showMessage("❌ Please enter level title and description.");
      return;
    }

    const parsedStage = Number(levelStage);
    if (Number.isNaN(parsedStage) || parsedStage < 1) {
      showMessage("❌ Please enter a valid stage.");
      return;
    }

    try {
      setSavingLevel(true);

      const docRef = await addDoc(collection(db, "levels"), {
        title: levelTitle.trim(),
        description: levelDescription.trim(),
        category: selectedCategory,
        stage: parsedStage,
        createdAt: serverTimestamp(),
      });

      setLevelTitle("");
      setLevelDescription("");
      setLevelStage("1");

      await fetchLevels();
      setSelectedLevelId(docRef.id);
      showMessage("✅ Level added successfully.");
    } catch (error) {
      console.error("Error adding level:", error);
      showMessage("❌ Failed to add level.");
    } finally {
      setSavingLevel(false);
    }
  };

  const handleStartEditLevel = (level) => {
    setEditingLevelId(level.id);
    setEditLevelTitle(level.title || "");
    setEditLevelDescription(level.description || "");
    setEditLevelStage(String(level.stage || 1));
  };

  const cancelEditLevel = () => {
    setEditingLevelId("");
    setEditLevelTitle("");
    setEditLevelDescription("");
    setEditLevelStage("1");
  };

  const handleUpdateLevel = async (e) => {
    e.preventDefault();

    if (!editLevelTitle.trim() || !editLevelDescription.trim()) {
      showMessage("❌ Please fill all level fields.");
      return;
    }

    const parsedStage = Number(editLevelStage);
    if (Number.isNaN(parsedStage) || parsedStage < 1) {
      showMessage("❌ Please enter a valid stage.");
      return;
    }

    try {
      setUpdatingLevel(true);

      await updateDoc(doc(db, "levels", editingLevelId), {
        title: editLevelTitle.trim(),
        description: editLevelDescription.trim(),
        stage: parsedStage,
        category: selectedCategory,
      });

      cancelEditLevel();
      await fetchLevels();
      showMessage("✅ Level updated successfully.");
    } catch (error) {
      console.error("Error updating level:", error);
      showMessage("❌ Failed to update level.");
    } finally {
      setUpdatingLevel(false);
    }
  };

  const handleDeleteLevel = async (levelId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this level and all its items?"
    );
    if (!confirmed) return;

    try {
      setDeletingLevelId(levelId);

      const itemsSnapshot = await getDocs(collection(db, "levels", levelId, "items"));

      for (const itemDoc of itemsSnapshot.docs) {
        const itemData = itemDoc.data();
        await deleteItemMedia(itemData);
        await deleteDoc(doc(db, "levels", levelId, "items", itemDoc.id));
      }

      await deleteDoc(doc(db, "levels", levelId));

      if (editingLevelId === levelId) {
        cancelEditLevel();
      }

      await fetchLevels();
      showMessage("✅ Level deleted successfully.");
    } catch (error) {
      console.error("Error deleting level:", error);
      showMessage("❌ Failed to delete level.");
    } finally {
      setDeletingLevelId("");
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();

    if (!selectedLevelId) {
      showMessage("❌ Please select a level.");
      return;
    }

    if (!itemText.trim()) {
      showMessage("❌ Please enter item text.");
      return;
    }

    if (!audioFile) {
      showMessage("❌ Please upload an MP3 file.");
      return;
    }

    if (visualType === "image" && !imageFile) {
      showMessage("❌ Please upload an image.");
      return;
    }

    if (visualType === "gif" && !gifFile) {
      showMessage("❌ Please upload a GIF.");
      return;
    }

    if (visualType === "video" && !videoFile) {
      showMessage("❌ Please upload a video.");
      return;
    }

    try {
      setSavingItem(true);

      const baseFolder = `speech-items/${selectedCategory}/${selectedLevelId}`;

      const audioUpload = await uploadSingleFile(audioFile, `${baseFolder}/audio`);

      let imageUpload = { url: "", path: "" };
      let gifUpload = { url: "", path: "" };
      let videoUpload = { url: "", path: "" };

      if (visualType === "image") {
        imageUpload = await uploadSingleFile(imageFile, `${baseFolder}/images`);
      }

      if (visualType === "gif") {
        gifUpload = await uploadSingleFile(gifFile, `${baseFolder}/gifs`);
      }

      if (visualType === "video") {
        videoUpload = await uploadSingleFile(videoFile, `${baseFolder}/videos`);
      }

      await addDoc(collection(db, "levels", selectedLevelId, "items"), {
        text: itemText.trim(),
        type: itemType,
        visualType,
        audioUrl: audioUpload.url,
        audioStoragePath: audioUpload.path,
        imageUrl: imageUpload.url,
        imageStoragePath: imageUpload.path,
        gifUrl: gifUpload.url,
        gifStoragePath: gifUpload.path,
        videoUrl: videoUpload.url,
        videoStoragePath: videoUpload.path,
        category: selectedCategory,
        levelId: selectedLevelId,
        levelTitle: selectedLevel?.title || "",
        createdAt: serverTimestamp(),
      });

      setItemText("");
      setItemType("sound");
      setVisualType("image");
      resetAddItemFiles();

      await fetchItems(selectedLevelId);
      showMessage("✅ Item added successfully.");
    } catch (error) {
      console.error("Error adding item:", error);
      showMessage("❌ Failed to add item.");
    } finally {
      setSavingItem(false);
    }
  };

  const handleStartEditItem = (item) => {
    setEditingItemId(item.id);
    setEditItemText(item.text || "");
    setEditItemType(item.type || "sound");
    setEditVisualType(item.visualType || "image");
    resetEditItemFiles();
  };

  const cancelEditItem = () => {
    setEditingItemId("");
    setEditItemText("");
    setEditItemType("sound");
    setEditVisualType("image");
    resetEditItemFiles();
  };

  const handleUpdateItem = async (e, item) => {
    e.preventDefault();

    if (!editItemText.trim()) {
      showMessage("❌ Please enter item text.");
      return;
    }

    try {
      setUpdatingItem(true);

      const updateData = {
        text: editItemText.trim(),
        type: editItemType,
        visualType: editVisualType,
      };

      const baseFolder = `speech-items/${selectedCategory}/${selectedLevelId}`;

      if (editAudioFile) {
        await deleteStorageFileIfExists(item.audioStoragePath);
        const uploadedAudio = await uploadSingleFile(
          editAudioFile,
          `${baseFolder}/audio`
        );
        updateData.audioUrl = uploadedAudio.url;
        updateData.audioStoragePath = uploadedAudio.path;
      } else if (!item.audioUrl) {
        showMessage("❌ Please upload an MP3 file.");
        setUpdatingItem(false);
        return;
      }

      if (editVisualType === "image") {
        if (editImageFile) {
          await deleteStorageFileIfExists(item.imageStoragePath);
          await deleteStorageFileIfExists(item.gifStoragePath);
          await deleteStorageFileIfExists(item.videoStoragePath);

          const uploaded = await uploadSingleFile(
            editImageFile,
            `${baseFolder}/images`
          );

          updateData.imageUrl = uploaded.url;
          updateData.imageStoragePath = uploaded.path;
          updateData.gifUrl = "";
          updateData.gifStoragePath = "";
          updateData.videoUrl = "";
          updateData.videoStoragePath = "";
        } else if (!item.imageUrl && item.visualType !== "image") {
          showMessage("❌ Please upload an image.");
          setUpdatingItem(false);
          return;
        } else {
          updateData.imageUrl = item.visualType === "image" ? item.imageUrl || "" : "";
          updateData.imageStoragePath =
            item.visualType === "image" ? item.imageStoragePath || "" : "";
          updateData.gifUrl = "";
          updateData.gifStoragePath = "";
          updateData.videoUrl = "";
          updateData.videoStoragePath = "";
        }
      }

      if (editVisualType === "gif") {
        if (editGifFile) {
          await deleteStorageFileIfExists(item.imageStoragePath);
          await deleteStorageFileIfExists(item.gifStoragePath);
          await deleteStorageFileIfExists(item.videoStoragePath);

          const uploaded = await uploadSingleFile(editGifFile, `${baseFolder}/gifs`);

          updateData.imageUrl = "";
          updateData.imageStoragePath = "";
          updateData.gifUrl = uploaded.url;
          updateData.gifStoragePath = uploaded.path;
          updateData.videoUrl = "";
          updateData.videoStoragePath = "";
        } else if (!item.gifUrl && item.visualType !== "gif") {
          showMessage("❌ Please upload a GIF.");
          setUpdatingItem(false);
          return;
        } else {
          updateData.imageUrl = "";
          updateData.imageStoragePath = "";
          updateData.gifUrl = item.visualType === "gif" ? item.gifUrl || "" : "";
          updateData.gifStoragePath =
            item.visualType === "gif" ? item.gifStoragePath || "" : "";
          updateData.videoUrl = "";
          updateData.videoStoragePath = "";
        }
      }

      if (editVisualType === "video") {
        if (editVideoFile) {
          await deleteStorageFileIfExists(item.imageStoragePath);
          await deleteStorageFileIfExists(item.gifStoragePath);
          await deleteStorageFileIfExists(item.videoStoragePath);

          const uploaded = await uploadSingleFile(
            editVideoFile,
            `${baseFolder}/videos`
          );

          updateData.imageUrl = "";
          updateData.imageStoragePath = "";
          updateData.gifUrl = "";
          updateData.gifStoragePath = "";
          updateData.videoUrl = uploaded.url;
          updateData.videoStoragePath = uploaded.path;
        } else if (!item.videoUrl && item.visualType !== "video") {
          showMessage("❌ Please upload a video.");
          setUpdatingItem(false);
          return;
        } else {
          updateData.imageUrl = "";
          updateData.imageStoragePath = "";
          updateData.gifUrl = "";
          updateData.gifStoragePath = "";
          updateData.videoUrl = item.visualType === "video" ? item.videoUrl || "" : "";
          updateData.videoStoragePath =
            item.visualType === "video" ? item.videoStoragePath || "" : "";
        }
      }

      await updateDoc(
        doc(db, "levels", selectedLevelId, "items", item.id),
        updateData
      );

      cancelEditItem();
      await fetchItems(selectedLevelId);
      showMessage("✅ Item updated successfully.");
    } catch (error) {
      console.error("Error updating item:", error);
      showMessage("❌ Failed to update item.");
    } finally {
      setUpdatingItem(false);
    }
  };

  const handleDeleteItem = async (item) => {
    const confirmed = window.confirm("Are you sure you want to delete this item?");
    if (!confirmed) return;

    try {
      setDeletingItemId(item.id);
      await deleteItemMedia(item);
      await deleteDoc(doc(db, "levels", selectedLevelId, "items", item.id));
      await fetchItems(selectedLevelId);
      showMessage("✅ Item deleted successfully.");
    } catch (error) {
      console.error("Error deleting item:", error);
      showMessage("❌ Failed to delete item.");
    } finally {
      setDeletingItemId("");
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-shell">
        {message && <div className="message-box">{message}</div>}

        <section className="category-strip admin-card">
          <div className="card-heading">
            <h2>Select Category</h2>
          </div>

          <div className="category-button-row">
            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`secondary-btn ${
                  selectedCategory === option.value ? "active-filter-btn" : ""
                }`}
                onClick={() => setSelectedCategory(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="top-grid">
          <div className="admin-card">
            <div className="card-heading">
              <h2>Add Level</h2>
            </div>

            <form onSubmit={handleAddLevel} className="admin-form">
              <div className="form-group">
                <label>Level Title</label>
                <input
                  type="text"
                  placeholder="Enter level title"
                  value={levelTitle}
                  onChange={(e) => setLevelTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Level Description</label>
                <textarea
                  placeholder="Enter level description"
                  value={levelDescription}
                  onChange={(e) => setLevelDescription(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Stage / Level Order</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={levelStage}
                  onChange={(e) => setLevelStage(e.target.value)}
                />
              </div>

              <button className="primary-btn" type="submit" disabled={savingLevel}>
                {savingLevel ? "Adding..." : "Add Level"}
              </button>
            </form>
          </div>

          <div className="admin-card">
            <div className="card-heading">
              <h2>Add Item</h2>
            </div>

            <form onSubmit={handleAddItem} className="admin-form">
              <div className="form-group">
                <label>Select Level</label>
                <select
                  value={selectedLevelId}
                  onChange={(e) => setSelectedLevelId(e.target.value)}
                >
                  <option value="">Select Level</option>
                  {filteredLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      Stage {level.stage || 1} - {level.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row two-cols">
                <div className="form-group">
                  <label>Item Type</label>
                  <select
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value)}
                  >
                    {ITEM_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Visual Type</label>
                  <select
                    value={visualType}
                    onChange={(e) => {
                      setVisualType(e.target.value);
                      setImageFile(null);
                      setGifFile(null);
                      setVideoFile(null);

                      const imageInput = document.getElementById("imageUpload");
                      const gifInput = document.getElementById("gifUpload");
                      const videoInput = document.getElementById("videoUpload");

                      if (imageInput) imageInput.value = "";
                      if (gifInput) gifInput.value = "";
                      if (videoInput) videoInput.value = "";
                    }}
                  >
                    {VISUAL_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Item Text</label>
                <input
                  type="text"
                  placeholder="Enter sound, word, sentence, or advanced text"
                  value={itemText}
                  onChange={(e) => setItemText(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Upload MP3</label>
                <input
                  id="audioUpload"
                  type="file"
                  accept=".mp3,audio/mpeg"
                  onChange={(e) => setAudioFile(e.target.files[0] || null)}
                />
              </div>

              <div className="form-group">
                <label>
                  Upload {visualType === "image" ? "Image" : visualType === "gif" ? "GIF" : "Video"}
                </label>

                {visualType === "image" && (
                  <input
                    id="imageUpload"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files[0] || null)}
                  />
                )}

                {visualType === "gif" && (
                  <input
                    id="gifUpload"
                    type="file"
                    accept="image/gif"
                    onChange={(e) => setGifFile(e.target.files[0] || null)}
                  />
                )}

                {visualType === "video" && (
                  <input
                    id="videoUpload"
                    type="file"
                    accept="video/*"
                    onChange={(e) => setVideoFile(e.target.files[0] || null)}
                  />
                )}
              </div>

              <button className="primary-btn" type="submit" disabled={savingItem}>
                {savingItem ? "Uploading..." : "Add Item"}
              </button>
            </form>
          </div>
        </section>

        <section className="content-grid">
          <div className="admin-card levels-panel">
            <div className="card-heading">
              <h2>Levels</h2>
            </div>

            {loadingLevels ? (
              <p className="empty-text">Loading levels...</p>
            ) : filteredLevels.length === 0 ? (
              <p className="empty-text">No levels found in this category.</p>
            ) : (
              <div className="levels-list">
                {filteredLevels.map((level) => (
                  <div
                    key={level.id}
                    className={`level-box ${
                      selectedLevelId === level.id ? "active-level" : ""
                    }`}
                    onClick={() => setSelectedLevelId(level.id)}
                  >
                    {editingLevelId === level.id ? (
                      <form
                        className="edit-form"
                        onSubmit={handleUpdateLevel}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="form-group">
                          <label>Level Title</label>
                          <input
                            type="text"
                            value={editLevelTitle}
                            onChange={(e) => setEditLevelTitle(e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label>Description</label>
                          <textarea
                            value={editLevelDescription}
                            onChange={(e) => setEditLevelDescription(e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label>Stage</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={editLevelStage}
                            onChange={(e) => setEditLevelStage(e.target.value)}
                          />
                        </div>

                        <div className="edit-buttons">
                          <button
                            className="primary-btn"
                            type="submit"
                            disabled={updatingLevel}
                          >
                            {updatingLevel ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={cancelEditLevel}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="level-box-header">
                          <div>
                            <span className="level-chip">
                              Stage {level.stage || 1}
                            </span>
                            <h3>{level.title}</h3>
                          </div>
                        </div>

                        <p>{level.description}</p>

                        <div className="level-profile-tags">
                          <span className="profile-tag">
                            {CATEGORY_OPTIONS.find(
                              (opt) => opt.value === level.category
                            )?.label || "General"}
                          </span>
                        </div>

                        <div className="level-action-buttons">
                          <button
                            className="secondary-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditLevel(level);
                            }}
                          >
                            Edit
                          </button>

                          <button
                            className="danger-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLevel(level.id);
                            }}
                            disabled={deletingLevelId === level.id}
                          >
                            {deletingLevelId === level.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-card items-panel">
            <div className="card-heading">
              <h2>Items {selectedLevel ? `- ${selectedLevel.title}` : ""}</h2>
            </div>

            {loadingItems ? (
              <p className="empty-text">Loading items...</p>
            ) : items.length === 0 ? (
              <p className="empty-text">No items added yet.</p>
            ) : (
              <div className="items-grid">
                {items.map((item) => (
                  <div className="item-card" key={item.id}>
                    {editingItemId === item.id ? (
                      <form
                        className="admin-form item-edit-form"
                        onSubmit={(e) => handleUpdateItem(e, item)}
                      >
                        <div className="form-row two-cols">
                          <div className="form-group">
                            <label>Item Type</label>
                            <select
                              value={editItemType}
                              onChange={(e) => setEditItemType(e.target.value)}
                            >
                              {ITEM_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group">
                            <label>Visual Type</label>
                            <select
                              value={editVisualType}
                              onChange={(e) => {
                                setEditVisualType(e.target.value);
                                resetEditItemFiles();
                              }}
                            >
                              {VISUAL_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Text</label>
                          <input
                            type="text"
                            value={editItemText}
                            onChange={(e) => setEditItemText(e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label>Replace MP3</label>
                          <input
                            type="file"
                            accept=".mp3,audio/mpeg"
                            onChange={(e) =>
                              setEditAudioFile(e.target.files[0] || null)
                            }
                          />
                        </div>

                        <div className="form-group">
                          <label>
                            Replace {editVisualType === "image" ? "Image" : editVisualType === "gif" ? "GIF" : "Video"}
                          </label>

                          {editVisualType === "image" && (
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                setEditImageFile(e.target.files[0] || null)
                              }
                            />
                          )}

                          {editVisualType === "gif" && (
                            <input
                              type="file"
                              accept="image/gif"
                              onChange={(e) =>
                                setEditGifFile(e.target.files[0] || null)
                              }
                            />
                          )}

                          {editVisualType === "video" && (
                            <input
                              type="file"
                              accept="video/*"
                              onChange={(e) =>
                                setEditVideoFile(e.target.files[0] || null)
                              }
                            />
                          )}
                        </div>

                        <div className="edit-buttons">
                          <button
                            className="primary-btn"
                            type="submit"
                            disabled={updatingItem}
                          >
                            {updatingItem ? "Saving..." : "Save Item"}
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={cancelEditItem}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="item-image-wrap">
                          {item.visualType === "image" && item.imageUrl && (
                            <img src={item.imageUrl} alt={item.text} className="item-image" />
                          )}

                          {item.visualType === "gif" && item.gifUrl && (
                            <img src={item.gifUrl} alt={item.text} className="item-image" />
                          )}

                          {item.visualType === "video" && item.videoUrl && (
                            <video src={item.videoUrl} className="item-image" controls />
                          )}

                          {!item.imageUrl && !item.gifUrl && !item.videoUrl && (
                            <div className="item-image item-image-placeholder">
                              No Media
                            </div>
                          )}
                        </div>

                        {item.audioUrl && (
                          <audio controls className="item-audio-player">
                            <source src={item.audioUrl} type="audio/mpeg" />
                          </audio>
                        )}

                        <div className="item-body">
                          <div className="item-badges-row">
                            <span className={`type-badge ${item.type}`}>
                              {item.type}
                            </span>
                            <span className="sub-badge">
                              {item.visualType || "image"}
                            </span>
                          </div>

                          <h4>{item.text}</h4>

                          <div className="item-meta">
                            <div className="meta-row">
                              <span>Audio</span>
                              <strong>{item.audioUrl ? "Uploaded" : "Missing"}</strong>
                            </div>
                            <div className="meta-row">
                              <span>Category</span>
                              <strong>
                                {CATEGORY_OPTIONS.find(
                                  (opt) => opt.value === item.category
                                )?.label || "General"}
                              </strong>
                            </div>
                          </div>

                          <div className="item-action-buttons">
                            <button
                              className="secondary-btn"
                              onClick={() => handleStartEditItem(item)}
                            >
                              Edit
                            </button>

                            <button
                              className="danger-btn"
                              onClick={() => handleDeleteItem(item)}
                              disabled={deletingItemId === item.id}
                            >
                              {deletingItemId === item.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;