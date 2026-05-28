import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
function StaffLogin() {
  const navigate = useNavigate();
  const [isWorkerMode, setIsWorkerMode] = useState<boolean>(false);
   const [username, setUsername] = useState<string>('');
   const [password, setPassword] = useState<string>('');
   const [showPassword, setShowPassword] = useState<boolean>(false);
   const [isLoading, setIsLoading] = useState<boolean>(false);
   const [message, setMessage] = useState<string>('');
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setMessage('Please enter both username and password');
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:3001/api/auth/staff/login', {
        username,
        password
      });
      localStorage.setItem('staffToken', response.data.token);
      localStorage.setItem('staffInfo', JSON.stringify(response.data.admin));
      setMessage('Login successful!');
      setTimeout(() => {
        navigate('/staff/dashboard');
      }, 1000);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
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
      <div className="card" style={{ maxWidth: '450px', width: '100%' }}>
        <div className="text-center mb-6">
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 'bold', 
            color: '#2563eb',
            marginBottom: '0.5rem'
          }}>
            {isWorkerMode ? 'Worker Login' : 'Admin Login'}
          </h1>
          <p style={{ color: '#4b5563' }}>
            QueueFlow Management Portal
          </p>
        </div>
        {message && (
          <div className={`alert ${message.includes('successful') ? 'alert-success' : 'alert-error'} mb-4`}>
            {message}
          </div>
        )}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem', 
              color: '#374151' 
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="Enter your username"
              disabled={isLoading}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem', 
              color: '#374151' 
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter your password"
                disabled={isLoading}
                style={{ paddingRight: '2.5rem', width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || !username || !password}
            className={`btn btn-primary ${isLoading || !username || !password ? 'opacity-50' : ''}`}
            style={{ padding: '0.75rem', width: '100%', display: 'block', boxSizing: 'border-box' }}
          >
            {isLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Logging in...
              </span>
            ) : 'Login'}
          </button>
        </form>
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/staff/options')}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 1rem' }}
          >
            ← Back to Options
          </button>
        </div>
        <div className="text-center mt-4" style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          {isWorkerMode ? (
            <p>New here? <button 
              onClick={() => navigate('/staff/register')}
              style={{ color: '#2563eb', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Register as Worker
            </button></p>
          ) : (
            <p>Are you a worker? <button 
              onClick={() => setIsWorkerMode(true)}
              style={{ color: '#2563eb', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Worker Login
            </button></p>
          )}
          {isWorkerMode && (
            <p style={{ marginTop: '0.5rem' }}><button 
              onClick={() => setIsWorkerMode(false)}
              style={{ color: '#6b7280', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Back to Admin Login
            </button></p>
          )}
        </div>
      </div>
    </div>
  );
}
export default StaffLogin;
