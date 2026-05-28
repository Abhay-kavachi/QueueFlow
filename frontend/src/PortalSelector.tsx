import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
function PortalSelector() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<'user' | 'admin' | null>(null);
  const handleRoleSelect = (role: 'user' | 'admin') => {
    setSelectedRole(role);
    if (role === 'user') {
      navigate('/user-login');
    } else {
      navigate('/staff/options');
    }
  };
  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f3f4f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div className="card" style={{ maxWidth: '500px', width: '100%' }}>
        <div className="text-center mb-6">
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 'bold', 
            color: '#2563eb',
            marginBottom: '0.5rem'
          }}>
            QueueFlow
          </h1>
          <p style={{ color: '#4b5563' }}>
            Hybrid Appointment + Queue Management System
          </p>
        </div>
        <div className="text-center mb-6">
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '600', 
            marginBottom: '2rem',
            color: '#1f2937'
          }}>
            Select Your Role
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            onClick={() => handleRoleSelect('user')}
            className="btn btn-primary"
            style={{
              padding: '1.5rem',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            User Login
          </button>
          <button
            onClick={() => handleRoleSelect('admin')}
            className="btn"
            style={{
              backgroundColor: '#7c3aed',
              color: 'white',
              padding: '1.5rem',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Staff Portal
          </button>
        </div>
        <div className="text-center mt-6" style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          <p>Select your role to continue</p>
        </div>
      </div>
    </div>
  );
}
export default PortalSelector;
