import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PortalSelector from './PortalSelector';
import StaffSelection from './StaffSelection';
import StaffLogin from './StaffLogin';
import StaffRegistration from './StaffRegistration';
import UserInterface from './UserInterface';
import ApplyForm from './ApplyForm';
import StaffDashboard from './StaffDashboard';
import MasterLogin from './MasterLogin';
import MasterDashboard from './MasterDashboard';
import DisplayBoard from './DisplayBoard';
import AdminClaim from './AdminClaim';

const ProtectedStaffRoute = ({ children }: { children: React.ReactNode }) => {
  const staffToken = localStorage.getItem('staffToken');
  return staffToken ? <>{children}</> : <Navigate to="/staff/login" />;
}

function ProtectedMasterRoute({ children }: { children: React.ReactNode }) {
  const masterToken = localStorage.getItem('masterToken');
  return masterToken ? <>{children}</> : <Navigate to="/master/login" />;
}

function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
        <Routes>
          {}
          <Route path="/" element={<PortalSelector />} />
          <Route path="/staff/options" element={<StaffSelection />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/staff/claim-admin" element={<AdminClaim />} />
          <Route path="/staff/register" element={<StaffRegistration />} />
          <Route path="/user-login" element={<UserInterface />} />
          <Route path="/apply" element={<ApplyForm />} />
          <Route path="/display/:serviceId" element={<DisplayBoard />} />
          
          {}
          <Route path="/master/login" element={<MasterLogin />} />
          <Route 
            path="/master/dashboard" 
            element={
              <ProtectedMasterRoute>
                <MasterDashboard />
              </ProtectedMasterRoute>
            } 
          />
          <Route 
            path="/staff/dashboard" 
            element={
              <ProtectedStaffRoute>
                <StaffDashboard />
              </ProtectedStaffRoute>
            } 
          />
          {}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}
export default App;
