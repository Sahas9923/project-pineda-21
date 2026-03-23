import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import ParentDashboard from "./pages/ParentDashboard";
import TherapistDashboard from "./pages/TherapistDashboard";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/parent-dashboard" element={<ParentDashboard />} />
        <Route path="/therapist-dashboard" element={<TherapistDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;