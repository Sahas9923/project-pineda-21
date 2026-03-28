import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import ParentDashboard from "./pages/ParentDashboard";
import ParentSettings from "./pages/ParentSettings";
import TherapistDashboard from "./pages/TherapistDashboard";
import TherapistSettings from "./pages/TherapistSettings";
import AdminDashboard from "./pages/AdminDashboard";
import Patients from "./pages/Patients";
import ChildInfo from "./pages/ChildInfo";
import DevicePage from "./pages/DevicePage";
import Device from "./pages/Device";
import Test from "./pages/TestEsp";



function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/parent-dashboard" element={<ParentDashboard />} />
        <Route path="/parent-settings" element={<ParentSettings />} />
        <Route path="/therapist-dashboard" element={<TherapistDashboard />} />
        <Route path="/settings" element={<TherapistSettings />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/child-info" element={<ChildInfo />} />
        <Route path="/parent/device/:deviceId" element={<DevicePage />} />
        <Route path="/device/:deviceId" element={<Device />} />
        <Route path="/test" element={<Test />} />

      
      </Routes>
    </Router>
  );
}

export default App;