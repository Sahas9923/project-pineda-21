import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { auth, db } from "../../firebase/config";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { colors, radius, shadows } from "../../styles/theme";

const teddyPositions = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  left: `${(i * 8) % 90}%`,
  top: 20 + (i % 6) * 55,
}));

export default function LoginScreen() {
  const navigation = useNavigation();

  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState("parent");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });

  const features = useMemo(
    () => [
      "🎯 Improve speech skills",
      "🧠 Smart diagnosis & tracking",
      "🎤 Voice feedback system",
      "👨‍⚕️ Therapist + Parent support",
    ],
    []
  );

  const showMessage = (text, type = "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "" }), 3000);
  };

  const goToDashboard = (userRole) => {
    if (userRole === "parent") {
      navigation.replace("ParentDashboard");
    } else if (userRole === "therapist") {
      navigation.replace("TherapistDashboard");
    } else {
      showMessage("Invalid role.", "error");
    }
  };

  const generateReadableId = async (userRole) => {
    const counterDocId =
      userRole === "parent" ? "parentCounter" : "therapistCounter";
    const prefix = userRole === "parent" ? "PAR" : "THE";
    const counterRef = doc(db, "counters", counterDocId);

    const newCount = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);

      if (!counterSnap.exists()) {
        transaction.set(counterRef, { count: 1 });
        return 1;
      }

      const count = (counterSnap.data().count || 0) + 1;
      transaction.update(counterRef, { count });
      return count;
    });

    return `${prefix}-${String(newCount).padStart(4, "0")}`;
  };

  const createUserDocuments = async (uid, userData) => {
    const readableId = await generateReadableId(userData.role);

    await setDoc(doc(db, "users", uid), {
      name: userData.name,
      email: userData.email,
      role: userData.role,
      readableId,
      createdAt: serverTimestamp(),
    });

    if (userData.role === "parent") {
      await setDoc(doc(db, "parents", uid), {
        parentId: readableId,
        name: userData.name,
        email: userData.email,
        role: "parent",
        contact: "",
        address: "",
        imageUrl: "",
        createdAt: serverTimestamp(),
      });
    }

    if (userData.role === "therapist") {
      await setDoc(doc(db, "therapists", uid), {
        therapistId: readableId,
        name: userData.name,
        email: userData.email,
        role: "therapist",
        contact: "",
        slmcNumber: "",
        experience: "",
        imageUrl: "",
        createdAt: serverTimestamp(),
      });
    }
  };

  const handleSubmit = async () => {
    try {
      if (isRegister) {
        if (!name.trim()) {
          showMessage("Please enter your full name.");
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        await createUserDocuments(userCredential.user.uid, {
          name: name.trim(),
          email: email.trim(),
          role,
        });

        showMessage(
          role === "parent"
            ? "Parent account created successfully!"
            : "Therapist account created successfully!",
          "success"
        );

        setTimeout(() => goToDashboard(role), 700);
      } else {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        const uid = userCredential.user.uid;
        const userDoc = await getDoc(doc(db, "users", uid));

        if (userDoc.exists()) {
          const userRole = userDoc.data().role;
          showMessage("Login successful!", "success");
          setTimeout(() => goToDashboard(userRole), 700);
          return;
        }

        const parentDoc = await getDoc(doc(db, "parents", uid));
        const therapistDoc = await getDoc(doc(db, "therapists", uid));

        if (parentDoc.exists()) {
          showMessage("Login successful!", "success");
          setTimeout(() => goToDashboard("parent"), 700);
        } else if (therapistDoc.exists()) {
          showMessage("Login successful!", "success");
          setTimeout(() => goToDashboard("therapist"), 700);
        } else {
          showMessage("User role not found!");
        }
      }
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        showMessage("This email is already registered.");
      } else if (error.code === "auth/invalid-email") {
        showMessage("Invalid email address.");
      } else if (error.code === "auth/weak-password") {
        showMessage("Password should be at least 6 characters.");
      } else if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        showMessage("Invalid credentials.");
      } else {
        showMessage(error.message || "Something went wrong.");
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[colors.accentGreen, colors.accentTeal, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {teddyPositions.map((item) => (
            <Text
              key={item.id}
              style={[styles.teddy, { left: item.left, top: item.top }]}
            >
              🧸
            </Text>
          ))}

          <View style={styles.heroContent}>
            <Text style={styles.brandTitle}>Pineda</Text>
            <Text style={styles.brandSub}>AI-Powered Speech Therapy Platform</Text>

            {features.map((item) => (
              <View key={item} style={styles.featureCard}>
                <Text style={styles.featureText}>{item}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.formWrap}>
          <View style={styles.card}>
            <View style={styles.logoIcon}>
              <Text style={{ fontSize: 28 }}>🧸</Text>
            </View>

            <Text style={styles.heading}>Welcome to Pineda</Text>
            <Text style={styles.subtitle}>
              {isRegister ? "Create your account" : "Sign in to continue"}
            </Text>

            {!!message.text && (
              <View
                style={[
                  styles.alert,
                  message.type === "success" ? styles.alertSuccess : styles.alertError,
                ]}
              >
                <Text
                  style={[
                    styles.alertText,
                    message.type === "success"
                      ? styles.alertSuccessText
                      : styles.alertErrorText,
                  ]}
                >
                  {message.type === "success" ? "✅ " : "⚠️ "}
                  {message.text}
                </Text>
              </View>
            )}

            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tabBtn, !isRegister && styles.activeBtn]}
                onPress={() => setIsRegister(false)}
              >
                <Text style={[styles.tabText, !isRegister && styles.activeBtnText]}>
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, isRegister && styles.activeBtn]}
                onPress={() => setIsRegister(true)}
              >
                <Text style={[styles.tabText, isRegister && styles.activeBtnText]}>
                  Register
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.roleBtn, role === "parent" && styles.activeBtn]}
                onPress={() => setRole("parent")}
              >
                <Text style={[styles.tabText, role === "parent" && styles.activeBtnText]}>
                  👨‍👩‍👦 Parent
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleBtn, role === "therapist" && styles.activeBtn]}
                onPress={() => setRole("therapist")}
              >
                <Text style={[styles.tabText, role === "therapist" && styles.activeBtnText]}>
                  🧑‍⚕️ Therapist
                </Text>
              </TouchableOpacity>
            </View>

            {isRegister && (
              <TextInput
                placeholder="Full Name"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={name}
                onChangeText={setName}
              />
            )}

            <TextInput
              placeholder="Email"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TextInput
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>
                {isRegister ? "Create Account" : "Sign In"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.googleBtn} disabled>
              <View style={styles.googleIcon}>
                <Text style={{ color: "#4285f4", fontWeight: "800" }}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Google sign-in later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgSoft,
  },
  scroll: {
    flexGrow: 1,
  },
  hero: {
    minHeight: 310,
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 28,
    position: "relative",
    overflow: "hidden",
  },
  teddy: {
    position: "absolute",
    fontSize: 24,
    opacity: 0.22,
  },
  heroContent: {
    zIndex: 2,
  },
  brandTitle: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.white,
    marginBottom: 8,
  },
  brandSub: {
    fontSize: 16,
    lineHeight: 24,
    color: "rgba(255,255,255,0.95)",
    marginBottom: 18,
  },
  featureCard: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  featureText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  formWrap: {
    marginTop: -26,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: radius.xxl,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    ...shadows.card,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#dff7f4",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
    ...shadows.soft,
  },
  heading: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    color: colors.textDark,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  alert: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  alertSuccess: {
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: "#abefc6",
  },
  alertError: {
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  alertText: {
    fontSize: 14,
    fontWeight: "700",
  },
  alertSuccessText: {
    color: colors.successText,
  },
  alertErrorText: {
    color: colors.errorText,
  },
  tabs: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: colors.chipBg,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  roleBtn: {
    flex: 1,
    backgroundColor: colors.chipBg,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  activeBtn: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: "#555",
    fontWeight: "700",
    fontSize: 14,
  },
  activeBtnText: {
    color: colors.white,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#111827",
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 15,
  },
  googleBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.primaryLight,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 14,
  },
});