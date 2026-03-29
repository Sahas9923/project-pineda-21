import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import ParentHeader from "../../components/ParentHeader";
import { auth, db } from "../../firebase/config";
import { colors, radius, shadows } from "../../styles/theme";

const cityCoordinates = {
  Colombo: { lat: 6.9271, lng: 79.8612 },
  Negombo: { lat: 7.2083, lng: 79.8358 },
  Kandy: { lat: 7.2906, lng: 80.6337 },
  Galle: { lat: 6.0535, lng: 80.217 },
  Jaffna: { lat: 9.6615, lng: 80.0074 },
  Kurunegala: { lat: 7.4863, lng: 80.3647 },
  Matara: { lat: 5.9485, lng: 80.546 },
  Anuradhapura: { lat: 8.3114, lng: 80.4037 },
  Batticaloa: { lat: 7.7102, lng: 81.701 },
  London: { lat: 51.5072, lng: -0.1276 },
  Dubai: { lat: 25.2048, lng: 55.2708 },
  Sydney: { lat: -33.8688, lng: 151.2093 },
  Toronto: { lat: 43.6532, lng: -79.3832 },
  Singapore: { lat: 1.3521, lng: 103.8198 },
  NewYork: { lat: 40.7128, lng: -74.006 },
  Melbourne: { lat: -37.8136, lng: 144.9631 },
};

const fallbackFounderOne = "https://via.placeholder.com/200x200.png?text=Sahas";
const fallbackFounderTwo = "https://via.placeholder.com/200x200.png?text=Thilini";
const fallbackTherapist = "https://via.placeholder.com/160x160.png?text=Therapist";

export default function ParentDashboard({ navigation }) {
  const [parentName, setParentName] = useState("Parent");
  const [childrenList, setChildrenList] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [allTherapists, setAllTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const buildTherapistObject = async (therapistId, therapistData) => {
    let allLocations = [];
    let firstLocation = null;

    try {
      const locationsSnapshot = await getDocs(
        collection(db, "therapists", therapistId, "locations")
      );

      if (!locationsSnapshot.empty) {
        allLocations = locationsSnapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        firstLocation =
          allLocations.find((loc) => loc.isPrimary) || allLocations[0] || null;
      }
    } catch (error) {
      console.log("No location data for therapist:", therapistId, error);
    }

    const rawCity = firstLocation?.city || therapistData.city || "Colombo";
    const normalizedCityKey = String(rawCity).replace(/\s+/g, "");
    const matchedCoordinates =
      cityCoordinates[rawCity] ||
      cityCoordinates[normalizedCityKey] ||
      cityCoordinates.Colombo;

    return {
      id: therapistId,
      ...therapistData,
      city: rawCity,
      coordinates: matchedCoordinates,
      locationData: firstLocation,
      locations: allLocations,
      description:
        therapistData.description ||
        "A dedicated speech therapy professional supporting child communication development through guided and structured therapy sessions.",
    };
  };

  const fetchAllTherapists = async () => {
    try {
      const therapistSnapshot = await getDocs(collection(db, "therapists"));

      const therapistResults = await Promise.all(
        therapistSnapshot.docs.map(async (therapistDoc) => {
          return await buildTherapistObject(therapistDoc.id, therapistDoc.data());
        })
      );

      setAllTherapists(therapistResults);
    } catch (error) {
      console.log("Error fetching all therapists:", error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }

      const parentRef = doc(db, "parents", user.uid);
      const parentSnap = await getDoc(parentRef);

      if (parentSnap.exists()) {
        const parentData = parentSnap.data();
        setParentName(parentData.name || "Parent");
      }

      const childQuery = query(
        collection(db, "children"),
        where("parentUid", "==", user.uid)
      );
      const childSnapshot = await getDocs(childQuery);

      const childData = childSnapshot.docs.map((childDoc) => ({
        id: childDoc.id,
        ...childDoc.data(),
      }));

      setChildrenList(childData);

      const uniqueTherapistIds = [
        ...new Set(
          childData
            .map((child) => child.therapistUid)
            .filter((therapistUid) => !!therapistUid)
        ),
      ];

      const therapistResults = await Promise.all(
        uniqueTherapistIds.map(async (therapistUid) => {
          const therapistRef = doc(db, "therapists", therapistUid);
          const therapistSnap = await getDoc(therapistRef);

          if (!therapistSnap.exists()) return null;
          return await buildTherapistObject(therapistUid, therapistSnap.data());
        })
      );

      setTherapists(therapistResults.filter(Boolean));
      await fetchAllTherapists();
    } catch (error) {
      console.log("Error fetching parent dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const therapistCount = therapists.length;
    const childCount = childrenList.length;
    const assignedDeviceCount = childrenList.filter(
      (child) => child.deviceAssigned
    ).length;

    return {
      childCount,
      therapistCount,
      assignedDeviceCount,
    };
  }, [childrenList, therapists]);

  const openMap = async (therapist) => {
    const coords = therapist?.coordinates || cityCoordinates.Colombo;
    const label = therapist?.name || "Therapist";
    const url = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.log(`Unable to open map for ${label}:`, error);
    }
  };

  const openPhone = async (phone) => {
    if (!phone) return;
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch (error) {
      console.log("Unable to open dialer:", error);
    }
  };

  const openEmail = async (email) => {
    if (!email) return;
    try {
      await Linking.openURL(`mailto:${email}`);
    } catch (error) {
      console.log("Unable to open email app:", error);
    }
  };

  return (
    <View style={styles.screen}>
      <ParentHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#f9fffe", "#eefaf7", "#f7fbff"]}
          style={styles.heroSection}
        >
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>🧸 Welcome to Pineda</Text>
          </View>

          <Text style={styles.heroTitle}>Hello, {parentName}</Text>
          <Text style={styles.heroDescription}>
            Track your child’s therapy journey, connect with therapists, and
            explore the people behind the Pineda platform in one modern parent
            dashboard.
          </Text>

          <View style={styles.heroButtons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation?.navigate?.("ChildInfoScreen")}
            >
              <Text style={styles.primaryButtonText}>View Child Info</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation?.navigate?.("ProgressScreen")}
            >
              <Text style={styles.secondaryButtonText}>View Progress</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.missionCard}>
            <Text style={styles.missionTitle}>Pineda Mission</Text>
            <Text style={styles.missionText}>
              Pineda was created to make speech therapy more supportive,
              engaging, and accessible for children, parents, and therapists
              through thoughtful design and modern technology.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          <StatCard icon="👶" value={stats.childCount} label="Registered Children" />
          <StatCard icon="🧑‍⚕️" value={stats.therapistCount} label="Assigned Therapists" />
          <StatCard icon="🧩" value={stats.assignedDeviceCount} label="Assigned Devices" />
        </View>

        <SectionHeader
          title="Therapist Network"
          subtitle="Explore all therapists registered with Pineda. Tap a therapist card below to view details and location."
        />

        <View style={styles.mapCard}>
          <TouchableOpacity
            style={styles.mapPreview}
            onPress={() =>
              openMap(
                selectedTherapist || allTherapists[0] || { coordinates: cityCoordinates.Colombo }
              )
            }
          >
            <LinearGradient
              colors={["#eafcfa", "#f5ffff"]}
              style={styles.mapPreviewInner}
            >
              <Text style={styles.mapEmoji}>📍</Text>
              <Text style={styles.mapTitle}>
                {selectedTherapist
                  ? `${selectedTherapist.name || "Therapist"} - ${selectedTherapist.city || "Colombo"}`
                  : "Therapist Locations"}
              </Text>
              <Text style={styles.mapText}>
                Tap to open therapist location in Google Maps
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {allTherapists.length > 0 ? (
            <View style={styles.therapistList}>
              {allTherapists.map((therapist) => {
                const active = selectedTherapist?.id === therapist.id;

                return (
                  <TouchableOpacity
                    key={therapist.id}
                    activeOpacity={0.92}
                    style={[styles.therapistCard, active && styles.therapistCardActive]}
                    onPress={() => setSelectedTherapist(therapist)}
                  >
                    <View style={styles.therapistTop}>
                      <Image
                        source={{ uri: therapist.imageUrl || fallbackTherapist }}
                        style={styles.therapistImage}
                      />

                      <View style={styles.therapistContent}>
                        <Text style={styles.therapistName} numberOfLines={1}>
                          {therapist.name || "Therapist"}
                        </Text>
                        <Text style={styles.therapistRole} numberOfLines={1}>
                          {therapist.specialization || "Speech Therapist"}
                        </Text>
                        <Text style={styles.therapistCity} numberOfLines={1}>
                          📍 {therapist.city || "Colombo"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaArea}>
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>
                          {therapist.locationData?.placeName || "Location not added"}
                        </Text>
                      </View>
                      <Text style={styles.metaSubtext}>
                        {therapist.locationData?.availableDays || "Days not set"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No therapist locations found yet.</Text>
            </View>
          )}
        </View>

        <SectionHeader
          title="About Pineda"
          subtitle="Built with purpose to support children, families, and therapists through a more human-centered speech therapy experience."
        />

        <View style={styles.aboutCard}>
          <Text style={styles.aboutText}>
            Pineda is an AI-supported speech therapy platform designed to make
            therapy interaction more engaging for children, more informative for
            parents, and more manageable for therapists. The platform combines
            progress visibility, therapist support, and child-friendly digital
            interaction to create a more connected therapy experience.
          </Text>
        </View>

        <View style={styles.founderCard}>
          <Image source={{ uri: fallbackFounderOne }} style={styles.founderImage} />
          <View style={styles.founderContent}>
            <View style={styles.founderBadge}>
              <Text style={styles.founderBadgeText}>Co-Founder & Project Lead</Text>
            </View>
            <Text style={styles.founderName}>Sahas Suraweera</Text>
            <Text style={styles.founderDescription}>
              Sahas Suraweera leads the vision, planning, and overall system
              direction of Pineda. He focuses on building an accessible and
              meaningful solution that supports speech therapy through engaging
              technology, structured progress visibility, and child-friendly interaction.
            </Text>
          </View>
        </View>

        <View style={styles.founderCard}>
          <Image source={{ uri: fallbackFounderTwo }} style={styles.founderImage} />
          <View style={styles.founderContent}>
            <View style={styles.founderBadge}>
              <Text style={styles.founderBadgeText}>
                Co-Founder & Design / Development Lead
              </Text>
            </View>
            <Text style={styles.founderName}>Thilini Piyumika</Text>
            <Text style={styles.founderDescription}>
              Thilini Piyumika contributes to the creative and technical
              development of Pineda, with focus on interface design, user
              experience, and practical system implementation. Her work helps
              ensure the platform remains supportive, clear, and engaging for
              children, parents, and therapists.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedTherapist}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTherapist(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedTherapist(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setSelectedTherapist(null)}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>

            {selectedTherapist && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Image
                    source={{
                      uri: selectedTherapist.imageUrl || fallbackTherapist,
                    }}
                    style={styles.modalImage}
                  />

                  <View style={styles.modalHeaderText}>
                    <Text style={styles.modalName}>
                      {selectedTherapist.name || "Therapist"}
                    </Text>
                    <Text style={styles.modalRoleText}>
                      {selectedTherapist.specialization || "Speech Therapist"}
                    </Text>
                    <Text style={styles.modalCityText}>
                      📍 {selectedTherapist.city || "City not set"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.modalDescription}>
                  {selectedTherapist.description}
                </Text>

                <View style={styles.infoGrid}>
                  <InfoTile
                    label="Phone"
                    value={selectedTherapist.contact || "No contact available"}
                    onPress={() => openPhone(selectedTherapist.contact)}
                  />
                  <InfoTile
                    label="Email"
                    value={selectedTherapist.email || "No email available"}
                    onPress={() => openEmail(selectedTherapist.email)}
                  />
                  <InfoTile
                    label="Days"
                    value={
                      selectedTherapist.locationData?.availableDays || "Days not set"
                    }
                  />
                  <InfoTile
                    label="Time"
                    value={
                      selectedTherapist.locationData?.availableTime || "Time not set"
                    }
                  />
                </View>

                <View style={styles.primaryLocationCard}>
                  <Text style={styles.primaryLocationTitle}>Primary Practice Location</Text>
                  <Text style={styles.primaryLocationText}>
                    {selectedTherapist.locationData?.placeName || "Not specified"}
                  </Text>
                  <Text style={styles.primaryLocationText}>
                    {selectedTherapist.locationData?.address || "No address available"}
                  </Text>

                  <TouchableOpacity
                    style={styles.locationButton}
                    onPress={() => openMap(selectedTherapist)}
                  >
                    <Text style={styles.locationButtonText}>Open in Maps</Text>
                  </TouchableOpacity>
                </View>

                {selectedTherapist.locations?.length > 0 && (
                  <View style={styles.allLocationsSection}>
                    <Text style={styles.allLocationsTitle}>All Uploaded Locations</Text>

                    {selectedTherapist.locations.map((location) => (
                      <View key={location.id} style={styles.singleLocationCard}>
                        <View style={styles.singleLocationHead}>
                          <Text style={styles.singleLocationName}>
                            {location.placeName || "Unnamed Place"}
                          </Text>
                          {location.isPrimary && (
                            <View style={styles.primaryBadge}>
                              <Text style={styles.primaryBadgeText}>Primary</Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.singleLocationText}>
                          Address: {location.address || "N/A"}
                        </Text>
                        <Text style={styles.singleLocationText}>
                          City: {location.city || "N/A"}
                        </Text>
                        <Text style={styles.singleLocationText}>
                          Contact: {location.contactNumber || "N/A"}
                        </Text>
                        <Text style={styles.singleLocationText}>
                          Days: {location.availableDays || "N/A"}
                        </Text>
                        <Text style={styles.singleLocationText}>
                          Time: {location.availableTime || "N/A"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <View style={styles.statCard}>
      <LinearGradient colors={[colors.primary, "#7be0d6"]} style={styles.statIconWrap}>
        <Text style={styles.statIcon}>{icon}</Text>
      </LinearGradient>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoTile({ label, value, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper style={styles.infoTile} onPress={onPress}>
      <Text style={styles.infoTileLabel}>{label}</Text>
      <Text style={styles.infoTileValue}>{value}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgSoft,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 34,
  },

  heroSection: {
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    ...shadows.card,
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#e6fffa",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginBottom: 14,
  },
  heroBadgeText: {
    color: "#0f766e",
    fontWeight: "800",
    fontSize: 12,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 10,
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textMuted,
    marginBottom: 18,
  },
  heroButtons: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 14,
    ...shadows.soft,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: "#ecfeff",
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  secondaryButtonText: {
    color: "#0f766e",
    fontWeight: "800",
    fontSize: 14,
  },
  missionCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "rgba(46,196,182,0.10)",
  },
  missionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#17303d",
    marginBottom: 8,
  },
  missionText: {
    fontSize: 14,
    lineHeight: 23,
    color: "#4b5563",
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 22,
  },
  statCard: {
    flexGrow: 1,
    minWidth: "30%",
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 18,
    alignItems: "flex-start",
    ...shadows.card,
  },
  statIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statIcon: {
    fontSize: 22,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "700",
  },

  sectionHead: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },

  mapCard: {
    backgroundColor: colors.white,
    borderRadius: 26,
    padding: 18,
    marginBottom: 22,
    ...shadows.card,
  },
  mapPreview: {
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 16,
  },
  mapPreviewInner: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  mapEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  mapTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#17303d",
    textAlign: "center",
    marginBottom: 6,
  },
  mapText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },

  therapistList: {
    gap: 14,
  },
  therapistCard: {
    borderWidth: 1,
    borderColor: "#dff1ee",
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
  },
  therapistCardActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(46,196,182,0.08)",
  },
  therapistTop: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  therapistImage: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#eef2f3",
  },
  therapistContent: {
    flex: 1,
  },
  therapistName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#17303d",
    marginBottom: 5,
  },
  therapistRole: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 6,
  },
  therapistCity: {
    fontSize: 13,
    color: "#0f766e",
    fontWeight: "700",
  },
  metaArea: {
    marginTop: 14,
    gap: 8,
  },
  metaChip: {
    alignSelf: "flex-start",
    backgroundColor: "#ecfffb",
    borderWidth: 1,
    borderColor: "#cff3ee",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  metaChipText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
  },
  metaSubtext: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "700",
  },

  emptyBox: {
    marginTop: 4,
    backgroundColor: "#f8fbfb",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e6f1f0",
    padding: 16,
  },
  emptyText: {
    color: colors.textMuted,
    fontWeight: "700",
  },

  aboutCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    ...shadows.card,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 24,
    color: "#4b5563",
  },

  founderCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    ...shadows.card,
  },
  founderImage: {
    width: "100%",
    height: 220,
    borderRadius: 22,
    marginBottom: 16,
    backgroundColor: "#eef2f3",
  },
  founderContent: {
    flex: 1,
  },
  founderBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#e6fffa",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  founderBadgeText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
  },
  founderName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 10,
  },
  founderDescription: {
    fontSize: 14,
    lineHeight: 24,
    color: "#4b5563",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    maxHeight: "88%",
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 20,
    ...shadows.card,
  },
  closeBtn: {
    position: "absolute",
    right: 14,
    top: 14,
    zIndex: 3,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f4f7f7",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.textDark,
    fontWeight: "700",
  },
  modalHeader: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 18,
    paddingRight: 40,
  },
  modalImage: {
    width: 92,
    height: 92,
    borderRadius: 22,
    backgroundColor: "#eef2f3",
  },
  modalHeaderText: {
    flex: 1,
    justifyContent: "center",
  },
  modalName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 6,
  },
  modalRoleText: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 4,
  },
  modalCityText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  modalDescription: {
    color: "#4b5563",
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 18,
  },

  infoGrid: {
    gap: 12,
    marginBottom: 18,
  },
  infoTile: {
    backgroundColor: "#f8fbfb",
    borderRadius: 16,
    padding: 14,
  },
  infoTileLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f766e",
    marginBottom: 6,
  },
  infoTileValue: {
    fontSize: 14,
    color: "#344054",
    lineHeight: 21,
    fontWeight: "600",
  },

  primaryLocationCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: "rgba(46,196,182,0.10)",
    marginBottom: 18,
  },
  primaryLocationTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17303d",
    marginBottom: 10,
  },
  primaryLocationText: {
    color: "#4b5563",
    lineHeight: 22,
    marginBottom: 4,
  },
  locationButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  locationButtonText: {
    color: colors.white,
    fontWeight: "800",
  },

  allLocationsSection: {
    marginTop: 4,
  },
  allLocationsTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#17303d",
    marginBottom: 12,
  },
  singleLocationCard: {
    backgroundColor: "#f9fcfc",
    borderWidth: 1,
    borderColor: "#e4f2f0",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  singleLocationHead: {
    marginBottom: 10,
    gap: 8,
  },
  singleLocationName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#17303d",
  },
  primaryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#e6fffa",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  primaryBadgeText: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900",
  },
  singleLocationText: {
    color: "#4b5563",
    lineHeight: 22,
    fontSize: 14,
    marginBottom: 2,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.card,
  },
  loadingText: {
    color: "#17303d",
    fontWeight: "800",
    fontSize: 14,
  },
});