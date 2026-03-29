import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  Pressable,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { auth, db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { colors, radius, shadows } from "../styles/theme";

const TherapistHeader = () => {
  const navigation = useNavigation();
  const [showMenu, setShowMenu] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [therapistData, setTherapistData] = useState({
    name: "Therapist",
    email: "",
    therapistId: "",
    imageUrl: "",
  });

  useEffect(() => {
    const fetchTherapistData = async () => {
      try {
        setLoadingProfile(true);
        const user = auth.currentUser;
        if (!user) return;

        const snap = await getDoc(doc(db, "therapists", user.uid));

        if (snap.exists()) {
          const data = snap.data();
          setTherapistData({
            name: data.name || "Therapist",
            email: data.email || user.email || "",
            therapistId: data.therapistId || "",
            imageUrl: data.imageUrl || "",
          });
        } else {
          setTherapistData({
            name: "Therapist",
            email: user.email || "",
            therapistId: "",
            imageUrl: "",
          });
        }
      } catch (error) {
        console.log("Therapist header fetch error:", error);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchTherapistData();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowMenu(false);
      navigation.replace("Login");
    } catch (error) {
      console.log("Logout error:", error);
    }
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate("TherapistDashboard")}>
          <Text style={styles.logo}>🧸 Pineda Therapist</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => setShowMenu(true)}
        >
          {therapistData.imageUrl ? (
            <Image source={{ uri: therapistData.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarEmoji}>🧑‍⚕️</Text>
            </View>
          )}
          <View style={{ maxWidth: 120 }}>
            <Text style={styles.userName} numberOfLines={1}>
              {loadingProfile ? "Loading..." : therapistData.name}
            </Text>
            <Text style={styles.userRole}>Therapist</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Modal visible={showMenu} animationType="fade" transparent>
        <Pressable style={styles.overlay} onPress={() => setShowMenu(false)}>
          <Pressable style={styles.menu}>
            <View style={styles.menuTop}>
              {therapistData.imageUrl ? (
                <Image source={{ uri: therapistData.imageUrl }} style={styles.menuAvatar} />
              ) : (
                <View style={styles.menuAvatarFallback}>
                  <Text style={styles.avatarEmoji}>🧑‍⚕️</Text>
                </View>
              )}

              <Text style={styles.menuName}>{therapistData.name}</Text>
              <Text style={styles.menuSub}>{therapistData.email || "No email"}</Text>
              <Text style={styles.menuSub}>
                {therapistData.therapistId || "No therapist ID"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate("TherapistSettings");
              }}
            >
              <Text style={styles.menuBtnText}>⚙️ Profile / Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuBtn, styles.logoutBtn]} onPress={handleLogout}>
              <Text style={styles.logoutText}>🚪 Logout</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
  },
  logo: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textDark,
    maxWidth: 180,
  },
  profileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dff7f4",
  },
  avatarEmoji: {
    fontSize: 18,
  },
  userName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textDark,
  },
  userRole: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 78,
    paddingRight: 16,
  },
  menu: {
    width: 280,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: radius.xl,
    padding: 16,
    ...shadows.card,
  },
  menuTop: {
    alignItems: "center",
    marginBottom: 14,
  },
  menuAvatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    marginBottom: 10,
  },
  menuAvatarFallback: {
    width: 66,
    height: 66,
    borderRadius: 33,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dff7f4",
  },
  menuName: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.textDark,
  },
  menuSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  menuBtn: {
    backgroundColor: colors.bgLight,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  menuBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textDark,
  },
  logoutBtn: {
    backgroundColor: "#fff4f4",
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.errorText,
  },
});

export default TherapistHeader;