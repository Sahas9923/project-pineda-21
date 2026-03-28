import React, { useEffect, useState } from "react";
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
  listAll,
} from "firebase/storage";

const AdminDashboard = () => {
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState("");

  const [levelTitle, setLevelTitle] = useState("");
  const [levelDescription, setLevelDescription] = useState("");

  const [editingLevelId, setEditingLevelId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [itemText, setItemText] = useState("");
  const [itemType, setItemType] = useState("sound");
  const [imageFile, setImageFile] = useState(null);
  const [mp3Track, setMp3Track] = useState("");
  const [promptDelayMs, setPromptDelayMs] = useState("2500");

  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemText, setEditItemText] = useState("");
  const [editItemType, setEditItemType] = useState("sound");
  const [editMp3Track, setEditMp3Track] = useState("");
  const [editPromptDelayMs, setEditPromptDelayMs] = useState("2500");
  const [editImageFile, setEditImageFile] = useState(null);
  const [updatingItem, setUpdatingItem] = useState(false);

  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [loadingLevel, setLoadingLevel] = useState(false);
  const [loadingItem, setLoadingItem] = useState(false);
  const [updatingLevel, setUpdatingLevel] = useState(false);
  const [deletingLevel, setDeletingLevel] = useState(false);

  useEffect(() => {
    fetchLevels();
  }, []);

  useEffect(() => {
    if (selectedLevel) {
      fetchItems(selectedLevel);
    } else {
      setItems([]);
    }
  }, [selectedLevel]);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  };

  const fetchLevels = async () => {
    try {
      const q = query(collection(db, "levels"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);

      const levelList = snapshot.docs.map((levelDoc) => ({
        id: levelDoc.id,
        ...levelDoc.data(),
      }));

      setLevels(levelList);

      if (levelList.length > 0) {
        const stillExists = levelList.some((lvl) => lvl.id === selectedLevel);
        if (!selectedLevel || !stillExists) {
          setSelectedLevel(levelList[0].id);
        }
      } else {
        setSelectedLevel("");
      }
    } catch (error) {
      console.error("Error fetching levels:", error);
      showMessage("❌ Failed to load levels.");
    }
  };

  const fetchItems = async (levelId) => {
    try {
      const q = query(
        collection(db, "levels", levelId, "items"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);

      const itemList = snapshot.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ...itemDoc.data(),
      }));

      setItems(itemList);
    } catch (error) {
      console.error("Error fetching items:", error);
      showMessage("❌ Failed to load items.");
    }
  };

  const handleAddLevel = async (e) => {
    e.preventDefault();

    if (!levelTitle.trim() || !levelDescription.trim()) {
      showMessage("❌ Please fill level title and description.");
      return;
    }

    try {
      setLoadingLevel(true);

      const docRef = await addDoc(collection(db, "levels"), {
        title: levelTitle.trim(),
        description: levelDescription.trim(),
        createdAt: serverTimestamp(),
      });

      setLevelTitle("");
      setLevelDescription("");

      await fetchLevels();
      setSelectedLevel(docRef.id);

      showMessage("✅ Level added successfully.");
    } catch (error) {
      console.error("Error adding level:", error);
      showMessage("❌ Failed to add level.");
    } finally {
      setLoadingLevel(false);
    }
  };

  const handleEditLevel = (level) => {
    setEditingLevelId(level.id);
    setEditTitle(level.title || "");
    setEditDescription(level.description || "");
  };

  const handleUpdateLevel = async (e) => {
    e.preventDefault();

    if (!editTitle.trim() || !editDescription.trim()) {
      showMessage("❌ Please fill all edit fields.");
      return;
    }

    try {
      setUpdatingLevel(true);

      await updateDoc(doc(db, "levels", editingLevelId), {
        title: editTitle.trim(),
        description: editDescription.trim(),
      });

      setEditingLevelId(null);
      setEditTitle("");
      setEditDescription("");

      await fetchLevels();
      showMessage("✅ Level updated successfully.");
    } catch (error) {
      console.error("Error updating level:", error);
      showMessage("❌ Failed to update level.");
    } finally {
      setUpdatingLevel(false);
    }
  };

  const cancelEditLevel = () => {
    setEditingLevelId(null);
    setEditTitle("");
    setEditDescription("");
  };

  const handleAddItem = async (e) => {
    e.preventDefault();

    if (!selectedLevel) {
      showMessage("❌ Please select a level.");
      return;
    }

    if (!itemText.trim()) {
      showMessage("❌ Please enter a sound, word, or sentence.");
      return;
    }

    if (!imageFile) {
      showMessage("❌ Please choose an image.");
      return;
    }

    const parsedTrack = Number(mp3Track);
    if (
      !mp3Track ||
      Number.isNaN(parsedTrack) ||
      parsedTrack < 1 ||
      !Number.isInteger(parsedTrack)
    ) {
      showMessage("❌ Please enter a valid MP3 track number.");
      return;
    }

    const parsedDelay = Number(promptDelayMs || 2500);
    if (Number.isNaN(parsedDelay) || parsedDelay < 0) {
      showMessage("❌ Please enter a valid prompt delay.");
      return;
    }

    try {
      setLoadingItem(true);

      const fileName = `${Date.now()}-${imageFile.name}`;
      const storageRef = ref(storage, `speech-items/${selectedLevel}/${fileName}`);

      await uploadBytes(storageRef, imageFile);
      const imageUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "levels", selectedLevel, "items"), {
        text: itemText.trim(),
        type: itemType,
        imageUrl,
        storagePath: storageRef.fullPath,
        mp3Track: parsedTrack,
        promptDelayMs: parsedDelay,
        createdAt: serverTimestamp(),
      });

      setItemText("");
      setItemType("sound");
      setImageFile(null);
      setMp3Track("");
      setPromptDelayMs("2500");

      const fileInput = document.getElementById("imageUpload");
      if (fileInput) fileInput.value = "";

      await fetchItems(selectedLevel);
      showMessage("✅ Item added successfully.");
    } catch (error) {
      console.error("Error adding item:", error);
      showMessage("❌ Failed to add item.");
    } finally {
      setLoadingItem(false);
    }
  };

  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    setEditItemText(item.text || "");
    setEditItemType(item.type || "sound");
    setEditMp3Track(String(item.mp3Track ?? ""));
    setEditPromptDelayMs(String(item.promptDelayMs ?? 2500));
    setEditImageFile(null);
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItemText("");
    setEditItemType("sound");
    setEditMp3Track("");
    setEditPromptDelayMs("2500");
    setEditImageFile(null);
  };

  const handleUpdateItem = async (e, item) => {
    e.preventDefault();

    if (!selectedLevel || !item?.id) {
      showMessage("❌ Item update failed.");
      return;
    }

    if (!editItemText.trim()) {
      showMessage("❌ Please enter item text.");
      return;
    }

    const parsedTrack = Number(editMp3Track);
    if (
      !editMp3Track ||
      Number.isNaN(parsedTrack) ||
      parsedTrack < 1 ||
      !Number.isInteger(parsedTrack)
    ) {
      showMessage("❌ Please enter a valid MP3 track number.");
      return;
    }

    const parsedDelay = Number(editPromptDelayMs || 2500);
    if (Number.isNaN(parsedDelay) || parsedDelay < 0) {
      showMessage("❌ Please enter a valid prompt delay.");
      return;
    }

    try {
      setUpdatingItem(true);

      const updateData = {
        text: editItemText.trim(),
        type: editItemType,
        mp3Track: parsedTrack,
        promptDelayMs: parsedDelay,
      };

      if (editImageFile) {
        const newFileName = `${Date.now()}-${editImageFile.name}`;
        const newStorageRef = ref(
          storage,
          `speech-items/${selectedLevel}/${newFileName}`
        );

        await uploadBytes(newStorageRef, editImageFile);
        const newImageUrl = await getDownloadURL(newStorageRef);

        updateData.imageUrl = newImageUrl;
        updateData.storagePath = newStorageRef.fullPath;

        if (item.storagePath) {
          try {
            const oldImageRef = ref(storage, item.storagePath);
            await deleteObject(oldImageRef);
          } catch (deleteError) {
            console.warn("Old image delete failed:", deleteError);
          }
        }
      }

      await updateDoc(
        doc(db, "levels", selectedLevel, "items", item.id),
        updateData
      );

      cancelEditItem();
      await fetchItems(selectedLevel);
      showMessage("✅ Item updated successfully.");
    } catch (error) {
      console.error("Error updating item:", error);
      showMessage("❌ Failed to update item.");
    } finally {
      setUpdatingItem(false);
    }
  };

  const handleDeleteItem = async (itemId, storagePath) => {
    const confirmed = window.confirm("Are you sure you want to delete this item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "levels", selectedLevel, "items", itemId));

      if (storagePath) {
        const imageRef = ref(storage, storagePath);
        await deleteObject(imageRef);
      }

      await fetchItems(selectedLevel);
      showMessage("✅ Item deleted successfully.");
    } catch (error) {
      console.error("Error deleting item:", error);
      showMessage("❌ Failed to delete item.");
    }
  };

  const handleDeleteLevel = async (levelId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this level and all its items?"
    );
    if (!confirmed) return;

    try {
      setDeletingLevel(true);

      const folderRef = ref(storage, `speech-items/${levelId}`);
      try {
        const folderItems = await listAll(folderRef);
        for (const fileRef of folderItems.items) {
          await deleteObject(fileRef);
        }
      } catch (storageError) {
        console.warn("Storage folder may be empty or missing:", storageError);
      }

      const itemsSnapshot = await getDocs(collection(db, "levels", levelId, "items"));
      for (const itemDoc of itemsSnapshot.docs) {
        await deleteDoc(doc(db, "levels", levelId, "items", itemDoc.id));
      }

      await deleteDoc(doc(db, "levels", levelId));

      if (editingLevelId === levelId) {
        cancelEditLevel();
      }

      if (selectedLevel === levelId) {
        setItems([]);
      }

      await fetchLevels();
      showMessage("✅ Level and all items deleted successfully.");
    } catch (error) {
      console.error("Error deleting level:", error);
      showMessage("❌ Failed to delete level.");
    } finally {
      setDeletingLevel(false);
    }
  };

  const getSelectedLevelName = () => {
    const level = levels.find((lvl) => lvl.id === selectedLevel);
    return level ? level.title : "No level selected";
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p>
          Manage speech practice levels and add sounds, words, or sentences with
          images and MP3 tracks.
        </p>
      </div>

      {message && <div className="message-box">{message}</div>}

      <div className="admin-grid">
        <div className="admin-card">
          <h2>Add Level</h2>
          <form onSubmit={handleAddLevel} className="admin-form">
            <input
              type="text"
              placeholder="Enter level title"
              value={levelTitle}
              onChange={(e) => setLevelTitle(e.target.value)}
            />

            <textarea
              placeholder="Enter level description"
              value={levelDescription}
              onChange={(e) => setLevelDescription(e.target.value)}
            />

            <button type="submit" disabled={loadingLevel}>
              {loadingLevel ? "Adding..." : "Add Level"}
            </button>
          </form>
        </div>

        <div className="admin-card">
          <h2>Add Sound / Word / Sentence</h2>
          <form onSubmit={handleAddItem} className="admin-form">
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
            >
              <option value="">Select Level</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.title}
                </option>
              ))}
            </select>

            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
            >
              <option value="sound">Sound</option>
              <option value="word">Word</option>
              <option value="sentence">Sentence</option>
            </select>

            <input
              type="text"
              placeholder="Enter sound / word / sentence"
              value={itemText}
              onChange={(e) => setItemText(e.target.value)}
            />

            <input
              type="number"
              min="1"
              step="1"
              placeholder="Enter MP3 track number (e.g. 1 for 0001.mp3)"
              value={mp3Track}
              onChange={(e) => setMp3Track(e.target.value)}
            />

            <input
              type="number"
              min="0"
              step="100"
              placeholder="Prompt delay in ms (default 2500)"
              value={promptDelayMs}
              onChange={(e) => setPromptDelayMs(e.target.value)}
            />

            <input
              id="imageUpload"
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files[0])}
            />

            <button type="submit" disabled={loadingItem}>
              {loadingItem ? "Uploading..." : "Add Item"}
            </button>
          </form>
        </div>
      </div>

      <div className="admin-card levels-card">
        <h2>Available Levels</h2>
        {levels.length === 0 ? (
          <p className="empty-text">No levels added yet.</p>
        ) : (
          <div className="levels-list">
            {levels.map((level) => (
              <div
                key={level.id}
                className={`level-box ${
                  selectedLevel === level.id ? "active-level" : ""
                }`}
                onClick={() => setSelectedLevel(level.id)}
              >
                {editingLevelId === level.id ? (
                  <form
                    className="edit-form"
                    onSubmit={handleUpdateLevel}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Edit level title"
                    />

                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Edit level description"
                    />

                    <div className="edit-buttons">
                      <button type="submit" disabled={updatingLevel}>
                        {updatingLevel ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        className="cancel-btn"
                        onClick={cancelEditLevel}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h3>{level.title}</h3>
                    <p>{level.description}</p>

                    <div className="level-action-buttons">
                      <button
                        className="edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditLevel(level);
                        }}
                      >
                        Edit Level
                      </button>

                      <button
                        className="delete-level-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLevel(level.id);
                        }}
                        disabled={deletingLevel}
                      >
                        {deletingLevel && selectedLevel === level.id
                          ? "Deleting..."
                          : "Delete Level"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="items-header">
          <h2>Items in {getSelectedLevelName()}</h2>
        </div>

        {items.length === 0 ? (
          <p className="empty-text">No items added for this level yet.</p>
        ) : (
          <div className="items-grid">
            {items.map((item) => (
              <div className="item-card" key={item.id}>
                {editingItemId === item.id ? (
                  <form
                    className="admin-form item-edit-form"
                    onSubmit={(e) => handleUpdateItem(e, item)}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.text}
                      className="item-image"
                    />

                    <select
                      value={editItemType}
                      onChange={(e) => setEditItemType(e.target.value)}
                    >
                      <option value="sound">Sound</option>
                      <option value="word">Word</option>
                      <option value="sentence">Sentence</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Edit item text"
                      value={editItemText}
                      onChange={(e) => setEditItemText(e.target.value)}
                    />

                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Edit MP3 track number"
                      value={editMp3Track}
                      onChange={(e) => setEditMp3Track(e.target.value)}
                    />

                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="Edit prompt delay"
                      value={editPromptDelayMs}
                      onChange={(e) => setEditPromptDelayMs(e.target.value)}
                    />

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditImageFile(e.target.files[0])}
                    />

                    <div className="edit-buttons">
                      <button type="submit" disabled={updatingItem}>
                        {updatingItem ? "Updating..." : "Save Item"}
                      </button>
                      <button
                        type="button"
                        className="cancel-btn"
                        onClick={cancelEditItem}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <img
                      src={item.imageUrl}
                      alt={item.text}
                      className="item-image"
                    />

                    <div className="item-body">
                      <span className={`type-badge ${item.type}`}>
                        {item.type}
                      </span>
                      <h4>{item.text}</h4>
                      <p>
                        <strong>🎵 Track:</strong> {item.mp3Track ?? 0}
                      </p>
                      <p>
                        <strong>⏱ Delay:</strong> {item.promptDelayMs ?? 2500} ms
                      </p>

                      <div className="item-action-buttons">
                        <button
                          className="edit-btn"
                          onClick={() => handleEditItem(item)}
                        >
                          Edit Item
                        </button>

                        <button
                          className="delete-btn"
                          onClick={() =>
                            handleDeleteItem(item.id, item.storagePath)
                          }
                        >
                          Delete Item
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
    </div>
  );
};

export default AdminDashboard;