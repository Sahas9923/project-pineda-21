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
        createdAt: serverTimestamp(),
      });

      setItemText("");
      setItemType("sound");
      setImageFile(null);

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

      // 1. Delete all item images from Storage folder
      const folderRef = ref(storage, `speech-items/${levelId}`);
      try {
        const folderItems = await listAll(folderRef);
        for (const fileRef of folderItems.items) {
          await deleteObject(fileRef);
        }
      } catch (storageError) {
        console.warn("Storage folder may be empty or missing:", storageError);
      }

      // 2. Delete all item documents from Firestore
      const itemsSnapshot = await getDocs(collection(db, "levels", levelId, "items"));
      for (const itemDoc of itemsSnapshot.docs) {
        await deleteDoc(doc(db, "levels", levelId, "items", itemDoc.id));
      }

      // 3. Delete the level document
      await deleteDoc(doc(db, "levels", levelId));

      // 4. Reset edit mode if needed
      if (editingLevelId === levelId) {
        cancelEditLevel();
      }

      // 5. Refresh levels and items
      await fetchLevels();

      if (selectedLevel === levelId) {
        setItems([]);
      }

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
        <p>Manage speech practice levels and add sounds, words, or sentences with images.</p>
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
                className={`level-box ${selectedLevel === level.id ? "active-level" : ""}`}
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
                <img src={item.imageUrl} alt={item.text} className="item-image" />

                <div className="item-body">
                  <span className={`type-badge ${item.type}`}>{item.type}</span>
                  <h4>{item.text}</h4>

                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteItem(item.id, item.storagePath)}
                  >
                    Delete Item
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;