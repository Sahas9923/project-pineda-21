import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Home from "./pages/Login";
import ParentDashboard from "./pages/ParentDashboard";
import Practice from "./pages/Practice";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/parent-dashboard" element={<ParentDashboard />} />
        <Route path="/practice" element={<Practice />} />
      </Routes>
    </Router>
  );
}

export default App;