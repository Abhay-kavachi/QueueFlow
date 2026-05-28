import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

interface Organization {
  id: string;
  name: string;
  auth_mode: string;
}

interface Service {
  id: number;
  organization_id: string;
  name: string;
  description: string;
  capacity: number;
  is_paused?: boolean;
}

interface QueueEntry {
  id: string;
  position: number;
  state: 'pending' | 'next' | 'active' | 'grace' | 'appointment' | 'skipped' | 'completed' | 'expired';
  entryType?: 'walk_in' | 'appointment';
  appointmentTime?: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

function UserInterface() {
  const navigate = useNavigate();

  const [step, setStep] = useState<'organization' | 'login' | 'otp' | 'service' | 'queue'>('organization');

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  
  const [orgId, setOrgId] = useState<string>('');
  const [authMode, setAuthMode] = useState<string>('');
  
  const [identifier, setIdentifier] = useState<string>('');
  const [userHash, setUserHash] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [sessionToken, setSessionToken] = useState<string>(''); 

  const [selectedService, setSelectedService] = useState<number | null>(null);
  
  const [joinMode, setJoinMode] = useState<'walk_in' | 'appointment'>('walk_in');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  
  const [queuePosition, setQueuePosition] = useState<QueueEntry | null>(null);
  const [myQueues, setMyQueues] = useState<any[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [message, setMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Fetch live Orgs and Services
    const fetchBaseData = async () => {
      try {
        const [orgRes, svcRes] = await Promise.all([
          axios.get('http://localhost:3001/api/queue/organizations'),
          axios.get('http://localhost:3001/api/queue/services')
        ]);
        setOrganizations(orgRes.data.data);
        setServices(svcRes.data.data);
      } catch (err) {
        console.error('Failed to load base data', err);
        setMessage('Network error while fetching organizations.');
      }
    };

    
    const restoreSession = async () => {
      setIsLoading(true);
      const savedToken = localStorage.getItem('sessionToken');
      const savedServiceId = localStorage.getItem('serviceId');
      const savedOrgId = localStorage.getItem('orgId');

      if (savedToken && savedServiceId && savedOrgId) {
        try {
          const recovery = await axios.get('http://localhost:3001/api/queue/my-status', {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          
          setSessionToken(savedToken);
          setOrgId(savedOrgId);
          
          if (recovery.data.queues && recovery.data.queues.length > 0) {
            setMyQueues(recovery.data.queues);
          }
          
          setStep('service');
          
        } catch (err: any) {
          
          localStorage.removeItem('sessionToken');
          localStorage.removeItem('orgId');
          setStep('organization');
        }
      } else {
        setStep('organization');
      }
      setIsLoading(false);
    };

    fetchBaseData().then(restoreSession);
  }, []);

  useEffect(() => {
    
    if (step === 'queue' && orgId && organizations.length > 0) {
      const org = organizations.find(o => o.id === orgId);
      if (org && !authMode) setAuthMode(org.auth_mode);
    }
  }, [step, orgId, organizations]);

  useEffect(() => {
    if (step === 'queue' && orgId && selectedService) {
      const room = `${orgId}_${selectedService}`;
      const newSocket = io('http://localhost:3001');
      
      newSocket.on('connect', () => {
        newSocket.emit('join_room', room);
        console.log(`📡 Joined isolated queue room: ${room}`);
      });

      newSocket.on('queue:update', (data) => {
        
        if (data.action === 'active') {
          setMessage('Your turn is coming up! You are now active.');
          setQueuePosition(prev => prev ? { ...prev, state: 'active' } : null);
        } else if (data.action === 'expired') {
          setMessage('Time expired. You have been removed from the queue.');
          setQueuePosition(null);
          localStorage.removeItem('serviceId');
          setStep('service');
        } else if (data.action === 'grace_started') {
           setQueuePosition(prev => prev ? { ...prev, state: 'grace' } : null);
        } else if (data.action === 'skipped') {
           setMessage('You were skipped by the administrator.');
           setQueuePosition(null);
           localStorage.removeItem('serviceId');
           setStep('service');
        }
      });

      setSocket(newSocket);
      return () => { newSocket.disconnect(); };
    }
  }, [step, orgId, selectedService]);

  const selectOrg = (id: string, mode: string) => {
    setOrgId(id);
    setAuthMode(mode);
    setStep('login');
    setMessage('');
  };

  const handleRequestOtp = async () => {
    if (!identifier) {
      setMessage('Please enter your identifier');
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.post('http://localhost:3001/api/auth/request-otp', { identifier, purpose: 'checkin' });
      setUserHash(res.data.userHash);
      setStep('otp');
      setMessage('OTP generated. (If DEMO_MODE=true, enter 123456. Otherwise check backend console.)');
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to request OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      setMessage('Please enter OTP');
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.post('http://localhost:3001/api/auth/verify-otp', { userHash, otp, purpose: 'checkin' });
      const token = res.data.sessionToken;
      setSessionToken(token);
      localStorage.setItem('sessionToken', token);
      localStorage.setItem('orgId', orgId);
      
      const recovery = await axios.get('http://localhost:3001/api/queue/my-status', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (recovery.data.queues && recovery.data.queues.length > 0) {
        setMyQueues(recovery.data.queues);
      }
      
      setStep('service');
      setMessage('Login successful!');
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinQueue = async () => {
    if (!selectedService) return;
    if (joinMode === 'appointment' && !selectedTimeSlot) {
      setMessage('Please select a time slot.');
      return;
    }
    
    setIsLoading(true);
    try {
      const payload = joinMode === 'appointment' ? { type: 'appointment', time: selectedTimeSlot } : { type: 'walk_in' };
      const res = await axios.post(`http://localhost:3001/api/queue/join/${selectedService}`, payload, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      
      localStorage.setItem('serviceId', selectedService.toString());
      setQueuePosition({
        id: res.data.data.queueId,
        position: res.data.data.position,
        state: joinMode === 'appointment' ? 'appointment' : 'pending',
        entryType: joinMode,
        appointmentTime: joinMode === 'appointment' ? selectedTimeSlot : undefined
      });
      setStep('queue');
      setMessage('Successfully joined the queue!');
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to join queue');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (sessionToken) {
      try {
        await axios.post('http://localhost:3001/api/auth/logout', {}, {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
      } catch(e) {}
    }
    setStep('organization');
    setOrgId('');
    setAuthMode('');
    setIdentifier('');
    setOtp('');
    setSessionToken('');
    setSelectedService(null);
    setQueuePosition(null);
    setJoinMode('walk_in');
    setTimeSlots([]);
    setSelectedTimeSlot('');
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('serviceId');
    localStorage.removeItem('orgId');
    if (socket) socket.disconnect();
    setMessage('');
  };

  if (isLoading && step === 'organization' && !organizations.length) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center animate-pulse">
           <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
           <h2 className="text-xl font-bold text-gray-700">Restoring Queue Session...</h2>
           <p className="text-gray-500 text-sm mt-2">Reconnecting to QueueFlow Universal</p>
        </div>
      </div>
    );
  }

const AppointmentCountdown = ({ appointmentTime }: { appointmentTime?: string }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  
  useEffect(() => {
    if (!appointmentTime) return;
    const updateCountdown = () => {
      const diff = new Date(appointmentTime).getTime() - new Date().getTime();
      if (diff <= 0) {
        setTimeLeft('Time for your appointment!');
        return;
      }
      const mins = Math.floor(diff / 60000);
      setTimeLeft(`in ${mins} minutes`);
    };
    updateCountdown();
    const iv = setInterval(updateCountdown, 60000);
    return () => clearInterval(iv);
  }, [appointmentTime]);

  return (
    <>
      <p className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-2">Appointment</p>
      <h2 className="text-4xl font-black text-gray-900 my-4 tracking-tighter">
        {appointmentTime ? new Date(appointmentTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
      </h2>
      <p className="text-lg font-semibold text-blue-800">{timeLeft}</p>
    </>
  );
};

  return (
    <div className="container mx-auto p-4 flex items-center justify-center min-h-screen relative overflow-hidden bg-gray-50">
      <div className="card w-full max-w-md bg-white rounded-xl shadow-2xl p-8 relative z-10 transition-all duration-500 hover:shadow-blue-200/50">
        
        {/* Dynamic Header */}
        <h1 className="text-center mb-1 text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
          QueueFlow
        </h1>
        <p className="text-center mb-6 text-sm font-medium text-gray-500 uppercase tracking-widest">
          Universal Platform
        </p>

        {message && (
          <div className={`p-4 rounded-lg mb-6 border animate-pulse ${message.includes('success') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
            {message}
          </div>
        )}

        {/* STEP 1: ORGANIZATION SELECTOR */}
        {step === 'organization' && (
          <div className="space-y-4 animate-fadeIn">
            <h3 className="text-lg font-semibold text-gray-700 text-center mb-4">Select your Organization</h3>
            {organizations.length === 0 && !isLoading && (
              <p className="text-center text-gray-500">No organizations found.</p>
            )}
            {organizations.map(org => (
              <button
                key={org.id}
                onClick={() => selectOrg(org.id, org.auth_mode)}
                className="w-full relative group overflow-hidden p-4 rounded-xl border-2 border-gray-100 hover:border-blue-500 bg-white transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10 flex justify-between items-center">
                  <span className="font-bold text-gray-800">{org.name}</span>
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                    Mode: {org.auth_mode}
                  </span>
                </div>
              </button>
            ))}
            <div className="pt-4 text-center">
              <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 underline">Back to Portal</button>
            </div>
          </div>
        )}

        {/* STEP 2: DYNAMIC AUTH SCREEN (Request OTP) */}
        {step === 'login' && (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-semibold text-gray-800 text-center">
              Sign Into <span className="text-blue-600">{organizations.find(o => o.id === orgId)?.name}</span>
            </h3>
            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <label className="block text-sm font-medium mb-2 text-gray-700 uppercase tracking-wide">
                {authMode === 'aadhaar' ? 'Aadhaar Identification' : authMode === 'student_id' ? 'University Student ID' : 'Mobile Number'}
              </label>
              <input
                type={authMode === 'student_id' ? 'text' : 'number'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder={authMode === 'aadhaar' ? 'Enter 12-digit Aadhaar' : authMode === 'student_id' ? 'Enter Student ID (e.g. CS-202)' : 'Enter Mobile Number'}
              />
            </div>
            
            <div className="flex gap-3 pt-2">
               <button onClick={() => setStep('organization')} className="px-4 py-3 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                 Back
               </button>
               <button onClick={handleRequestOtp} disabled={isLoading} className={`flex-1 py-3 rounded-lg font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md transition-all ${isLoading ? 'opacity-50' : 'hover:-translate-y-1 hover:shadow-xl'}`}>
                 {isLoading ? 'Processing...' : 'Verify Identity'}
               </button>
            </div>
          </div>
        )}

        {/* STEP 2.5: OTP VERIFICATION */}
        {step === 'otp' && (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-semibold text-gray-800 text-center">
              Enter Verification Code
            </h3>
            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <label className="block text-sm font-medium mb-2 text-gray-700 uppercase tracking-wide">
                6-Digit OTP
              </label>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-3 text-center tracking-[0.5em] font-mono text-xl rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="------"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
               <button onClick={() => setStep('login')} className="px-4 py-3 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                 Cancel
               </button>
               <button onClick={handleVerifyOtp} disabled={isLoading} className={`flex-1 py-3 rounded-lg font-bold text-white bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 shadow-md transition-all ${isLoading ? 'opacity-50' : 'hover:-translate-y-1 hover:shadow-xl'}`}>
                 {isLoading ? 'Verifying...' : 'Complete Login'}
               </button>
            </div>
          </div>
        )}

        {/* STEP 3: SERVICE SELECTION */}
        {step === 'service' && (
          <div className="space-y-4 animate-fadeIn">
            {myQueues.length > 0 && (
              <div className="mb-8">
                <h4 className="text-md font-bold text-gray-700 mb-3 uppercase tracking-wider">My Active Queues</h4>
                <div className="space-y-3">
                  {myQueues.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedService(q.service_id);
                        setQueuePosition({
                          id: q.id,
                          position: q.queue_position,
                          state: q.state,
                          entryType: q.entry_type,
                          appointmentTime: q.appointment_time
                        });
                        localStorage.setItem('serviceId', q.service_id.toString());
                        setStep('queue');
                      }}
                      className="w-full text-left bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100 hover:shadow-md transition-all hover:-translate-y-1"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-blue-900">{q.service_name}</span>
                        <span className="text-xs font-bold px-2 py-1 bg-white text-blue-700 rounded-full shadow-sm uppercase">{q.state}</span>
                      </div>
                      <div className="text-sm text-blue-700 font-medium">
                        {q.entry_type === 'walk_in' ? `Queue Position: ${q.queue_position}` : `Appointment: ${new Date(q.appointment_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-2">Join a New Queue</h3>
            <p className="text-sm text-center text-gray-500 mb-4">Choose a service desk to get a token or book a slot.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {services.filter(s => s.organization_id === orgId).map(service => (
                <button
                  key={service.id}
                  onClick={() => {
                    setSelectedService(service.id);
                    setJoinMode('walk_in');
                    setSelectedTimeSlot('');
                  }}
                  className={`relative flex flex-col p-5 rounded-2xl border-2 transition-all duration-300 text-left overflow-hidden ${selectedService === service.id ? 'border-blue-500 bg-blue-50/80 shadow-md transform -translate-y-1' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white'}`}
                >
                  <div className="flex justify-between items-start mb-3 w-full">
                    <div className={`p-2.5 rounded-xl ${selectedService === service.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'}`}>
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                      Open
                    </span>
                  </div>
                  <span className={`block font-extrabold text-lg mb-1 tracking-tight ${selectedService === service.id ? 'text-blue-800' : 'text-gray-900'}`}>{service.name}</span>
                  <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Capacity: {service.capacity} Slots</span>
                </button>
              ))}
              {services.filter(s => s.organization_id === orgId).length === 0 && (
                <p className="col-span-full text-center text-gray-500">No active services available.</p>
              )}
            </div>

            {selectedService && (
              <div className="mt-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm animate-fadeIn">
                {services.find(s => s.id === selectedService)?.is_paused && (
                  <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                    <p className="text-sm font-bold text-yellow-800">
                      ⚠️ Doctor is on a break. Wait times are paused until they return.
                    </p>
                  </div>
                )}
                <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                  <button 
                    onClick={() => setJoinMode('walk_in')} 
                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${joinMode === 'walk_in' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Join Now (Walk-in)
                  </button>
                  <button 
                    onClick={async () => {
                      setJoinMode('appointment');
                      try {
                        const date = new Date().toISOString().split('T')[0];
                        const res = await axios.get('http://localhost:3001/api/queue/services/' + selectedService + '/slots?date=' + date, {
                          headers: { Authorization: `Bearer ${sessionToken}` }
                        });
                        setTimeSlots(res.data.slots);
                      } catch (e) {}
                    }} 
                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${joinMode === 'appointment' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Book a Time
                  </button>
                </div>
                
                {joinMode === 'appointment' && (
                  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2">
                    {timeSlots.map((slot, i) => (
                      <button
                        key={i}
                        disabled={!slot.available}
                        onClick={() => setSelectedTimeSlot(slot.time)}
                        className={'py-2 px-1 text-xs font-bold rounded-lg transition-all ' + (!slot.available ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60' : selectedTimeSlot === slot.time ? 'bg-purple-600 text-white shadow-md transform scale-105' : 'bg-purple-50 text-purple-700 hover:bg-purple-100')}
                      >
                        {new Date(slot.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </button>
                    ))}
                    {timeSlots.length === 0 && <p className="col-span-3 text-center text-xs text-gray-500">Loading slots...</p>}
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 flex gap-3">
               <button onClick={logout} className="px-4 py-3 rounded-lg font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors">Logout</button>
               <button 
                  onClick={handleJoinQueue}
                  disabled={!selectedService || isLoading || (joinMode === 'appointment' && !selectedTimeSlot)}
                  className={'flex-1 py-3 rounded-lg font-bold text-white shadow-lg transition-all ' + (!selectedService || isLoading || (joinMode === 'appointment' && !selectedTimeSlot) ? 'bg-gray-300 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:-translate-y-1 hover:shadow-xl')}
               >
                 {isLoading ? 'Processing...' : joinMode === 'walk_in' ? 'Join Service Queue' : 'Confirm Appointment'}
               </button>
            </div>
          </div>
        )}

        {/* STEP 4: QUEUE STATUS */}
        {step === 'queue' && queuePosition && (
          <div className="space-y-6 animate-fadeIn relative">
            <button 
              onClick={async () => {
                try {
                  const recovery = await axios.get('http://localhost:3001/api/queue/my-status', {
                    headers: { Authorization: `Bearer ${sessionToken}` }
                  });
                  if (recovery.data.queues) {
                    setMyQueues(recovery.data.queues);
                  }
                } catch(e) {}
                setStep('service');
              }}
              className="absolute -top-6 left-0 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              Back to Dashboard
            </button>
            <div className={'p-8 rounded-3xl relative overflow-hidden text-center shadow-lg transition-colors duration-500 ' + (queuePosition?.state === 'active' ? 'bg-green-50 border-2 border-green-400' : queuePosition?.state === 'grace' ? 'bg-red-600 border-2 border-red-700' : 'bg-blue-50 border-2 border-blue-200')}>
               <div className="absolute top-4 right-4">
                 <span className="flex h-4 w-4 relative">
                   <span className={'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ' + (queuePosition?.state === 'active' ? 'bg-green-500' : queuePosition?.state === 'grace' ? 'bg-white' : 'bg-blue-500')}></span>
                   <span className={'relative inline-flex rounded-full h-4 w-4 ' + (queuePosition?.state === 'active' ? 'bg-green-600' : queuePosition?.state === 'grace' ? 'bg-red-100' : 'bg-blue-600')}></span>
                 </span>
               </div>
                             {queuePosition?.state === 'grace' ? (
                 <div className="text-white animate-pulse">
                   <h1 className="text-4xl font-black uppercase mb-2 tracking-tight">Final Call!</h1>
                   <p className="text-lg font-semibold mb-6">Proceed to counter immediately</p>
                   <p className="text-sm opacity-90 font-medium">Position expires in 5 minutes.</p>
                 </div>
                 ) : queuePosition?.entryType === 'appointment' ? (
                  <AppointmentCountdown appointmentTime={queuePosition.appointmentTime} />
                ) : (
                 <>
                   <p className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-2">Your Position</p>
                   <h2 className="text-7xl font-black text-gray-900 my-4 tracking-tighter">#{queuePosition?.position}</h2>
                    <div className="inline-block px-4 py-1 rounded-full bg-white shadow-sm mt-2">
                      <p className={'text-sm font-extrabold uppercase tracking-widest ' + (queuePosition?.state === 'active' ? 'text-green-600' : 'text-blue-600')}>
                        {queuePosition?.state}
                      </p>
                    </div>
                                      {queuePosition?.state === 'pending' && (
                      <p className="text-sm text-gray-500 mt-6 font-medium">Approximate wait: <span className="font-bold text-gray-700">~{(queuePosition?.position || 0) * 5} mins</span></p>
                    )}
                 </>
               )}
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm">
              <div className="flex justify-between mb-2">
                <span className="text-gray-500">Service Area</span>
                <span className="font-semibold text-gray-800">
                  {services.find(s => s.id === selectedService)?.name || 'Loading...'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Identity Mode</span>
                <span className="font-semibold text-gray-800 uppercase">{authMode || 'Loading...'}</span>
              </div>
            </div>

            <button onClick={logout} className="w-full py-3 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 border border-transparent transition-all">
              Leave Queue & Logout
            </button>
          </div>
        )}
      </div>
      
      {}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-blue-100/50 to-transparent z-0 pointer-events-none"></div>
    </div>
  );
}

export default UserInterface;
