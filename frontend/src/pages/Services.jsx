import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Server, Plus, Clipboard, Check, ChevronLeft, LogOut, Activity } from 'lucide-react'
import { useStore } from '../store/useStore'
import ConnectionStatus from '../components/ConnectionStatus'

export const Services = () => {
  const navigate = useNavigate()
  const token = useStore((state) => state.token)
  const logout = useStore((state) => state.logout)
  const services = useStore((state) => state.services)
  const setServices = useStore((state) => state.setServices)

  // Modal Controls
  const [showAddModal, setShowAddModal] = useState(false)
  const [newServiceName, setNewServiceName] = useState('')
  const [newServiceDesc, setNewServiceDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [createdApiKey, setCreatedApiKey] = useState('')
  const [copied, setCopied] = useState(false)

  // Redirect if unauthenticated
  useEffect(() => {
    if (!token) navigate('/login')
  }, [token, navigate])

  const fetchServices = () => {
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      fetch('/api/services/', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setServices(data)
      })
      .catch(err => console.error('Could not fetch services:', err))
    }
  }

  // Create Service Handler
  const handleCreateService = async (e) => {
    e.preventDefault()
    if (!newServiceName.trim()) return

    setLoading(true)
    
    if (token === 'demo_jwt_token_key_devpulse') {
      // Mock creation in demo mode
      const mockNew = {
        id: `mock-srv-${Math.random().toString(36).substr(2, 9)}`,
        name: newServiceName.trim(),
        description: newServiceDesc,
        api_key: `dp_mock_${Math.random().toString(36).substr(2, 24)}`,
        owner_id: 'user-1',
        created_at: new Date().toISOString(),
        is_active: true
      }
      setServices([mockNew, ...services])
      setCreatedApiKey(mockNew.api_key)
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/services/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newServiceName.trim(), description: newServiceDesc })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Service creation failed')

      setCreatedApiKey(data.api_key)
      fetchServices()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCloseModal = () => {
    setShowAddModal(false)
    setNewServiceName('')
    setNewServiceDesc('')
    setCreatedApiKey('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="min-h-screen flex flex-col p-4 md:p-6 space-y-6"
    >
      
      {/* 1. TOP NAVBAR */}
      <nav className="glass-card rounded px-4 py-3 flex items-center justify-between border-white/6 select-none shadow-2xl">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <ChevronLeft className="w-4 h-4 text-neutral-400" />
          <span className="font-mono text-base font-bold text-white tracking-widest uppercase">
            DEV<span className="text-accent-cyan">PULSE</span> / SERVICES
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <ConnectionStatus />
          <div className="flex items-center space-x-2 border-l border-white/6 pl-4">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase cursor-pointer"
            >
              Dashboard
            </button>
            <button 
              onClick={() => navigate('/alerts')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase ml-3 cursor-pointer"
            >
              Alerts
            </button>
          </div>
          <button 
            onClick={logout} 
            className="p-1.5 bg-status-critical/10 border border-status-critical/15 hover:bg-status-critical/20 text-status-critical rounded cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* 2. SERVICES LIST CARD */}
      <div className="glass-card p-6 rounded border-white/6 flex flex-col text-left">
        
        {/* Table Header Controls */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 flex-wrap gap-3">
          <div className="flex flex-col space-y-0.5">
            <h2 className="text-sm font-semibold text-white uppercase tracking-widest">
              Active Monitored Services
            </h2>
            <p className="text-[9px] text-neutral-500 font-mono tracking-wider">
              SERVICE_RESOURCE_INVENTORY
            </p>
          </div>

          {/* High Contrast Add Service Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-accent-cyan text-black hover:bg-white font-mono font-bold text-xs uppercase px-4 py-2 rounded tracking-widest transition-all duration-300 flex items-center space-x-2 select-none cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ADD_SERVICE</span>
          </button>
        </div>

        {/* Services Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-white/5 font-mono text-[10px] text-neutral-500 uppercase tracking-wider select-none">
                <th className="py-3 pl-2">Name</th>
                <th className="py-3">Description</th>
                <th className="py-3">Created At</th>
                <th className="py-3">SDK Key</th>
                <th className="py-3 text-right pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {services.map((srv) => (
                <tr 
                  key={srv.id}
                  onClick={() => navigate(`/services/${srv.id}`)}
                  className="border-b border-white/[0.02] hover:bg-white/[0.015] transition-all cursor-pointer group"
                >
                  <td className="py-4 pl-2 font-mono font-bold text-white uppercase group-hover:text-accent-cyan transition-all">
                    <div className="flex items-center space-x-2">
                      <Server className="w-3.5 h-3.5 text-neutral-500 group-hover:text-accent-cyan" />
                      <span>{srv.name}</span>
                    </div>
                  </td>
                  <td className="py-4 text-neutral-400">
                    {srv.description || 'No description provided'}
                  </td>
                  <td className="py-4 text-neutral-500 font-mono">
                    {new Date(srv.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 font-mono text-neutral-500 select-all" onClick={(e) => e.stopPropagation()}>
                    {srv.api_key.substring(0, 10)}...
                  </td>
                  <td className="py-4 text-right pr-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-widest bg-status-healthy/10 text-status-healthy border border-status-healthy/20 uppercase">
                      ACTIVE
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. ADD SERVICE MODAL */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card max-w-md w-full p-6 rounded border-white/8 text-left shadow-2xl relative"
            >
              <h2 className="text-sm font-semibold text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-6">
                REGISTER_NEW_MICROSERVICE
              </h2>

              {!createdApiKey ? (
                // Form view
                <form onSubmit={handleCreateService} className="space-y-4">
                  <div>
                    <label className="block text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-1.5 font-mono">
                      SERVICE_NAME
                    </label>
                    <input
                      type="text"
                      value={newServiceName}
                      onChange={(e) => setNewServiceName(e.target.value)}
                      placeholder="e.g. gateway-service"
                      className="w-full bg-white/3 border border-white/6 rounded px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-accent-cyan/40 transition-all font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-1.5 font-mono">
                      DESCRIPTION
                    </label>
                    <textarea
                      value={newServiceDesc}
                      onChange={(e) => setNewServiceDesc(e.target.value)}
                      placeholder="Service details and operational constraints..."
                      rows="3"
                      className="w-full bg-white/3 border border-white/6 rounded px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-accent-cyan/40 transition-all font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-4 py-2 bg-white/4 border border-white/6 hover:bg-white/8 text-neutral-400 hover:text-white rounded text-xs font-mono font-bold uppercase tracking-widest select-none cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 bg-accent-cyan text-black hover:bg-white font-mono font-bold text-xs uppercase rounded tracking-widest transition-all select-none cursor-pointer"
                    >
                      {loading ? 'CREATING...' : 'CREATE'}
                    </button>
                  </div>
                </form>
              ) : (
                // Success view: Display SDK credentials
                <div className="space-y-4">
                  <div className="bg-status-healthy/10 border border-status-healthy/20 text-status-healthy px-3 py-2.5 rounded text-xs font-mono mb-4 text-left leading-relaxed">
                    SUCCESS: Service registered. Copy the credentials key below to deploy in your microservice config daemons.
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-1.5 font-mono">
                      SDK_API_KEY (SECRET)
                    </label>
                    <div className="flex items-center space-x-2 bg-black/60 border border-white/6 rounded px-3 py-2">
                      <span className="font-mono text-xs text-accent-cyan break-all flex-1 select-all">
                        {createdApiKey}
                      </span>
                      <button
                        onClick={() => handleCopy(createdApiKey)}
                        className="p-1.5 hover:bg-white/5 rounded text-neutral-400 hover:text-white transition-all cursor-pointer"
                        title="Copy Key"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-status-healthy" /> : <Clipboard className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleCloseModal}
                    className="w-full bg-white/5 hover:bg-white/10 text-white font-mono font-bold text-xs uppercase py-2.5 rounded border border-white/8 tracking-widest transition-all select-none cursor-pointer mt-6"
                  >
                    CLOSE_MODAL
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  )
}

export default Services
