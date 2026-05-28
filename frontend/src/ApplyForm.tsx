import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
interface Service {
  id: number;
  name: string;
  description: string;
}
interface FormData {
  fullName: string;
  email: string;
  phone: string;
  aadhaar: string;
  serviceType: number;
  appointmentDate?: string;
  appointmentTime?: string;
  urgency: 'normal' | 'urgent' | 'emergency';
  description: string;
}
function ApplyForm() {
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    email: '',
    phone: '',
    aadhaar: '',
    serviceType: 1,
    urgency: 'normal',
    description: ''
  });
  const [isAppointment, setIsAppointment] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  useEffect(() => {
    fetchServices();
  }, []);
  const fetchServices = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/queue/services');
      setServices(response.data.data);
      if (response.data.data.length > 0) {
        setFormData(prev => ({ ...prev, serviceType: response.data.data[0].id }));
      }
    } catch (error) {
      console.error('Error fetching services:', error);
      setMessage('Failed to load services');
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.phone || !formData.aadhaar) {
      setMessage('Please fill in all required fields');
      return;
    }
    if (!/^\d{12}$/.test(formData.aadhaar)) {
      setMessage('Aadhaar must be 12 digits');
      return;
    }
    if (!/^\d{10}$/.test(formData.phone)) {
      setMessage('Phone number must be 10 digits');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setMessage('Please enter a valid email');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      setTimeout(() => {
        setMessage('Application submitted successfully! We will contact you shortly.');
        setFormData({
          fullName: '',
          email: '',
          phone: '',
          aadhaar: '',
          serviceType: services[0]?.id || 1,
          urgency: 'normal',
          description: ''
        });
        setIsAppointment(false);
      }, 2000);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to submit application');
    } finally {
      setIsLoading(false);
    }
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl bg-white rounded-lg shadow-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-blue-600 mb-2">Service Application</h1>
          <p className="text-gray-600">QueueFlow - Apply for Services</p>
        </div>
        <div className="text-center mb-6">
          <button onClick={() => navigate('/')} className="btn btn-secondary px-4 py-2">
            ← Back to Home
          </button>
        </div>
        {message && (
          <div className={`alert ${message.includes('successfully') ? 'alert-success' : 'alert-error'} mb-4`}>
            {message}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {}
          <div className="card bg-gray-50 border border-gray-200 rounded-lg p-5">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Personal Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="your.email@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Aadhaar Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="aadhaar"
                  value={formData.aadhaar}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="12-digit Aadhaar number"
                  maxLength={12}
                  required
                />
              </div>
            </div>
          </div>
          {}
          <div className="card bg-gray-50 border border-gray-200 rounded-lg p-5 mt-6">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Service Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Service Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="serviceType"
                  value={formData.serviceType}
                  onChange={handleInputChange}
                  className="input"
                  required
                >
                  {services.map(service => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  Application Type
                </label>
                <div className="flex gap-4 items-center mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!isAppointment}
                      onChange={() => setIsAppointment(false)}
                      className="w-4 h-4 text-blue-600"
                    />
                    Walk-in Service
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={isAppointment}
                      onChange={() => setIsAppointment(true)}
                      className="w-4 h-4 text-blue-600"
                    />
                    Appointment
                  </label>
                </div>
              </div>
              {isAppointment && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      marginBottom: '0.25rem', 
                      color: '#374151' 
                    }}>
                      Preferred Date
                    </label>
                    <input
                      type="date"
                      name="appointmentDate"
                      value={formData.appointmentDate || ''}
                      onChange={handleInputChange}
                      className="input"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      marginBottom: '0.25rem', 
                      color: '#374151' 
                    }}>
                      Preferred Time
                    </label>
                    <input
                      type="time"
                      name="appointmentTime"
                      value={formData.appointmentTime || ''}
                      onChange={handleInputChange}
                      className="input"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Urgency Level
                </label>
                <select
                  name="urgency"
                  value={formData.urgency}
                  onChange={handleInputChange}
                  className="input"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="Briefly describe your service request..."
                  rows={3}
                />
              </div>
            </div>
          </div>
          {}
          <div className="text-center">
            <button
              type="submit"
              disabled={isLoading}
              className={`btn btn-primary w-full py-3 text-lg font-medium ${isLoading ? 'opacity-50' : ''}`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting Application...
                </span>
              ) : 'Submit Application'}
            </button>
          </div>
        </form>
          <div className="text-center mt-6 text-sm text-gray-500">
            <p>All fields marked with <span className="text-red-500">*</span> are required</p>
          </div>
      </div>
    </div>
  );
}
export default ApplyForm;
