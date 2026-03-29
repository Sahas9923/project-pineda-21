import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/Auth/LoginScreen";

import ParentDashboard from "../screens/Parent/ParentDashboard";
import ChildInfoScreen from "../screens/Parent/ChildInfoScreen";
import DeviceScreen from "../screens/Device/DeviceScreen";
import ProgressScreen from "../screens/Parent/ProgressScreen";
import ParentSettingsScreen from "../screens/Parent/ParentSettingsScreen";

import TherapistDashboard from "../screens/Therapist/TherapistDashboard";
import PatientsScreen from "../screens/Therapist/PatientsScreen";
import TherapistProgressScreen from "../screens/Therapist/TherapistProgressScreen";
import TherapistSettingsScreen from "../screens/Therapist/TherapistSettingsScreen";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />

        <Stack.Screen name="ParentDashboard" component={ParentDashboard} />
        <Stack.Screen name="ChildInfoScreen" component={ChildInfoScreen} />
        <Stack.Screen name="DeviceScreen" component={DeviceScreen} />
        <Stack.Screen name="ProgressScreen" component={ProgressScreen} />
        <Stack.Screen name="ParentSettings" component={ParentSettingsScreen} />

        <Stack.Screen name="TherapistDashboard" component={TherapistDashboard} />
        <Stack.Screen name="PatientsScreen" component={PatientsScreen} />
        <Stack.Screen
          name="TherapistProgressScreen"
          component={TherapistProgressScreen}
        />
        <Stack.Screen
          name="TherapistSettings"
          component={TherapistSettingsScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}