import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";

import ParentHeader from "../../components/ParentHeader";
import { auth, db, storage } from "../../firebase/config";
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
import { colors, radius, shadows } from "../../styles/theme";

export default function ParentSettingsScreen() {
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

  const [imageAsset, setImageAsset] = useState(null);
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
      console.log("Error fetching parent settings:", error);
      showMessage("❌ Failed to load parent information.");
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow access to photos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setImageAsset(asset);
      setImagePreview(asset.uri);
    } catch (error) {
      console.log("Image picker error:", error);
      showMessage("❌ Failed to select image.");
    }
  };

  const uploadImageFromUri = async (uri, path) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleUpdate = async () => {
    try {
      setSaving(true);

      const user = auth.currentUser;
      if (!user) {
        showMessage("❌ User not found.");
        return;
      }

      let updatedImageUrl = formData.imageUrl || "";

      if (imageAsset?.uri) {
        const fileName = `parent-profile-${user.uid}-${Date.now()}.jpg`;
        updatedImageUrl = await uploadImageFromUri(
          imageAsset.uri,
          `parents/${user.uid}/${fileName}`
        );
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

      setImageAsset(null);
      showMessage("✅ Parent account updated successfully.");
    } catch (error) {
      console.log("Error updating parent settings:", error);
      showMessage("❌ Failed to update account information.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.page}>
        <ParentHeader />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading parent information...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ParentHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#f9fffe", "#eefaf7", "#f7fbff"]}
          style={styles.heroCard}
        >
          <Text style={styles.pageTitle}>Parent Settings</Text>
          <Text style={styles.pageSubtitle}>
            View and update your parent account information, contact details,
            and profile image.
          </Text>
        </LinearGradient>

        {!!message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        <View style={styles.profileCard}>
          <LinearGradient
            colors={["rgba(46,196,182,0.14)", "rgba(123,224,214,0.10)"]}
            style={styles.profileTopBg}
          />

          <View style={styles.profileTop}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.9}>
              {imagePreview ? (
                <Image
                  source={{ uri: imagePreview }}
                  style={styles.profileImage}
                />
              ) : (
                <View style={styles.profilePlaceholder}>
                  <Text style={styles.profilePlaceholderText}>👤</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.profileName}>{formData.name || "Parent Name"}</Text>
            <Text style={styles.profileEmail}>
              {formData.email || "parent@email.com"}
            </Text>

            <View style={styles.idBadge}>
              <Text style={styles.idBadgeText}>
                {formData.parentId || "No Parent ID"}
              </Text>
            </View>
          </View>

          <View style={styles.quickInfoList}>
            <QuickInfo label="Parent ID" value={formData.parentId || "N/A"} />
            <QuickInfo label="Contact" value={formData.contact || "Not added"} />
            <QuickInfo label="Address" value={formData.address || "Not added"} />
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.cardTitle}>Update Account Information</Text>
          <Text style={styles.cardSubtitle}>
            Edit the details below and save changes.
          </Text>

          <Text style={styles.inputLabel}>Full Name</Text>
          <TextInput
            value={formData.name}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, name: text }))
            }
            placeholder="Enter full name"
            placeholderTextColor="#8b98a5"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput
            value={formData.email}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, email: text }))
            }
            placeholder="Enter email"
            placeholderTextColor="#8b98a5"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Parent ID</Text>
          <TextInput
            value={formData.parentId}
            editable={false}
            placeholder="Parent ID"
            placeholderTextColor="#8b98a5"
            style={[styles.input, styles.disabledInput]}
          />

          <Text style={styles.inputLabel}>Contact Number</Text>
          <TextInput
            value={formData.contact}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, contact: text }))
            }
            placeholder="Enter contact number"
            placeholderTextColor="#8b98a5"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Address</Text>
          <TextInput
            value={formData.address}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, address: text }))
            }
            placeholder="Enter address"
            placeholderTextColor="#8b98a5"
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textarea]}
          />

          <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
            <Text style={styles.uploadBtnText}>Change Profile Image</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.disabledBtn]}
            onPress={handleUpdate}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function QuickInfo({ label, value }) {
  return (
    <View style={styles.quickInfoItem}>
      <Text style={styles.quickInfoLabel}>{label}</Text>
      <Text style={styles.quickInfoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f7fbff",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#475467",
  },

  heroCard: {
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    ...shadows.card,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 8,
  },
  pageSubtitle: {
    color: "#667085",
    lineHeight: 22,
    fontSize: 14,
  },

  messageBox: {
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#f0fdfa",
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    ...shadows.card,
  },
  messageText: {
    color: "#17303d",
    fontWeight: "800",
    lineHeight: 20,
  },

  profileCard: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 26,
    marginBottom: 16,
    overflow: "hidden",
    ...shadows.card,
  },
  profileTopBg: {
    height: 120,
    width: "100%",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  profileTop: {
    alignItems: "center",
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  profileImage: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 5,
    borderColor: "#ffffff",
    backgroundColor: "#eef2f3",
    marginBottom: 16,
  },
  profilePlaceholder: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 5,
    borderColor: "#ffffff",
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  profilePlaceholderText: {
    fontSize: 42,
    color: "#ffffff",
  },
  profileName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 6,
    textAlign: "center",
  },
  profileEmail: {
    color: "#667085",
    textAlign: "center",
    marginBottom: 10,
  },
  idBadge: {
    backgroundColor: "#e6fffa",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  idBadgeText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
  },

  quickInfoList: {
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  quickInfoItem: {
    backgroundColor: "#f8fbfb",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  quickInfoLabel: {
    color: "#17303d",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },
  quickInfoValue: {
    color: "#667085",
    lineHeight: 20,
  },

  formCard: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 26,
    padding: 20,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 6,
  },
  cardSubtitle: {
    color: "#667085",
    marginBottom: 18,
    lineHeight: 20,
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#344054",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d8e1e6",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontSize: 14,
    color: "#1f2937",
    backgroundColor: "#ffffff",
    marginBottom: 16,
  },
  disabledInput: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },
  textarea: {
    minHeight: 100,
  },

  uploadBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    marginBottom: 18,
    ...shadows.soft,
  },
  uploadBtnText: {
    color: "#ffffff",
    fontWeight: "800",
  },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  saveBtnText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 15,
  },
  disabledBtn: {
    opacity: 0.65,
  },
});