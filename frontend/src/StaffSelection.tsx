import React from 'react';
import { useNavigate } from 'react-router-dom';
function StaffSelection() {
  const navigate = useNavigate();
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
            Staff Portal
          </h1>
          <p style={{ color: '#4b5563' }}>
            QueueFlow Management
          </p>
        </div>
        <div className="text-center mb-6">
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '600', 
            marginBottom: '2rem',
            color: '#1f2937'
          }}>
            Choose an Option
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            onClick={() => navigate('/staff/login')}
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
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            Login to Existing Account
          </button>
          <button
            onClick={() => navigate('/staff/register')}
            className="btn"
            style={{
              backgroundColor: '#16a34a',
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            Register New Worker Account
          </button>
        </div>
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="btn btn-secondary"
            style={{ padding: '0.75rem 2rem',
              gap: '0.5rem',
              marginTop: '10px' }}
          >
            ← Back to Role Selection
          </button>
        </div>
      </div>
    </div>
  );
}
export default StaffSelection;
