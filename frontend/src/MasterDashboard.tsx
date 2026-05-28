import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Organization {
  id: string;
  name: string;
  type: string;
  auth_mode: string;
  admin_invite_key: string | null;
  admin_username: string | null;
  total_services: string;
  total_workers: string;
  current_queue: string;
}

function MasterDashboard() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // Provisioning Form
  const [orgName, setOrgName] = useState('');
  const [type, setType] = useState('institution');
  const [authMode, setAuthMode] = useState('student_id');

  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editAuthMode, setEditAuthMode] = useState('');

  const token = localStorage.getItem('masterToken');

  const fetchOrgs = async () => {
    try {
      const res = await axios.get('http://localhost:3001/api/master/organizations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrganizations(res.data.data);
    } catch (err) {
      console.error('Failed to fetch orgs');
    }
  };

  useEffect(() => {
    if (!token) window.location.href = '/master/login';
    else fetchOrgs();
  }, [token]);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      await axios.post('http://localhost:3001/api/master/organizations', {
        orgName, type, authMode
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage('Domain provisioned! Invite key generated.');
      setOrgName('');
      fetchOrgs();
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Provisioning failed');
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (org: Organization) => {
    setEditingId(org.id);
    setEditName(org.name);
    setEditType(org.type);
    setEditAuthMode(org.auth_mode);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    try {
      await axios.patch(`http://localhost:3001/api/master/organizations/${id}`, {
        name: editName,
        type: editType,
        authMode: editAuthMode
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEditingId(null);
      fetchOrgs();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Update failed');
    }
  };

  const generateKey = async (id: string) => {
    if (!window.confirm("Generate a new Admin Invite Key? Old keys will be replaced.")) return;
    try {
      await axios.post(`http://localhost:3001/api/master/organizations/${id}/generate-key`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchOrgs();
    } catch (err: any) {
      alert('Key generation failed');
    }
  };

  const deleteOrg = async (id: string) => {
    if (!window.confirm("WARNING: Are you sure you want to completely destroy this domain and all its data?")) return;
    try {
      await axios.delete(`http://localhost:3001/api/master/organizations/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchOrgs();
    } catch (err: any) {
      alert('Delete failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('masterToken');
    window.location.href = '/master/login';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {}
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">QueueFlow SaaS Master</h1>
            <p className="text-gray-400 text-sm mt-1">Global Provisioning & Analytics</p>
          </div>
          <button onClick={logout} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold shadow-md transition-colors">
            End Session
          </button>
        </div>

        {}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <div className="bg-gray-800 border border-gray-700 p-6 rounded-2xl flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Active Domains</p>
              <h2 className="text-5xl font-black text-white mt-2">{organizations.length}</h2>
            </div>
            <div className="h-16 w-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 p-6 rounded-2xl flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Global Users in Queue</p>
              <h2 className="text-5xl font-black text-white mt-2">
                {organizations.reduce((sum, org) => sum + parseInt(org.current_queue), 0)}
              </h2>
            </div>
            <div className="h-16 w-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            </div>
          </div>
        </div>

        {}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 sticky top-8">
              <h3 className="text-xl font-bold text-white mb-6">Provision Domain</h3>
              
              {message && (
                <div className="bg-blue-500/20 border border-blue-500/50 text-blue-300 p-3 rounded-lg text-sm mb-6">
                  {message}
                </div>
              )}

              <form onSubmit={handleProvision} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Organization Name</label>
                  <input type="text" required value={orgName} onChange={e=>setOrgName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="e.g. Apex Hospital" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Type</label>
                  <select value={type} onChange={e=>setType(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="institution">Institution</option>
                    <option value="private">Private</option>
                    <option value="govt">Govt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Auth Mode</label>
                  <select value={authMode} onChange={e=>setAuthMode(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="student_id">Student ID</option>
                    <option value="mobile">Mobile OTP</option>
                    <option value="aadhaar">Aadhaar</option>
                  </select>
                </div>
                <button type="submit" disabled={isLoading} className="w-full mt-4 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50">
                  {isLoading ? 'Provisioning...' : 'Deploy Tenant'}
                </button>
              </form>
            </div>
          </div>

          {}
          <div className="lg:col-span-3">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-700">
                <h3 className="text-xl font-bold text-white">Active Tenants Ledger</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-bold">Organization & Admin</th>
                      <th className="px-6 py-4 font-bold">Mode & Type</th>
                      <th className="px-6 py-4 font-bold">Invite Key</th>
                      <th className="px-6 py-4 font-bold text-center">Live Q</th>
                      <th className="px-6 py-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {organizations.map(org => {
                      const isEditing = editingId === org.id;

                      return (
                        <tr key={org.id} className="hover:bg-gray-750 transition-colors">
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <input 
                                type="text" 
                                value={editName} 
                                onChange={e => setEditName(e.target.value)} 
                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                              />
                            ) : (
                              <>
                                <p className="font-bold text-white">{org.name}</p>
                                <p className="text-xs text-blue-400 font-bold mt-1">Admin: {org.admin_username || 'Unclaimed'}</p>
                              </>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <div className="space-y-2">
                                <select value={editAuthMode} onChange={e => setEditAuthMode(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                                  <option value="student_id">Student ID</option>
                                  <option value="mobile">Mobile OTP</option>
                                  <option value="aadhaar">Aadhaar</option>
                                </select>
                                <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                                  <option value="institution">Institution</option>
                                  <option value="private">Private</option>
                                  <option value="govt">Govt</option>
                                </select>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-[10px] font-bold uppercase tracking-wider">
                                  {org.auth_mode}
                                </span>
                                <span className="px-2 py-1 bg-gray-800 border border-gray-600 text-gray-400 rounded text-[10px] uppercase">
                                  {org.type}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {org.admin_invite_key ? (
                              <code className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded border border-blue-800 text-xs font-mono select-all">
                                {org.admin_invite_key}
                              </code>
                            ) : (
                              <span className="text-xs text-gray-500 italic">None</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-bold ${parseInt(org.current_queue) > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                              {org.current_queue}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                            {isEditing ? (
                              <>
                                <button onClick={() => saveEdit(org.id)} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs font-bold text-white transition-colors">Save</button>
                                <button onClick={cancelEdit} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs font-bold text-white transition-colors">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => generateKey(org.id)} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-bold text-white transition-colors shadow-sm">
                                  Mint Key
                                </button>
                                <button onClick={() => startEdit(org)} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs font-bold text-white transition-colors">
                                  Edit
                                </button>
                                <button onClick={() => deleteOrg(org.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs font-bold text-white transition-colors shadow-sm">
                                  Delete
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {organizations.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No organizations provisioned yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default MasterDashboard;
