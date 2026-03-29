import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Image,
  Switch,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

import TherapistHeader from "../../components/TherapistHeader";
import { auth, db, storage } from "../../firebase/config";
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
import { colors, shadows } from "../../styles/theme";

export default function TherapistSettingsScreen() {
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

  const [profileImageAsset, setProfileImageAsset] = useState(null);
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

  const showToast = (text) => {
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
      console.log("Error fetching therapist data:", error);
      showToast("❌ Failed to load therapist settings.");
    } finally {
      setLoading(false);
    }
  };

  const pickProfileImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showToast("❌ Please allow photo access.");
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
      setProfileImageAsset(asset);
      setProfileImagePreview(asset.uri);
    } catch (error) {
      console.log("Image picker error:", error);
      showToast("❌ Failed to select image.");
    }
  };

  const uploadImageFromUri = async (uri, path) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);

      const user = auth.currentUser;
      if (!user) {
        showToast("❌ User not found.");
        return;
      }

      let updatedImageUrl = therapistData.imageUrl || "";

      if (profileImageAsset?.uri) {
        const fileName = `therapist-profile-${user.uid}-${Date.now()}.jpg`;
        updatedImageUrl = await uploadImageFromUri(
          profileImageAsset.uri,
          `therapists/${user.uid}/${fileName}`
        );
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

      setProfileImageAsset(null);
      showToast("✅ Therapist profile updated successfully.");
    } catch (error) {
      console.log("Error updating therapist profile:", error);
      showToast("❌ Failed to update therapist profile.");
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

  const handleSaveLocation = async () => {
    try {
      setSavingLocation(true);

      const user = auth.currentUser;
      if (!user) {
        showToast("❌ User not found.");
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
        showToast("✅ Location updated successfully.");
      } else {
        await addDoc(collection(db, "therapists", user.uid, "locations"), locationPayload);
        showToast("✅ Location added successfully.");
      }

      resetLocationForm();
      await fetchTherapistData();
    } catch (error) {
      console.log("Error saving location:", error);
      showToast("❌ Failed to save location.");
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
  };

  const handleDeleteLocation = async (locationId) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      await deleteDoc(doc(db, "therapists", user.uid, "locations", locationId));
      showToast("✅ Location deleted successfully.");

      if (editingLocationId === locationId) {
        resetLocationForm();
      }

      await fetchTherapistData();
    } catch (error) {
      console.log("Error deleting location:", error);
      showToast("❌ Failed to delete location.");
    }
  };

  if (loading) {
    return (
      <View style={styles.page}>
        <TherapistHeader />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading therapist information...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <TherapistHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Therapist Settings</Text>
          <Text style={styles.headerSubtitle}>
            View and update your therapist profile, professional details, and
            practice locations.
          </Text>
        </View>

        {!!message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        <View style={styles.profileCard}>
          <View style={styles.profileTopBg} />

          <View style={styles.profileTop}>
            <TouchableOpacity onPress={pickProfileImage} activeOpacity={0.9}>
              {profileImagePreview ? (
                <Image source={{ uri: profileImagePreview }} style={styles.profileImage} />
              ) : (
                <View style={styles.profilePlaceholder}>
                  <Text style={styles.profilePlaceholderText}>🧑‍⚕️</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.profileName}>
              {therapistData.name || "Therapist Name"}
            </Text>
            <Text style={styles.profileEmail}>
              {therapistData.email || "therapist@email.com"}
            </Text>
            <View style={styles.idBadge}>
              <Text style={styles.idBadgeText}>
                {therapistData.therapistId || "No Therapist ID"}
              </Text>
            </View>
          </View>

          <View style={styles.quickInfoList}>
            <QuickInfo label="Therapist ID" value={therapistData.therapistId || "N/A"} />
            <QuickInfo label="Contact" value={therapistData.contact || "Not added"} />
            <QuickInfo label="SLMC Number" value={therapistData.slmcNumber || "Not added"} />
            <QuickInfo label="Experience" value={therapistData.experience || "Not added"} />
            <QuickInfo
              label="Specialization"
              value={therapistData.specialization || "Not added"}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Update Account Information</Text>
          <Text style={styles.cardSubtitle}>
            Edit therapist account information and save changes.
          </Text>

          <InputField
            label="Full Name"
            value={therapistData.name}
            onChangeText={(text) => setTherapistData((p) => ({ ...p, name: text }))}
            placeholder="Enter full name"
          />

          <InputField
            label="Email Address"
            value={therapistData.email}
            onChangeText={(text) => setTherapistData((p) => ({ ...p, email: text }))}
            placeholder="Enter email"
          />

          <InputField
            label="Therapist ID"
            value={therapistData.therapistId}
            editable={false}
            placeholder="Therapist ID"
          />

          <InputField
            label="Contact Number"
            value={therapistData.contact}
            onChangeText={(text) => setTherapistData((p) => ({ ...p, contact: text }))}
            placeholder="Enter contact number"
          />

          <InputField
            label="SLMC Number"
            value={therapistData.slmcNumber}
            onChangeText={(text) => setTherapistData((p) => ({ ...p, slmcNumber: text }))}
            placeholder="Enter SLMC number"
          />

          <InputField
            label="Experience"
            value={therapistData.experience}
            onChangeText={(text) => setTherapistData((p) => ({ ...p, experience: text }))}
            placeholder="Enter experience"
          />

          <InputField
            label="Specialization"
            value={therapistData.specialization}
            onChangeText={(text) => setTherapistData((p) => ({ ...p, specialization: text }))}
            placeholder="Enter specialization"
          />

          <TouchableOpacity style={styles.uploadBtn} onPress={pickProfileImage}>
            <Text style={styles.uploadBtnText}>Change Profile Image</Text>
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Available for online sessions</Text>
            <Switch
              value={therapistData.availableOnline}
              onValueChange={(value) =>
                setTherapistData((p) => ({ ...p, availableOnline: value }))
              }
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, savingProfile && styles.disabledBtn]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {editingLocationId ? "Edit Location" : "Add Location"}
          </Text>
          <Text style={styles.cardSubtitle}>
            {editingLocationId
              ? "Update your selected practice location."
              : "Add a new clinic or working location."}
          </Text>

          <InputField
            label="Place Name"
            value={locationForm.placeName}
            onChangeText={(text) => setLocationForm((p) => ({ ...p, placeName: text }))}
            placeholder="Enter place name"
          />

          <InputField
            label="City"
            value={locationForm.city}
            onChangeText={(text) => setLocationForm((p) => ({ ...p, city: text }))}
            placeholder="Enter city"
          />

          <InputField
            label="Address"
            value={locationForm.address}
            onChangeText={(text) => setLocationForm((p) => ({ ...p, address: text }))}
            placeholder="Enter address"
          />

          <InputField
            label="Contact Number"
            value={locationForm.contactNumber}
            onChangeText={(text) => setLocationForm((p) => ({ ...p, contactNumber: text }))}
            placeholder="Enter contact number"
          />

          <InputField
            label="Available Days"
            value={locationForm.availableDays}
            onChangeText={(text) => setLocationForm((p) => ({ ...p, availableDays: text }))}
            placeholder="Example: Mon, Wed, Fri"
          />

          <InputField
            label="Available Time"
            value={locationForm.availableTime}
            onChangeText={(text) => setLocationForm((p) => ({ ...p, availableTime: text }))}
            placeholder="Example: 9.00 AM - 5.00 PM"
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Mark this as primary location</Text>
            <Switch
              value={locationForm.isPrimary}
              onValueChange={(value) => setLocationForm((p) => ({ ...p, isPrimary: value }))}
            />
          </View>

          <View style={styles.actionRow}>
            {editingLocationId && (
              <TouchableOpacity style={styles.cancelBtn} onPress={resetLocationForm}>
                <Text style={styles.cancelBtnText}>Cancel Edit</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, savingLocation && styles.disabledBtn]}
              onPress={handleSaveLocation}
              disabled={savingLocation}
            >
              {savingLocation ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {editingLocationId ? "Update Location" : "Save Location"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Saved Locations</Text>
          <Text style={styles.cardSubtitle}>Manage your practice locations here.</Text>

          {locations.length === 0 ? (
            <Text style={styles.emptyText}>No locations added yet.</Text>
          ) : (
            locations.map((location) => (
              <View style={styles.locationItem} key={location.id}>
                <View style={styles.locationTop}>
                  <Text style={styles.locationName}>
                    {location.placeName || "Unnamed Place"}
                  </Text>
                  {location.isPrimary && (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.primaryBadgeText}>Primary</Text>
                    </View>
                  )}
                </View>

                <LocationLine label="Address" value={location.address || "N/A"} />
                <LocationLine label="City" value={location.city || "N/A"} />
                <LocationLine label="Contact" value={location.contactNumber || "N/A"} />
                <LocationLine label="Days" value={location.availableDays || "N/A"} />
                <LocationLine label="Time" value={location.availableTime || "N/A"} />

                <View style={styles.locationActionRow}>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleEditLocation(location)}
                  >
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteLocation(location.id)}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function InputField({ label, ...props }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#8a97a6"
        style={[styles.input, props.editable === false && styles.disabledInput]}
        {...props}
      />
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

function LocationLine({ label, value }) {
  return (
    <Text style={styles.locationText}>
      <Text style={styles.locationLabel}>{label}: </Text>
      {value}
    </Text>
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
    color: "#475467",
    fontWeight: "800",
    fontSize: 16,
  },

  header: {
    marginBottom: 18,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 8,
  },
  headerSubtitle: {
    color: "#667085",
    lineHeight: 22,
    fontSize: 14,
  },

  messageBox: {
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#ecfeff",
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
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 26,
    marginBottom: 18,
    overflow: "hidden",
    ...shadows.card,
  },
  profileTopBg: {
    height: 120,
    backgroundColor: "rgba(46,196,182,0.12)",
  },
  profileTop: {
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: -58,
    marginBottom: 18,
  },
  profileImage: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 5,
    borderColor: "#ffffff",
    backgroundColor: "#eef2f3",
    marginBottom: 14,
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
    marginBottom: 14,
  },
  profilePlaceholderText: {
    color: "#ffffff",
    fontSize: 42,
  },
  profileName: {
    color: "#17303d",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 6,
    textAlign: "center",
  },
  profileEmail: {
    color: "#667085",
    textAlign: "center",
    marginBottom: 8,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#f8fbfb",
  },
  quickInfoLabel: {
    color: "#17303d",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },
  quickInfoValue: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 20,
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 26,
    padding: 20,
    marginBottom: 18,
    ...shadows.card,
  },
  cardTitle: {
    color: "#17303d",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 6,
  },
  cardSubtitle: {
    color: "#667085",
    marginBottom: 16,
    lineHeight: 20,
  },

  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: "#344054",
    fontSize: 14,
    fontWeight: "800",
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
  },
  disabledInput: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },

  uploadBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    marginBottom: 16,
    ...shadows.soft,
  },
  uploadBtnText: {
    color: "#ffffff",
    fontWeight: "800",
  },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#f8fbfb",
    borderWidth: 1,
    borderColor: "#e5efef",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  switchLabel: {
    flex: 1,
    color: "#344054",
    fontWeight: "700",
  },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  saveBtnText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.65,
  },

  actionRow: {
    gap: 10,
  },
  cancelBtn: {
    backgroundColor: "#f3f4f6",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#374151",
    fontWeight: "800",
  },

  emptyText: {
    color: "#667085",
    lineHeight: 22,
  },

  locationItem: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#f8fbfb",
    borderWidth: 1,
    borderColor: "#e6eeee",
    marginBottom: 14,
  },
  locationTop: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  locationName: {
    color: "#17303d",
    fontSize: 18,
    fontWeight: "900",
  },
  primaryBadge: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  primaryBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  locationText: {
    color: "#4b5563",
    lineHeight: 21,
    marginBottom: 4,
  },
  locationLabel: {
    fontWeight: "800",
    color: "#17303d",
  },

  locationActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  editBtn: {
    flex: 1,
    backgroundColor: "#ecfeff",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  editBtnText: {
    color: "#0f766e",
    fontWeight: "800",
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: "#fff1f1",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteBtnText: {
    color: "#d9534f",
    fontWeight: "800",
  },
});