import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import ParentHeader from "../../components/ParentHeader";
import { auth, db, storage } from "../../firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, shadows } from "../../styles/theme";

const genderOptions = ["Male", "Female"];

export default function ChildInfoScreen() {
  const navigation = useNavigation();

  const [childrenList, setChildrenList] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [recentTimeline, setRecentTimeline] = useState([]);
  const [therapistProfile, setTherapistProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  const [savingChild, setSavingChild] = useState(false);
  const [message, setMessage] = useState("");

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingChild, setEditingChild] = useState(false);
  const [updatingChild, setUpdatingChild] = useState(false);

  const [childForm, setChildForm] = useState({
    childName: "",
    age: "",
    gender: "",
  });

  const [editChildForm, setEditChildForm] = useState({
    childName: "",
    age: "",
    gender: "",
  });

  const [childImageAsset, setChildImageAsset] = useState(null);
  const [childImagePreview, setChildImagePreview] = useState("");

  const [editChildImageAsset, setEditChildImageAsset] = useState(null);
  const [editChildImagePreview, setEditChildImagePreview] = useState("");

  useEffect(() => {
    fetchChildren();
  }, []);

  const showToast = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  };

  const getTodayKey = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const isWithinTherapyTime = (startTime, endTime) => {
    if (!startTime || !endTime) return true;

    try {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch {
      return true;
    }
  };

  const generateChildCodeFromCounter = async () => {
    const counterRef = doc(db, "counters", "children");

    const newCount = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);

      if (!counterSnap.exists()) {
        transaction.set(counterRef, {
          currentCount: 1,
          prefix: "CH",
          updatedAt: serverTimestamp(),
        });
        return 1;
      }

      const currentCount = counterSnap.data().currentCount || 0;
      const nextCount = currentCount + 1;

      transaction.update(counterRef, {
        currentCount: nextCount,
        updatedAt: serverTimestamp(),
      });

      return nextCount;
    });

    return `CH-${String(newCount).padStart(4, "0")}`;
  };

  const fetchChildren = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const parentRef = doc(db, "parents", user.uid);
      const parentSnap = await getDoc(parentRef);
      const parentData = parentSnap.exists() ? parentSnap.data() : {};

      const q = query(
        collection(db, "children"),
        where("parentUid", "==", user.uid)
      );

      const snapshot = await getDocs(q);

      const children = snapshot.docs.map((childDoc) => ({
        id: childDoc.id,
        ...childDoc.data(),
        parentName: childDoc.data().parentName || parentData.name || "Parent",
        parentEmail:
          childDoc.data().parentEmail || parentData.email || user.email || "",
        parentId: childDoc.data().parentId || parentData.parentId || "",
        parentContact:
          childDoc.data().parentContact ||
          parentData.contact ||
          parentData.phone ||
          "",
      }));

      setChildrenList(children);

      if (children.length > 0) {
        setSelectedChild(children[0]);
      } else {
        setSelectedChild(null);
        setReportData(null);
        setRecentTimeline([]);
        setTherapistProfile(null);
      }
    } catch (error) {
      console.log("Error fetching children:", error);
      showToast("❌ Failed to load children.");
    } finally {
      setLoading(false);
    }
  };

  const fetchLatestTherapistProfile = async (
    therapistUid,
    childFallbackData = {}
  ) => {
    if (!therapistUid) {
      setTherapistProfile(null);
      return null;
    }

    try {
      const therapistRef = doc(db, "therapists", therapistUid);
      const therapistSnap = await getDoc(therapistRef);

      if (therapistSnap.exists()) {
        const therapistData = therapistSnap.data();

        const mergedTherapist = {
          therapistUid,
          therapistName:
            therapistData.name ||
            childFallbackData.therapistName ||
            "Not assigned",
          therapistEmail:
            therapistData.email || childFallbackData.therapistEmail || "N/A",
          therapistContact:
            therapistData.contact || childFallbackData.therapistContact || "N/A",
          therapistId:
            therapistData.therapistId || childFallbackData.therapistId || "N/A",
          therapistImageUrl:
            therapistData.imageUrl ||
            childFallbackData.therapistImageUrl ||
            "",
          slmcNumber: therapistData.slmcNumber || "N/A",
          experience: therapistData.experience || "N/A",
          specialization: therapistData.specialization || "N/A",
          availableOnline: !!therapistData.availableOnline,
        };

        setTherapistProfile(mergedTherapist);
        return mergedTherapist;
      }

      const fallbackTherapist = {
        therapistUid,
        therapistName: childFallbackData.therapistName || "Not assigned",
        therapistEmail: childFallbackData.therapistEmail || "N/A",
        therapistContact: childFallbackData.therapistContact || "N/A",
        therapistId: childFallbackData.therapistId || "N/A",
        therapistImageUrl: childFallbackData.therapistImageUrl || "",
        slmcNumber: "N/A",
        experience: "N/A",
        specialization: "N/A",
        availableOnline: false,
      };

      setTherapistProfile(fallbackTherapist);
      return fallbackTherapist;
    } catch (error) {
      console.log("Error fetching therapist profile:", error);

      const fallbackTherapist = {
        therapistUid,
        therapistName: childFallbackData.therapistName || "Not assigned",
        therapistEmail: childFallbackData.therapistEmail || "N/A",
        therapistContact: childFallbackData.therapistContact || "N/A",
        therapistId: childFallbackData.therapistId || "N/A",
        therapistImageUrl: childFallbackData.therapistImageUrl || "",
        slmcNumber: "N/A",
        experience: "N/A",
        specialization: "N/A",
        availableOnline: false,
      };

      setTherapistProfile(fallbackTherapist);
      return fallbackTherapist;
    }
  };

  const handleViewChild = async (child) => {
    try {
      setSelectedChild(child);

      const sessionsQuery = query(
        collection(db, "sessions"),
        where("childId", "==", child.id)
      );

      const sessionsSnapshot = await getDocs(sessionsQuery);

      const sessions = sessionsSnapshot.docs.map((sessionDoc) => ({
        id: sessionDoc.id,
        ...sessionDoc.data(),
      }));

      const sortedSessions = [...sessions].sort((a, b) => {
        const aTime = a.startedAt?.seconds || 0;
        const bTime = b.startedAt?.seconds || 0;
        return aTime - bTime;
      });

      let progressPayload = null;

      if (sortedSessions.length > 0) {
        const totalScore = sortedSessions.reduce(
          (sum, session) => sum + Number(session.overallScore || 0),
          0
        );

        const avgProgress = Math.round(totalScore / sortedSessions.length);
        const latestSession = sortedSessions[sortedSessions.length - 1];

        const totalCompletedItems = sortedSessions.reduce(
          (sum, session) => sum + Number(session.attemptedItems || 0),
          0
        );

        const totalItems = sortedSessions.reduce(
          (sum, session) =>
            sum +
            Number(
              session.totalItems ||
                session.totalLevelItems ||
                session.assignedItemsCount ||
                session.attemptedItems ||
                0
            ),
          0
        );

        progressPayload = {
          overallProgress: avgProgress,
          currentMode:
            latestSession.sessionMode ||
            latestSession.mode ||
            latestSession.currentMode ||
            "Therapy",
          totalCompletedItems,
          totalItems,
        };
      }

      setReportData(progressPayload);

      const timelineSnap = await getDocs(
        collection(db, "children", child.id, "timeline")
      );

      const timelineData = timelineSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        })
        .slice(0, 5);

      setRecentTimeline(timelineData);

      await fetchLatestTherapistProfile(child.therapistUid, child);

      setEditChildForm({
        childName: child.childName || "",
        age: child.age ? String(child.age) : "",
        gender: child.gender || "",
      });

      setEditChildImagePreview(child.childImageUrl || "");
      setEditChildImageAsset(null);
      setEditingChild(false);
      setShowDetailsModal(true);
    } catch (error) {
      console.log("Error loading child details:", error);
      showToast("❌ Failed to load child details.");
    }
  };

  const requestImage = async (forEdit = false) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow photo access.");
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

    if (forEdit) {
      setEditChildImageAsset(asset);
      setEditChildImagePreview(asset.uri);
    } else {
      setChildImageAsset(asset);
      setChildImagePreview(asset.uri);
    }
  };

  const uploadImageFromUri = async (uri, path) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleAddChild = async () => {
    const user = auth.currentUser;
    if (!user) {
      showToast("❌ Parent account not found.");
      return;
    }

    if (!childForm.childName.trim()) {
      showToast("❌ Please enter child name.");
      return;
    }

    if (!childForm.age) {
      showToast("❌ Please enter child age.");
      return;
    }

    if (!childForm.gender) {
      showToast("❌ Please select child gender.");
      return;
    }

    if (!childImageAsset?.uri) {
      showToast("❌ Please choose a child image.");
      return;
    }

    try {
      setSavingChild(true);

      const parentRef = doc(db, "parents", user.uid);
      const parentSnap = await getDoc(parentRef);
      const parentData = parentSnap.exists() ? parentSnap.data() : {};

      const generatedChildCode = await generateChildCodeFromCounter();

      const fileName = `${Date.now()}-child.jpg`;
      const childImageUrl = await uploadImageFromUri(
        childImageAsset.uri,
        `children/${user.uid}/${fileName}`
      );

      const childRef = await addDoc(collection(db, "children"), {
        childName: childForm.childName.trim(),
        childCode: generatedChildCode,
        age: Number(childForm.age),
        gender: childForm.gender,
        childImageUrl,

        parentUid: user.uid,
        parentName: parentData.name || "Parent",
        parentEmail: parentData.email || user.email || "",
        parentId: parentData.parentId || "",
        parentContact: parentData.contact || parentData.phone || "",

        therapistUid: "",
        therapistName: "",
        therapistEmail: "",
        therapistContact: "",
        therapistId: "",
        therapistImageUrl: "",

        assignedLevelId: "",
        assignedLevelName: "",

        deviceAssigned: false,
        deviceId: "",
        deviceCode: "",
        deviceName: "",
        deviceStatus: "Not Assigned",

        todaySessionCount: 0,
        lastSessionDate: "",

        status: "active",
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "children", childRef.id, "timeline"), {
        title: "Child profile created",
        description: `${childForm.childName.trim()} was added by parent with code ${generatedChildCode}.`,
        createdAt: serverTimestamp(),
      });

      setChildForm({
        childName: "",
        age: "",
        gender: "",
      });
      setChildImageAsset(null);
      setChildImagePreview("");
      setShowAddChildForm(false);

      showToast("✅ Child added successfully.");
      await fetchChildren();
    } catch (error) {
      console.log("Error adding child:", error);
      showToast("❌ Failed to add child.");
    } finally {
      setSavingChild(false);
    }
  };

  const handleUpdateChild = async () => {
    if (!selectedChild) {
      showToast("❌ No child selected.");
      return;
    }

    if (!editChildForm.childName.trim()) {
      showToast("❌ Please enter child name.");
      return;
    }

    if (!editChildForm.age) {
      showToast("❌ Please enter child age.");
      return;
    }

    if (!editChildForm.gender) {
      showToast("❌ Please select child gender.");
      return;
    }

    try {
      setUpdatingChild(true);

      let updatedImageUrl = selectedChild.childImageUrl || "";

      if (editChildImageAsset?.uri) {
        const user = auth.currentUser;
        const fileName = `${Date.now()}-child-edit.jpg`;
        updatedImageUrl = await uploadImageFromUri(
          editChildImageAsset.uri,
          `children/${user.uid}/${fileName}`
        );
      }

      await updateDoc(doc(db, "children", selectedChild.id), {
        childName: editChildForm.childName.trim(),
        age: Number(editChildForm.age),
        gender: editChildForm.gender,
        childImageUrl: updatedImageUrl,
      });

      await addDoc(collection(db, "children", selectedChild.id, "timeline"), {
        title: "Child profile updated",
        description: `${editChildForm.childName.trim()}'s information was updated by parent.`,
        createdAt: serverTimestamp(),
      });

      showToast("✅ Child information updated successfully.");
      setEditingChild(false);
      await fetchChildren();

      const updatedChildDoc = await getDoc(doc(db, "children", selectedChild.id));
      if (updatedChildDoc.exists()) {
        await handleViewChild({
          id: updatedChildDoc.id,
          ...updatedChildDoc.data(),
        });
      }
    } catch (error) {
      console.log("Error updating child:", error);
      showToast("❌ Failed to update child.");
    } finally {
      setUpdatingChild(false);
    }
  };

  const getTodaySessionCount = async (child) => {
    const todayKey = getTodayKey();

    try {
      const dailyUsageRef = doc(db, "children", child.id, "dailyUsage", todayKey);
      const dailyUsageSnap = await getDoc(dailyUsageRef);

      if (dailyUsageSnap.exists()) {
        const dailyData = dailyUsageSnap.data();
        return Number(dailyData.sessionCount || 0);
      }
    } catch {
      console.log("No dailyUsage doc found, using fallback fields.");
    }

    if (child.lastSessionDate === todayKey) {
      return Number(child.todaySessionCount || 0);
    }

    return 0;
  };

  const checkDeviceAccessRules = async (child) => {
    if (!child) {
      return { allowed: false, reason: "Child not selected." };
    }

    if (!child.deviceAssigned) {
      return {
        allowed: false,
        reason: "No device is assigned to this child.",
      };
    }

    if (!child.deviceId && !child.deviceCode) {
      return {
        allowed: false,
        reason: "Assigned device information is incomplete.",
      };
    }

    if (
      child.deviceStatus &&
      !["Assigned", "Active", "Ready"].includes(child.deviceStatus)
    ) {
      return {
        allowed: false,
        reason: `Device cannot be opened because status is ${child.deviceStatus}.`,
      };
    }

    if (!child.therapistUid) {
      return {
        allowed: false,
        reason: "A therapist must be assigned before opening the device.",
      };
    }

    if (!child.assignedLevelId && !child.assignedLevelName) {
      return {
        allowed: false,
        reason: "A therapy level must be assigned before opening the device.",
      };
    }

    const planSnap = await getDoc(doc(db, "therapyPlans", child.id));
    const latestPlan = planSnap.exists() ? planSnap.data() : null;

    if (!latestPlan) {
      return {
        allowed: false,
        reason: "No therapy plan found for this child.",
      };
    }

    const maxSessionsPerDay = Number(latestPlan.maxSessionsPerDay || 0);
    const lockTherapyAfterLimit = !!latestPlan.lockTherapyAfterLimit;
    const fallbackMode = latestPlan.fallbackMode || "companion";

    const todaySessionCount = await getTodaySessionCount(child);

    if (
      maxSessionsPerDay > 0 &&
      todaySessionCount >= maxSessionsPerDay &&
      lockTherapyAfterLimit
    ) {
      return {
        allowed: false,
        reason: `Daily therapy limit reached. Allowed sessions: ${maxSessionsPerDay}. Fallback mode: ${fallbackMode}.`,
      };
    }

    const inAllowedTime = isWithinTherapyTime(
      latestPlan.therapyStartTime,
      latestPlan.therapyEndTime
    );

    if (!inAllowedTime) {
      return {
        allowed: false,
        reason: `Device can only be opened during therapy time (${latestPlan.therapyStartTime || "--"} - ${latestPlan.therapyEndTime || "--"}).`,
      };
    }

    return {
      allowed: true,
      reason: "Device access granted.",
      therapyPlanData: latestPlan,
      todaySessionCount,
    };
  };

  const handleOpenDevice = async (child) => {
    try {
      const result = await checkDeviceAccessRules(child);

      if (!result.allowed) {
        showToast(`⚠️ ${result.reason}`);
        return;
      }

      showToast("✅ Opening assigned device...");

      navigation.navigate("DeviceScreen", {
        childId: child.id,
        childName: child.childName,
        childCode: child.childCode,
        deviceId: child.deviceId || child.deviceCode,
        deviceCode: child.deviceCode || child.deviceId,
        deviceName: child.deviceName || "Assigned Device",
        therapistUid: child.therapistUid || "",
        assignedLevelId: child.assignedLevelId || "",
        therapyPlan: result.therapyPlanData || null,
      });
    } catch (error) {
      console.log("Error opening device:", error);
      showToast("❌ Failed to open assigned device.");
    }
  };

  const formatDate = (value) => {
    if (!value) return "No date";
    try {
      const date = value?.toDate ? value.toDate() : new Date(value);
      return date.toLocaleDateString();
    } catch {
      return "Invalid date";
    }
  };

  const childCountText = useMemo(
    () => `${childrenList.length} child${childrenList.length === 1 ? "" : "ren"}`,
    [childrenList.length]
  );

  return (
    <View style={styles.page}>
      <ParentHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#f8fffe", "#eefaf7", "#f6fbff"]}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.pageTitle}>Child Information</Text>
              <Text style={styles.pageSubtitle}>
                Manage children, view full profiles, update child info, and open
                assigned devices safely.
              </Text>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>{childCountText}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.addChildBtn}
              onPress={() => setShowAddChildForm((prev) => !prev)}
            >
              <Text style={styles.addChildBtnText}>
                {showAddChildForm ? "Close Form" : "+ Add Child"}
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {!!message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        {showAddChildForm && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Add New Child</Text>
            <Text style={styles.sectionSubtitle}>
              Create a new child profile with image and basic details.
            </Text>

            <TextInput
              placeholder="Child Name"
              placeholderTextColor="#8a97a6"
              value={childForm.childName}
              onChangeText={(text) =>
                setChildForm((prev) => ({ ...prev, childName: text }))
              }
              style={styles.input}
            />

            <TextInput
              placeholder="Age"
              placeholderTextColor="#8a97a6"
              keyboardType="number-pad"
              value={childForm.age}
              onChangeText={(text) =>
                setChildForm((prev) => ({ ...prev, age: text }))
              }
              style={styles.input}
            />

            <View style={styles.genderRow}>
              {genderOptions.map((item) => {
                const selected = childForm.gender === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[styles.genderBtn, selected && styles.genderBtnActive]}
                    onPress={() =>
                      setChildForm((prev) => ({ ...prev, gender: item }))
                    }
                  >
                    <Text
                      style={[
                        styles.genderBtnText,
                        selected && styles.genderBtnTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.imagePickerBtn}
              onPress={() => requestImage(false)}
            >
              <Text style={styles.imagePickerBtnText}>Choose Image</Text>
            </TouchableOpacity>

            {!!childImagePreview && (
              <Image source={{ uri: childImagePreview }} style={styles.previewImage} />
            )}

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleAddChild}
              disabled={savingChild}
            >
              {savingChild ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Child</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading child information...</Text>
          </View>
        ) : childrenList.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyEmoji}>🧸</Text>
            <Text style={styles.emptyTitle}>No children added yet</Text>
            <Text style={styles.emptyText}>
              Tap “Add Child” to create the first child profile.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Children List</Text>
            <Text style={styles.sectionSubtitle}>
              Select a child card and open more details.
            </Text>

            <View style={styles.childrenGrid}>
              {childrenList.map((child) => {
                const active = selectedChild?.id === child.id;

                return (
                  <View
                    key={child.id}
                    style={[styles.childCard, active && styles.childCardActive]}
                  >
                    <LinearGradient
                      colors={["rgba(46,196,182,0.12)", "rgba(123,224,214,0.08)"]}
                      style={styles.childTopAccent}
                    />

                    <View style={styles.childTop}>
                      {child.childImageUrl ? (
                        <Image
                          source={{ uri: child.childImageUrl }}
                          style={styles.childAvatar}
                        />
                      ) : (
                        <View style={styles.childAvatarPlaceholder}>
                          <Text style={styles.childAvatarPlaceholderText}>🧒</Text>
                        </View>
                      )}

                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>
                          {child.status || "active"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.childName}>{child.childName || "Child"}</Text>

                    <View style={styles.miniInfoList}>
                      <MiniInfo label="Code" value={child.childCode || "N/A"} />
                      <MiniInfo label="Age" value={child.age || "N/A"} />
                      <MiniInfo
                        label="Level"
                        value={child.assignedLevelName || "Not assigned"}
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.moreBtn}
                      onPress={() => handleViewChild(child)}
                    >
                      <Text style={styles.moreBtnText}>More</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deviceBtn}
                      onPress={() => handleOpenDevice(child)}
                    >
                      <Text style={styles.deviceBtnText}>Open Device</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showDetailsModal && !!selectedChild}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowDetailsModal(false);
          setEditingChild(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowDetailsModal(false);
            setEditingChild(false);
          }}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Child Information</Text>
                <Text style={styles.modalSubtitle}>
                  View complete child details and update profile information.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => {
                  setShowDetailsModal(false);
                  setEditingChild(false);
                }}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!editingChild ? (
                <>
                  <View style={styles.detailHeroCard}>
                    <View style={styles.detailHeroLeft}>
                      {selectedChild?.childImageUrl ? (
                        <Image
                          source={{ uri: selectedChild.childImageUrl }}
                          style={styles.detailImage}
                        />
                      ) : (
                        <View style={[styles.detailImage, styles.detailImagePlaceholder]}>
                          <Text style={styles.detailImagePlaceholderText}>🧒</Text>
                        </View>
                      )}

                      <View style={styles.detailTextWrap}>
                        <Text style={styles.detailName}>
                          {selectedChild?.childName || "Child"}
                        </Text>
                        <Text style={styles.detailLine}>
                          Child Code: {selectedChild?.childCode || "N/A"}
                        </Text>
                        <Text style={styles.detailLine}>
                          Age: {selectedChild?.age || "N/A"}
                        </Text>
                        <Text style={styles.detailLine}>
                          Gender: {selectedChild?.gender || "N/A"}
                        </Text>
                        <Text style={styles.detailLine}>
                          Status: {selectedChild?.status || "N/A"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailActions}>
                      <TouchableOpacity
                        style={styles.primaryAction}
                        onPress={() => setEditingChild(true)}
                      >
                        <Text style={styles.primaryActionText}>Edit Child Info</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.secondaryAction}
                        onPress={() => handleOpenDevice(selectedChild)}
                      >
                        <Text style={styles.secondaryActionText}>Open Device</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <InfoCard title="Assigned Level">
                    <InfoLine
                      label="Level"
                      value={selectedChild?.assignedLevelName || "Not assigned"}
                    />
                    <InfoLine
                      label="Current Progress"
                      value={`${reportData?.overallProgress ?? 0}%`}
                    />
                    <InfoLine
                      label="Current Mode"
                      value={reportData?.currentMode || "N/A"}
                    />
                    <InfoLine
                      label="Completed Items"
                      value={`${reportData?.totalCompletedItems ?? 0}/${reportData?.totalItems ?? 0}`}
                    />
                  </InfoCard>

                  <InfoCard title="Assigned Therapist">
                    <InfoLine
                      label="Name"
                      value={
                        therapistProfile?.therapistName ||
                        selectedChild?.therapistName ||
                        "Not assigned"
                      }
                    />
                    <InfoLine
                      label="Therapist ID"
                      value={
                        therapistProfile?.therapistId ||
                        selectedChild?.therapistId ||
                        "N/A"
                      }
                    />
                    <InfoLine
                      label="Email"
                      value={
                        therapistProfile?.therapistEmail ||
                        selectedChild?.therapistEmail ||
                        "N/A"
                      }
                    />
                    <InfoLine
                      label="Contact"
                      value={
                        therapistProfile?.therapistContact ||
                        selectedChild?.therapistContact ||
                        "N/A"
                      }
                    />
                    <InfoLine
                      label="SLMC Number"
                      value={therapistProfile?.slmcNumber || "N/A"}
                    />
                    <InfoLine
                      label="Specialization"
                      value={therapistProfile?.specialization || "N/A"}
                    />
                  </InfoCard>

                  <InfoCard title="Parent Link">
                    <InfoLine
                      label="Parent Name"
                      value={selectedChild?.parentName || "N/A"}
                    />
                    <InfoLine
                      label="Parent ID"
                      value={selectedChild?.parentId || "N/A"}
                    />
                    <InfoLine
                      label="Email"
                      value={selectedChild?.parentEmail || "N/A"}
                    />
                    <InfoLine
                      label="Contact"
                      value={selectedChild?.parentContact || "N/A"}
                    />
                  </InfoCard>

                  <InfoCard title="Assigned Device">
                    <InfoLine
                      label="Assigned"
                      value={selectedChild?.deviceAssigned ? "Yes" : "No"}
                    />
                    <InfoLine
                      label="Device ID"
                      value={selectedChild?.deviceId || "N/A"}
                    />
                    <InfoLine
                      label="Device Code"
                      value={selectedChild?.deviceCode || "N/A"}
                    />
                    <InfoLine
                      label="Device Name"
                      value={selectedChild?.deviceName || "N/A"}
                    />
                    <InfoLine
                      label="Status"
                      value={selectedChild?.deviceStatus || "N/A"}
                    />
                  </InfoCard>

                  <InfoCard title="Recent Updates">
                    {recentTimeline.length === 0 ? (
                      <Text style={styles.emptyInlineText}>No recent updates yet.</Text>
                    ) : (
                      recentTimeline.map((item) => (
                        <View key={item.id} style={styles.timelineItem}>
                          <View style={styles.timelineDot} />
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>
                              {item.title || "Update"}
                            </Text>
                            <Text style={styles.timelineDescription}>
                              {item.description || "No description available."}
                            </Text>
                            <Text style={styles.timelineDate}>
                              {formatDate(item.createdAt)}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </InfoCard>
                </>
              ) : (
                <InfoCard title="Edit Child Information">
                  <Text style={styles.sectionSubtitle}>
                    Update basic child details without changing the rest of the page flow.
                  </Text>

                  <TextInput
                    placeholder="Child Name"
                    placeholderTextColor="#8a97a6"
                    value={editChildForm.childName}
                    onChangeText={(text) =>
                      setEditChildForm((prev) => ({ ...prev, childName: text }))
                    }
                    style={styles.input}
                  />

                  <TextInput
                    placeholder="Age"
                    placeholderTextColor="#8a97a6"
                    keyboardType="number-pad"
                    value={editChildForm.age}
                    onChangeText={(text) =>
                      setEditChildForm((prev) => ({ ...prev, age: text }))
                    }
                    style={styles.input}
                  />

                  <View style={styles.genderRow}>
                    {genderOptions.map((item) => {
                      const selected = editChildForm.gender === item;
                      return (
                        <TouchableOpacity
                          key={item}
                          style={[
                            styles.genderBtn,
                            selected && styles.genderBtnActive,
                          ]}
                          onPress={() =>
                            setEditChildForm((prev) => ({
                              ...prev,
                              gender: item,
                            }))
                          }
                        >
                          <Text
                            style={[
                              styles.genderBtnText,
                              selected && styles.genderBtnTextActive,
                            ]}
                          >
                            {item}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={styles.imagePickerBtn}
                    onPress={() => requestImage(true)}
                  >
                    <Text style={styles.imagePickerBtnText}>Change Image</Text>
                  </TouchableOpacity>

                  {!!editChildImagePreview && (
                    <Image
                      source={{ uri: editChildImagePreview }}
                      style={styles.previewImage}
                    />
                  )}

                  <View style={styles.editActionRow}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => {
                        setEditingChild(false);
                        setEditChildForm({
                          childName: selectedChild?.childName || "",
                          age: selectedChild?.age
                            ? String(selectedChild.age)
                            : "",
                          gender: selectedChild?.gender || "",
                        });
                        setEditChildImagePreview(
                          selectedChild?.childImageUrl || ""
                        );
                        setEditChildImageAsset(null);
                      }}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={handleUpdateChild}
                      disabled={updatingChild}
                    >
                      {updatingChild ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.saveBtnText}>Update Child</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </InfoCard>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MiniInfo({ label, value }) {
  return (
    <View style={styles.miniInfoRow}>
      <Text style={styles.miniInfoLabel}>{label}</Text>
      <Text style={styles.miniInfoValue}>{value}</Text>
    </View>
  );
}

function InfoCard({ title, children }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoLine({ label, value }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f4fbfa",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },

  heroCard: {
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    ...shadows.card,
  },
  heroTopRow: {
    gap: 16,
  },
  heroTextWrap: {
    gap: 10,
  },
  pageTitle: {
    fontSize: 29,
    fontWeight: "900",
    color: "#16323f",
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: "#62717e",
  },
  heroPill: {
    alignSelf: "flex-start",
    backgroundColor: "#e6fffa",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  heroPillText: {
    color: "#0f766e",
    fontWeight: "800",
    fontSize: 12,
  },

  addChildBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignSelf: "flex-start",
    ...shadows.soft,
  },
  addChildBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  messageBox: {
    backgroundColor: "#f0fdfa",
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 16,
    ...shadows.card,
  },
  messageText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 20,
  },

  formCard: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: "#6b7280",
    lineHeight: 21,
    marginBottom: 14,
    fontSize: 13,
  },

  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d7e2e5",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
    color: "#1f2937",
    fontSize: 14,
    marginBottom: 12,
  },

  genderRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  genderBtn: {
    flex: 1,
    backgroundColor: "#eef3f4",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  genderBtnActive: {
    backgroundColor: colors.primary,
  },
  genderBtnText: {
    color: "#374151",
    fontWeight: "700",
  },
  genderBtnTextActive: {
    color: "#fff",
  },

  imagePickerBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  imagePickerBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#dbe4e4",
    backgroundColor: "#eef2f3",
  },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
    ...shadows.soft,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  stateCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    gap: 12,
    ...shadows.card,
  },
  stateText: {
    color: "#4b5563",
    fontWeight: "700",
  },

  emptyStateCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    ...shadows.card,
  },
  emptyEmoji: {
    fontSize: 42,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 6,
  },
  emptyText: {
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
  },

  childrenGrid: {
    gap: 16,
    marginTop: 8,
  },
  childCard: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 24,
    padding: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    ...shadows.card,
  },
  childCardActive: {
    borderColor: colors.primary,
  },
  childTopAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 88,
  },
  childTop: {
    alignItems: "center",
    zIndex: 2,
  },
  childAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    borderColor: "#fff",
    marginTop: 6,
    marginBottom: 14,
    backgroundColor: "#eef2f3",
  },
  childAvatarPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    borderColor: "#fff",
    marginTop: 6,
    marginBottom: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  childAvatarPlaceholderText: {
    fontSize: 34,
    color: "#fff",
  },
  statusBadge: {
    backgroundColor: "#e6fffa",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  statusBadgeText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  childName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#17303d",
    textAlign: "center",
    marginBottom: 14,
  },

  miniInfoList: {
    gap: 10,
    marginBottom: 16,
  },
  miniInfoRow: {
    backgroundColor: "#f8fbfb",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  miniInfoLabel: {
    color: "#17303d",
    fontWeight: "800",
    fontSize: 13,
  },
  miniInfoValue: {
    color: "#4b5563",
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },

  moreBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
    ...shadows.soft,
  },
  moreBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  deviceBtn: {
    backgroundColor: "#ffd9a8",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  deviceBtnText: {
    color: "#6a3b00",
    fontWeight: "800",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(9,18,27,0.5)",
    justifyContent: "center",
    padding: 14,
  },
  modalCard: {
    maxHeight: "92%",
    backgroundColor: "#fcfffe",
    borderRadius: 28,
    padding: 18,
    ...shadows.card,
  },
  modalHeader: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#16323f",
    marginBottom: 4,
  },
  modalSubtitle: {
    color: "#6b7280",
    lineHeight: 20,
    fontSize: 13,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#f3f7f8",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#374151",
    fontSize: 18,
    fontWeight: "800",
  },

  detailHeroCard: {
    backgroundColor: "rgba(46,196,182,0.10)",
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
  },
  detailHeroLeft: {
    gap: 16,
    marginBottom: 16,
  },
  detailImage: {
    width: 118,
    height: 118,
    borderRadius: 24,
    backgroundColor: "#eef2f3",
  },
  detailImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  detailImagePlaceholderText: {
    color: "#fff",
    fontSize: 42,
  },
  detailTextWrap: {
    gap: 5,
  },
  detailName: {
    fontSize: 28,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 4,
  },
  detailLine: {
    color: "#4b5563",
    lineHeight: 20,
    fontSize: 14,
  },
  detailActions: {
    gap: 10,
  },
  primaryAction: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    ...shadows.soft,
  },
  primaryActionText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryAction: {
    backgroundColor: "#ffd9a8",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  secondaryActionText: {
    color: "#6a3b00",
    fontWeight: "800",
  },

  infoCard: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    ...shadows.card,
  },
  infoCardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1f2937",
    marginBottom: 12,
  },
  infoLine: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f5",
  },
  infoLabel: {
    color: "#17303d",
    fontWeight: "800",
    fontSize: 13,
    marginBottom: 4,
  },
  infoValue: {
    color: "#4b5563",
    lineHeight: 20,
    fontSize: 14,
  },

  timelineItem: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: "#f9fdfc",
    borderWidth: 1,
    borderColor: "#e2f2ef",
    borderRadius: 18,
    padding: 14,
  },
  timelineTitle: {
    color: "#1f2937",
    fontWeight: "800",
    marginBottom: 6,
  },
  timelineDescription: {
    color: "#4b5563",
    lineHeight: 20,
    marginBottom: 8,
  },
  timelineDate: {
    fontSize: 12,
    color: "#6b7280",
  },
  emptyInlineText: {
    color: "#6b7280",
  },

  editActionRow: {
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    backgroundColor: "#f3f4f6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#374151",
    fontWeight: "800",
  },
});