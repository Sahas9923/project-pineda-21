import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "../screens/Auth/LoginScreen";
import { View, Text } from "react-native";

const Stack = createNativeStackNavigator();

const Placeholder = ({ title }) => (
  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
    <Text style={{ fontSize: 22, fontWeight: "700" }}>{title}</Text>
  </View>
);

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen
          name="ParentDashboard"
          children={() => <Placeholder title="Parent Dashboard" />}
        />
        <Stack.Screen
          name="TherapistDashboard"
          children={() => <Placeholder title="Therapist Dashboard" />}
        />
        <Stack.Screen
          name="ParentSettings"
          children={() => <Placeholder title="Parent Settings" />}
        />
        <Stack.Screen
          name="TherapistSettings"
          children={() => <Placeholder title="Therapist Settings" />}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}