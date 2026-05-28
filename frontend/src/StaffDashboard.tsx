import React, { useState, useEffect } from 'react';
import axios from 'axios';
interface QueueEntry {
  id: string;
  user_hash: string;
  position: number;
  state: 'pending' | 'next' | 'active' | 'grace' | 'appointment' | 'completed' | 'expired' | 'walk_in' | string;
  entry_type?: 'walk_in' | 'appointment';
  created_at: string;
}
interface Service {
  id: number;
  name: string;
  description: string;
  organization_id: string;
}
function StaffDashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<number>(1);
  const [staffToken, setStaffToken] = useState<string>('');
  const [queueData, setQueueData] = useState<QueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'queue' | 'bulk' | 'analytics' | 'settings'>('queue');
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  
  
  const [staffRole, setStaffRole] = useState<string>('worker');
  const [workerInviteKey, setWorkerInviteKey] = useState<string>('');
  const [updateUsername, setUpdateUsername] = useState<string>('');
  const [updatePassword, setUpdatePassword] = useState<string>('');
  useEffect(() => {
    const token = localStorage.getItem('staffToken');
    if (token) {
      setStaffToken(token);
      try {
        const staffInfo = JSON.parse(localStorage.getItem('staffInfo') || '{}');
        if (staffInfo.role) setStaffRole(staffInfo.role);
      } catch(e) {}
    } else {
      window.location.href = '/staff/login';
    }
  }, []);
  useEffect(() => {
    if (staffToken) {
      fetchServices();
      fetchQueueData();
    }
  }, [staffToken, selectedService]);
  const fetchServices = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/queue/services');
      const allServices = response.data.data;
      
      const staffInfo = JSON.parse(localStorage.getItem('staffInfo') || '{}');
      let filteredServices = allServices;
      if (staffInfo.organizationId) {
        filteredServices = allServices.filter((s: Service) => s.organization_id === staffInfo.organizationId);
      }
      
      
      if (staffInfo.role === 'worker' && staffInfo.serviceId) {
        filteredServices = filteredServices.filter((s: Service) => String(s.id) === String(staffInfo.serviceId));
      }
      
      setServices(filteredServices);
      if (filteredServices.length > 0) {
        const isValid = filteredServices.some((s: Service) => s.id === selectedService);
        if (!isValid) {
          setSelectedService(filteredServices[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };
  const fetchQueueData = async () => {
    if (!staffToken) return;
    try {
      const response = await axios.get(
        `http://localhost:3001/api/staff/queue/${selectedService}`,
        { headers: { 'Authorization': `Bearer ${staffToken}` } }
      );
      setQueueData(response.data.data);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to fetch queue data');
    }
  };

  const fetchAnalyticsData = async () => {
    if (!staffToken || staffRole === 'worker') return;
    try {
      const response = await axios.get(
        `http://localhost:3001/api/staff/analytics/${selectedService}`,
        { headers: { 'Authorization': `Bearer ${staffToken}` } }
      );
      setAnalyticsData(response.data.data);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to fetch analytics');
    }
  };

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalyticsData();
    }
  }, [activeTab, selectedService]);
  const completeService = async () => {
    if (!staffToken) return;
    setIsLoading(true);
    try {
      await axios.post(
        `http://localhost:3001/api/staff/complete/${selectedService}`,
        {},
        { headers: { 'Authorization': `Bearer ${staffToken}` } }
      );
      setMessage('Service completed successfully');
      fetchQueueData();
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to complete service');
    } finally {
      setIsLoading(false);
    }
  };
  const callNext = async () => {
    if (!staffToken) return;
    setIsLoading(true);
    try {
      await axios.post(
        `http://localhost:3001/api/staff/call-next/${selectedService}`,
        {},
        { headers: { 'Authorization': `Bearer ${staffToken}` } }
      );
      setMessage('Called next user successfully');
      fetchQueueData();
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to call next user');
    } finally {
      setIsLoading(false);
    }
  };

  const markNoShow = async () => {
    if (!staffToken) return;
    setIsLoading(true);
    try {
      await axios.post(
        `http://localhost:3001/api/staff/no-show/${selectedService}`,
        {},
        { headers: { 'Authorization': `Bearer ${staffToken}` } }
      );
      setMessage('User moved to grace period');
      fetchQueueData();
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to mark no-show');
    } finally {
      setIsLoading(false);
    }
  };

  const pauseService = async (isPaused: boolean) => {
    if (!staffToken) return;
    setIsLoading(true);
    try {
      await axios.post(
        `http://localhost:3001/api/staff/pause/${selectedService}`,
        { isPaused },
        { headers: { 'Authorization': `Bearer ${staffToken}` } }
      );
      setMessage(`Service ${isPaused ? 'paused' : 'resumed'} successfully`);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to update service status');
    } finally {
      setIsLoading(false);
    }
  };
  const handleBulkUpload = async (endpoint: string) => {
    if (!staffToken || !csvFile) {
      setMessage('Please select a CSV file first');
      return;
    }
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const response = await axios.post(`http://localhost:3001/api/staff/${endpoint}`, formData, {
        headers: {
          'Authorization': `Bearer ${staffToken}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setMessage(response.data.message);
      setCsvFile(null);
      if (endpoint.includes('queue-inject')) fetchQueueData();
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to upload CSV');
    } finally {
      setIsLoading(false);
    }
  };

  const generateWorkerKey = async () => {
    try {
      setIsLoading(true);
      const response = await axios.post('http://localhost:3001/api/staff/generate-worker-key', {}, {
        headers: { 'Authorization': `Bearer ${staffToken}` }
      });
      setWorkerInviteKey(response.data.worker_invite_key);
      setMessage('New worker invite key generated successfully');
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to generate worker key');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateUsername || !updatePassword) {
      setMessage('Username and password required for update');
      return;
    }
    try {
      setIsLoading(true);
      await axios.patch('http://localhost:3001/api/staff/update-credentials', 
        { username: updateUsername, password: updatePassword },
        { headers: { 'Authorization': `Bearer ${staffToken}` } }
      );
      setMessage('Credentials updated successfully. Please login again with new credentials.');
      setTimeout(logout, 2000);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to update credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('staffToken');
    localStorage.removeItem('staffInfo');
    window.location.href = '/staff/login';
  };
  if (!staffToken) return null; 
  return (
    <div className="container mx-auto p-4">
      <div className="card bg-white rounded-lg shadow-md p-6 max-w-6xl mx-auto">
        <h1 className="text-center mb-2 text-3xl font-bold text-blue-600">Staff Dashboard</h1>
        <p className="text-center mb-6 text-gray-600">QueueFlow Management System</p>
        {message && (
          <div className="alert alert-info mb-6 bg-blue-100 text-blue-800 p-3 rounded-md">
            {message}
          </div>
        )}
        <div className="space-y-6">
          {}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-4 py-2 font-medium ${activeTab === 'queue' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Queue Management
            </button>
            {(staffRole === 'admin' || staffRole === 'manager') && (
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-4 py-2 font-medium ${activeTab === 'analytics' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Analytics
              </button>
            )}
            <button
              onClick={() => setActiveTab('bulk')}
              className={`px-4 py-2 font-medium ${activeTab === 'bulk' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Bulk Operations
            </button>
            {staffRole === 'admin' && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 font-medium ${activeTab === 'settings' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Admin Settings
              </button>
            )}
          </div>
          {}
          {activeTab === 'queue' && (
            <>
              {}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-1">
                   <div>
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total in Queue</p>
                     <h3 className="text-4xl font-black text-gray-800 mt-1">{queueData.length}</h3>
                   </div>
                   <div className="h-14 w-14 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shadow-inner">
                     <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                   </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-1">
                   <div>
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Currently Active</p>
                     <h3 className="text-4xl font-black text-gray-800 mt-1">{queueData.filter(q => q.state === 'active').length}</h3>
                     <p className="text-[10px] text-gray-400 mt-1 uppercase">Auto-grace after 2m</p>
                   </div>
                   <div className="h-14 w-14 rounded-full bg-green-50 text-green-500 flex items-center justify-center shadow-inner">
                     <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                   </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-1">
                   <div>
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Estimated Wait</p>
                     <h3 className="text-4xl font-black text-gray-800 mt-1">{queueData.length * 5}<span className="text-lg text-gray-500 font-medium ml-1">min</span></h3>
                   </div>
                   <div className="h-14 w-14 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shadow-inner">
                     <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                   </div>
                </div>
              </div>

              <div className="flex justify-between items-center flex-wrap gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Service</label>
                  <select
                    value={selectedService}
                    onChange={(e) => setSelectedService(Number(e.target.value))}
                    className="input w-auto min-w-[200px]"
                  >
                    {services.map(service => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => fetchQueueData()} disabled={isLoading} className={`btn btn-primary ${isLoading ? 'opacity-50' : ''}`}>
                    Refresh
                  </button>
                  <button onClick={callNext} disabled={isLoading} className={`btn bg-blue-600 hover:bg-blue-700 text-white ${isLoading ? 'opacity-50' : ''}`}>
                    Call Next
                  </button>
                  <button onClick={markNoShow} disabled={isLoading} className={`btn bg-orange-500 hover:bg-orange-600 text-white ${isLoading ? 'opacity-50' : ''}`}>
                    No Show (Grace)
                  </button>
                  <button onClick={completeService} disabled={isLoading} className={`btn bg-purple-600 hover:bg-purple-700 text-white ${isLoading ? 'opacity-50' : ''}`}>
                    Complete Active
                  </button>
                  <button onClick={() => pauseService(true)} disabled={isLoading} className={`btn bg-yellow-600 hover:bg-yellow-700 text-white ${isLoading ? 'opacity-50' : ''}`}>
                    Pause
                  </button>
                  <button onClick={logout} className="btn btn-danger">
                    Logout
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto mt-6">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="p-3 text-xs font-medium text-gray-500 uppercase">Position</th>
                      <th className="p-3 text-xs font-medium text-gray-500 uppercase">State</th>
                      <th className="p-3 text-xs font-medium text-gray-500 uppercase">User Hash</th>
                      <th className="p-3 text-xs font-medium text-gray-500 uppercase">Time Joined</th>
                      <th className="p-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {queueData.filter(q => q.state !== 'grace').map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-md 
                            ${entry.state === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            #{entry.position}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap text-sm">
                           {(() => {
                              const stateOrType = entry.state === 'pending' && entry.entry_type === 'appointment' ? 'appointment' : 
                                                  entry.state === 'pending' && entry.entry_type === 'walk_in' ? 'walk_in' : 
                                                  entry.state;
                              switch(stateOrType) {
                                case 'walk_in': return <span className="px-2 py-1 text-xs font-semibold rounded-md bg-blue-100 text-blue-800">Walk-in</span>;
                                case 'appointment': return <span className="px-2 py-1 text-xs font-semibold rounded-md bg-purple-100 text-purple-800">Appointment</span>;
                                case 'grace': return <span className="px-2 py-1 text-xs font-semibold rounded-md bg-yellow-100 text-yellow-800">Grace Period</span>;
                                case 'expired': return <span className="px-2 py-1 text-xs font-semibold rounded-md bg-red-100 text-red-800">Expired</span>;
                                case 'active': return <span className="px-2 py-1 text-xs font-semibold rounded-md bg-green-100 text-green-800">Active</span>;
                                case 'completed': return <span className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-800">Completed</span>;
                                default: return <span className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-800 capitalize">{entry.state}</span>;
                              }
                           })()}
                        </td>
                        <td className="p-3 whitespace-nowrap text-sm text-gray-500">{entry.user_hash.substring(0, 8)}...</td>
                        <td className="p-3 whitespace-nowrap text-sm text-gray-500">{new Date(entry.created_at).toLocaleTimeString()}</td>
                        <td className="p-3 whitespace-nowrap">
                           <button 
                             onClick={async () => {
                               try {
                                 await axios.post(`http://localhost:3001/api/staff/grace/${entry.id}`, {}, { headers: { Authorization: `Bearer ${staffToken}` }});
                                 fetchQueueData();
                               } catch(e: any) {
                                 setMessage(e.response?.data?.error || 'Failed to move user');
                               }
                             }} 
                             className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded hover:bg-orange-200 font-semibold transition-colors"
                           >
                             Send to Grace
                           </button>
                        </td>
                      </tr>
                    ))}
                    {queueData.filter(q => q.state !== 'grace').length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-gray-500">No active/pending users in queue.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-8 border-l-4 border-orange-500 pl-2">
                <h3 className="text-lg font-bold text-orange-600 mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  Grace Queue (No Shows)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-orange-200 rounded-lg">
                    <thead>
                      <tr className="bg-orange-50 border-b border-orange-200">
                        <th className="p-3 text-xs font-medium text-orange-800 uppercase">Original Pos</th>
                        <th className="p-3 text-xs font-medium text-orange-800 uppercase">User Hash</th>
                        <th className="p-3 text-xs font-medium text-orange-800 uppercase">Joined</th>
                        <th className="p-3 text-xs font-medium text-orange-800 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {queueData.filter(q => q.state === 'grace').length > 0 ? queueData.filter(q => q.state === 'grace').map((entry) => (
                        <tr key={entry.id} className="border-b border-orange-100 hover:bg-orange-50/50">
                          <td className="p-3 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-semibold rounded-md bg-orange-100 text-orange-800">
                              #{entry.position}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap text-sm text-gray-600">{entry.user_hash.substring(0, 8)}...</td>
                          <td className="p-3 whitespace-nowrap text-sm text-gray-500">{new Date(entry.created_at).toLocaleTimeString()}</td>
                          <td className="p-3 whitespace-nowrap">
                             <div className="flex gap-2">
                               <button 
                                 onClick={async () => {
                                   try {
                                     await axios.post(`http://localhost:3001/api/staff/reinstate/${entry.id}`, {}, { headers: { Authorization: `Bearer ${staffToken}` }});
                                     fetchQueueData();
                                   } catch(e) {}
                                 }} 
                                 className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200 font-semibold"
                               >
                                 Reinstate
                               </button>
                               <button 
                                 onClick={async () => {
                                   try {
                                     await axios.post(`http://localhost:3001/api/staff/send-to-back/${entry.id}`, {}, { headers: { Authorization: `Bearer ${staffToken}` }});
                                     fetchQueueData();
                                   } catch(e) {}
                                 }} 
                                 className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200 font-semibold"
                               >
                                 Send to Back
                               </button>
                             </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4}>
                            <p className="text-gray-400 italic text-sm text-center p-4">
                              No patients in grace period right now.
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          {}

          {}
          {activeTab === 'bulk' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Data Injection Protocol</h2>
              <p className="text-gray-500 mb-6">Securely map institutional records into the QueueFlow platform.</p>
              
              <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Register Users Database (CSV)</h3>
                    <p className="text-sm text-gray-500 mb-6">Upload an identity map so users can authenticate natively without manual signup. <br/>Expected Headers: <span className="font-mono bg-gray-100 px-1 rounded text-gray-700">Aadhaar, FullName, Email, Phone</span></p>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-4 p-6 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/50 hover:bg-blue-50 transition-colors">
                      <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-white file:text-blue-700 file:shadow-sm hover:file:bg-blue-50 cursor-pointer" />
                      <button onClick={() => handleBulkUpload('bulk-register')} disabled={isLoading || !csvFile} className="btn bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap shadow-md px-8 py-3 rounded-xl font-bold w-full sm:w-auto transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLoading ? 'Processing...' : 'Upload & Inject'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Live Queue Injection (CSV)</h3>
                    <p className="text-sm text-gray-500 mb-4">Directly push a massive batch of identifiers into the active queue. <br/>Expected Header: <span className="font-mono bg-gray-100 px-1 rounded text-gray-700">Aadhaar</span></p>
                    
                    <div className="mb-6">
                      <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-gray-500">Target Service Area</label>
                      <select value={selectedService} onChange={(e) => setSelectedService(Number(e.target.value))} className="w-full sm:w-1/2 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-gray-50">
                        {services.map(service => (
                          <option key={service.id} value={service.id}>{service.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 p-6 border-2 border-dashed border-purple-200 rounded-xl bg-purple-50/50 hover:bg-purple-50 transition-colors">
                      <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-white file:text-purple-700 file:shadow-sm hover:file:bg-purple-50 cursor-pointer" />
                      <button onClick={() => handleBulkUpload(`bulk-queue-inject/${selectedService}`)} disabled={isLoading || !csvFile} className="btn bg-purple-600 hover:bg-purple-700 text-white whitespace-nowrap shadow-md px-8 py-3 rounded-xl font-bold w-full sm:w-auto transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLoading ? 'Injecting...' : 'Force Inject'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && analyticsData && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Service Analytics</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <h3 className="text-sm text-gray-500 uppercase tracking-widest font-bold mb-2">Average Wait</h3>
                  <p className="text-4xl font-black text-blue-600">{Math.round(analyticsData.averageWaitTime)} <span className="text-xl">min</span></p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <h3 className="text-sm text-gray-500 uppercase tracking-widest font-bold mb-2">Total Completed</h3>
                  <p className="text-4xl font-black text-green-500">
                    {analyticsData.statusCounts?.find((s: any) => s.final_status === 'completed')?.count || 0}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <h3 className="text-sm text-gray-500 uppercase tracking-widest font-bold mb-2">No-Shows</h3>
                  <p className="text-4xl font-black text-red-500">
                    {analyticsData.statusCounts?.find((s: any) => s.final_status === 'expired')?.count || 0}
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Peak Activity Hours</h3>
                {analyticsData.peakHours?.length > 0 ? (
                  <div className="space-y-3">
                    {analyticsData.peakHours.map((ph: any, i: number) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-20 font-bold text-gray-600">{ph.hour}:00</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div className="bg-purple-500 h-full rounded-full" style={{ width: `${Math.min(100, (ph.count / analyticsData.peakHours[0].count) * 100)}%` }}></div>
                        </div>
                        <div className="w-12 text-right font-mono text-gray-500">{ph.count}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">Not enough data to determine peak hours.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && staffRole === 'admin' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Worker Invitation Key</h3>
                <p className="text-sm text-gray-500 mb-6">Generate a new key to invite workers. This will invalidate any old keys.</p>
                
                {workerInviteKey ? (
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 text-center">
                    <p className="text-xs text-blue-600 font-bold uppercase mb-1">Your Key</p>
                    <code className="text-xl text-blue-800 font-mono font-black select-all">{workerInviteKey}</code>
                  </div>
                ) : null}

                <button 
                  onClick={generateWorkerKey} 
                  disabled={isLoading} 
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-md transition-transform active:scale-95 disabled:opacity-50"
                >
                  {isLoading ? 'Generating...' : 'Mint New Worker Key'}
                </button>
              </div>

              <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Update My Credentials</h3>
                <p className="text-sm text-gray-500 mb-6">Change your Admin username or password.</p>
                
                <form onSubmit={updateCredentials} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">New Username</label>
                    <input 
                      type="text" 
                      required 
                      value={updateUsername} 
                      onChange={e => setUpdateUsername(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">New Password</label>
                    <input 
                      type="password" 
                      required 
                      value={updatePassword} 
                      onChange={e => setUpdatePassword(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full mt-2 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl shadow-md transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {isLoading ? 'Updating...' : 'Save Credentials'}
                  </button>
                </form>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default StaffDashboard;
