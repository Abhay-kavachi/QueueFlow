import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function AdminClaim() {
  const navigate = useNavigate();
  const [adminInviteKey, setAdminInviteKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }
    setIsLoading(true);
    setMessage('');

    try {
      await axios.post('http://localhost:3001/api/master/claim-admin', {
        adminInviteKey,
        username,
        password
      });
      setMessage('Admin account successfully claimed! Redirecting to login...');
      setTimeout(() => navigate('/staff/login'), 2000);
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to claim admin account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-3xl p-8 shadow-2xl border border-gray-700">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white tracking-tight mb-2">Claim Domain</h2>
          <p className="text-gray-400 text-sm">Enter your Master Invite Key to become the Org Admin</p>
        </div>

        {message && (
          <div className={`p-4 rounded-xl text-sm font-bold text-center mb-6 ${message.includes('success') ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleClaim} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Master Invite Key</label>
            <input 
              type="text" 
              required 
              value={adminInviteKey} 
              onChange={e => setAdminInviteKey(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="QF-..."
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Desired Admin Username</label>
            <input 
              type="text" 
              required 
              value={username} 
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Password</label>
            <input 
              type="password" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Confirm Password</label>
            <input 
              type="password" 
              required 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full mt-6 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold tracking-wide shadow-lg transition-transform active:scale-95 disabled:opacity-50"
          >
            {isLoading ? 'Claiming...' : 'Claim Admin Privileges'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminClaim;
