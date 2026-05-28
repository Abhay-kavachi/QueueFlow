import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

interface QueueEntry {
  id: string;
  position: number;
  state: string;
  user_hash: string;
}

function DisplayBoard() {
  const { serviceId } = useParams();
  const [activePatient, setActivePatient] = useState<QueueEntry | null>(null);
  const [nextPatients, setNextPatients] = useState<QueueEntry[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [serviceName, setServiceName] = useState('');
  
  const [flash, setFlash] = useState(false);
  const prevActiveRef = useRef<number | null>(null);

  useEffect(() => {
    // Play chime and flash when active patient changes
    if (activePatient && activePatient.position !== prevActiveRef.current) {
      if (prevActiveRef.current !== null) { // Don't chime on initial load if we don't want to
        playChime();
        setFlash(true);
        setTimeout(() => setFlash(false), 3000);
      }
      prevActiveRef.current = activePatient.position;
    }
  }, [activePatient]);

  const playChime = () => {
    try {
      const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
      audio.volume = 1.0;
      audio.play().catch(e => console.log('Audio play failed (browser policy):', e));
    } catch (e) {}
  };

  const fetchDisplayData = async () => {
    try {
      const res = await axios.get(`http://localhost:3001/api/queue/services/${serviceId}/display`);
      setActivePatient(res.data.active || null);
      setNextPatients(res.data.next || []);
      setServiceName(res.data.serviceName || `Service #${serviceId}`);
    } catch (err) {
      console.error('Failed to fetch display data', err);
    }
  };

  useEffect(() => {
    fetchDisplayData();
    
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);
    
    newSocket.on('connect', () => {
      newSocket.emit('join_queue', serviceId);
    });

    newSocket.on('queue_updated', () => {
      fetchDisplayData();
    });

    return () => {
      newSocket.disconnect();
    };
  }, [serviceId]);

  return (
    <div className={`min-h-screen bg-gray-900 text-white flex flex-col p-8 transition-colors duration-500 ${flash ? 'bg-blue-900' : ''}`}>
      <header className="mb-12 text-center">
        <h1 className="text-6xl font-black tracking-tight text-blue-400 mb-4">{serviceName}</h1>
        <p className="text-2xl text-gray-400 uppercase tracking-widest font-bold">Now Serving</p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center -mt-12">
        <div className={`w-full max-w-4xl bg-gray-800 rounded-[3rem] border-4 p-16 text-center shadow-2xl transition-all duration-300 ${flash ? 'scale-105 border-blue-400 shadow-blue-500/50' : 'border-gray-700'}`}>
          {activePatient ? (
            <>
              <p className="text-3xl text-gray-400 font-bold uppercase tracking-widest mb-6">Token Number</p>
              <h2 className="text-[12rem] leading-none font-black text-green-400 tracking-tighter">
                #{activePatient.position}
              </h2>
              <div className="mt-8">
                <span className="inline-block px-8 py-3 bg-green-500/20 text-green-400 text-4xl font-extrabold rounded-full animate-pulse">
                  PLEASE PROCEED
                </span>
              </div>
            </>
          ) : (
            <div className="py-20">
              <h2 className="text-5xl font-black text-gray-500">Waiting for next patient...</h2>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-auto">
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-xl font-bold text-gray-400 uppercase tracking-widest mb-4">Coming Up Next</h3>
          <div className="flex gap-4 overflow-hidden">
            {nextPatients.length > 0 ? (
              nextPatients.map(p => (
                <div key={p.id} className="bg-gray-700 px-6 py-4 rounded-xl text-3xl font-black text-white">
                  #{p.position}
                </div>
              ))
            ) : (
              <p className="text-gray-500 font-medium">Queue is currently empty.</p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default DisplayBoard;
