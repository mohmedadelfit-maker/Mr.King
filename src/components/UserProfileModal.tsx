import React, { useState, useEffect } from 'react';
import { UserAccount, StoredDeviceEntry } from '../types';
import {
  apiChangeMasterCredentials,
  apiGetActiveSessions,
  apiTerminateSession,
  apiTerminateAllDevices,
  ActiveSessionInfo,
} from '../utils/auth';
import {
  apiAdminGetDevices,
  apiAdminApproveActivation,
  apiAdminRejectActivation,
  apiAdminDeviceAction,
} from '../utils/license';
import {
  ShieldCheck,
  KeyRound,
  Check,
  X,
  BadgeCheck,
  LogOut,
  Save,
  AlertCircle,
  User,
  ShieldAlert,
  Cloud,
  Laptop,
  Smartphone,
  Globe,
  Radio,
  RefreshCw,
  UserX,
  Clock,
  CheckCircle2,
  Crown,
  Sparkles,
  Calendar,
  Send,
  Building2,
  Phone,
  Ban,
  PlusCircle,
  Copy,
  ChevronDown,
  PowerOff,
  Trash2,
  MapPin,
  ExternalLink,
  Search,
} from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  onUpdateUser: (updatedUser: UserAccount) => void;
  onLogout: () => void;
}

type DurationOption = '1_month' | '3_months' | '6_months' | '1_year' | '2_years' | 'lifetime' | 'custom_days';

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onLogout,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'approvals' | 'devices' | 'security'>('approvals');

  // Security Credentials Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(currentUser.username);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState(currentUser.name);

  // Active Sessions State
  const [sessions, setSessions] = useState<ActiveSessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);
  const [isTerminatingAll, setIsTerminatingAll] = useState(false);

  // Devices & Approvals State
  const [pendingRequests, setPendingRequests] = useState<StoredDeviceEntry[]>([]);
  const [allDevices, setAllDevices] = useState<StoredDeviceEntry[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Per-request selected duration map (deviceId -> durationOption)
  const [selectedDurations, setSelectedDurations] = useState<Record<string, DurationOption>>({});
  const [customDaysMap, setCustomDaysMap] = useState<Record<string, number>>({});
  const [branchNameEditMap, setBranchNameEditMap] = useState<Record<string, string>>({});

  // Direct Manual Activation State
  const [manualDeviceId, setManualDeviceId] = useState('');
  const [manualBranchName, setManualBranchName] = useState('');
  const [manualDuration, setManualDuration] = useState<DurationOption>('1_year');
  const [manualCustomDays, setManualCustomDays] = useState(30);
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);

  // Search filter
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');

  // Inline Confirmation States (Reliable in iframes without window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmTerminateId, setConfirmTerminateId] = useState<string | null>(null);
  const [confirmTerminateAll, setConfirmTerminateAll] = useState(false);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Load active sessions
  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await apiGetActiveSessions();
      if (res.success && res.sessions) {
        setSessions(res.sessions);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Load devices & pending approvals
  const fetchDevicesAndApprovals = async () => {
    setIsLoadingDevices(true);
    try {
      const res = await apiAdminGetDevices();
      if (res.success) {
        const pending = res.pendingRequests || (res.devices || []).filter(d => d.activationRequested && !d.isActivated);
        setPendingRequests(pending);
        setAllDevices(res.devices || []);

        const newDurations: Record<string, DurationOption> = {};
        const newBranchNames: Record<string, string> = {};
        pending.forEach(d => {
          if (!selectedDurations[d.deviceId]) {
            newDurations[d.deviceId] = '1_year';
          }
          if (!branchNameEditMap[d.deviceId]) {
            newBranchNames[d.deviceId] = d.requestedBranch || d.branchName || d.clientName || 'Branch Terminal';
          }
        });
        setSelectedDurations(prev => ({ ...newDurations, ...prev }));
        setBranchNameEditMap(prev => ({ ...newBranchNames, ...prev }));
      }
    } catch {
      setErrorMessage('Unable to retrieve device records and activation requests.');
    } finally {
      setIsLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
      fetchDevicesAndApprovals();
    }
  }, [isOpen]);

  // Approve Activation Request
  const handleApproveDevice = async (device: StoredDeviceEntry) => {
    const durationType = selectedDurations[device.deviceId] || '1_year';
    const customDays = customDaysMap[device.deviceId] || 30;
    const branchName = branchNameEditMap[device.deviceId] || device.requestedBranch || device.branchName || 'Authorized Branch';

    setActionInProgressId(device.deviceId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await apiAdminApproveActivation({
        deviceId: device.deviceId,
        durationType,
        customDays,
        branchName,
      });

      if (res.success) {
        setSuccessMessage(res.message || 'Device approved and activated successfully!');
        fetchDevicesAndApprovals();
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setErrorMessage(res.message || 'Failed to approve activation.');
      }
    } catch {
      setErrorMessage('Network error while communicating approval to server.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Reject Request
  const handleRejectDevice = async (deviceId: string) => {
    setActionInProgressId(deviceId);
    setErrorMessage('');
    try {
      const res = await apiAdminRejectActivation(deviceId);
      if (res.success) {
        setSuccessMessage(res.message || 'Activation request dismissed.');
        setConfirmRejectId(null);
        fetchDevicesAndApprovals();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setErrorMessage(res.error || 'Failed to dismiss request.');
      }
    } catch {
      setErrorMessage('Unable to connect to server.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Quick Action on already registered device (Extend, Set duration, Revoke, 5m test, Delete)
  const handleDeviceQuickAction = async (
    action: 'extend_trial' | 'set_duration' | 'revoke' | 'set_trial_5m' | 'delete',
    deviceId: string,
    durationDays?: number
  ) => {
    setActionInProgressId(deviceId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await apiAdminDeviceAction(
        action,
        deviceId,
        24,
        undefined,
        durationDays || 365
      );

      if (res.success) {
        setSuccessMessage(res.message || 'Device configuration updated successfully.');
        if (action === 'delete') {
          setAllDevices(prev => prev.filter(d => d.deviceId !== deviceId));
          setPendingRequests(prev => prev.filter(d => d.deviceId !== deviceId));
          setConfirmDeleteId(null);
        }
        if (action === 'revoke') {
          setConfirmRevokeId(null);
        }
        fetchDevicesAndApprovals();
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        setErrorMessage(res.error || 'Failed to execute device action.');
      }
    } catch {
      setErrorMessage('Unable to connect to license server.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Manual Direct Activation
  const handleManualActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDeviceId.trim()) {
      setErrorMessage('Please enter the Device ID.');
      return;
    }

    setIsManualSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await apiAdminApproveActivation({
        deviceId: manualDeviceId.trim().toUpperCase(),
        durationType: manualDuration,
        customDays: manualCustomDays,
        branchName: manualBranchName.trim() || 'New Branch',
      });

      if (res.success) {
        setSuccessMessage(res.message || 'تم اعتماد وتفعيل الجهاز بنجاح! Device activated successfully.');
        setManualDeviceId('');
        setManualBranchName('');
        fetchDevicesAndApprovals();
        setTimeout(() => setSuccessMessage(''), 6000);
      } else {
        setErrorMessage(res.message || res.error || 'تعذر تفعيل الجهاز. يرجى المحاولة مجدداً.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر الاتصال بسيرفر التراخيص المركزي.');
    } finally {
      setIsManualSubmitting(false);
    }
  };

  // Kick session
  const handleTerminateSession = async (sessionId: string) => {
    setTerminatingSessionId(sessionId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await apiTerminateSession(sessionId);
      if (res.success) {
        setSuccessMessage(res.message || 'Session revoked successfully.');
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setConfirmTerminateId(null);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setErrorMessage(res.error || 'Failed to revoke session.');
      }
    } catch {
      setErrorMessage('Error terminating session.');
    } finally {
      setTerminatingSessionId(null);
    }
  };

  // Terminate all other sessions
  const handleTerminateAllDevices = async () => {
    setIsTerminatingAll(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await apiTerminateAllDevices();
      if (res.success) {
        setSuccessMessage(res.message || 'All other devices logged out.');
        setSessions(prev => prev.filter(s => s.isCurrent));
        setConfirmTerminateAll(false);
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        setErrorMessage(res.error || 'Failed to revoke sessions.');
      }
    } catch {
      setErrorMessage('Error terminating sessions.');
    } finally {
      setIsTerminatingAll(false);
    }
  };

  // Change master credentials
  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await apiChangeMasterCredentials(
        currentPassword,
        newUsername.trim(),
        newPassword ? newPassword.trim() : currentPassword,
        name.trim()
      );

      if (res.success) {
        setSuccessMessage('Credentials updated successfully. All other devices have been logged out.');
        if (res.user) {
          onUpdateUser(res.user);
        }
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        fetchSessions();
      } else {
        setErrorMessage(res.error || 'Failed to update credentials.');
      }
    } catch {
      setErrorMessage('Network connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter devices by search
  const filteredDevices = allDevices.filter(d => {
    if (!deviceSearchQuery.trim()) return true;
    const q = deviceSearchQuery.toLowerCase();
    return (
      d.deviceId.toLowerCase().includes(q) ||
      (d.branchName && d.branchName.toLowerCase().includes(q)) ||
      (d.clientName && d.clientName.toLowerCase().includes(q)) ||
      (d.city && d.city.toLowerCase().includes(q)) ||
      (d.address && d.address.toLowerCase().includes(q)) ||
      (d.ip && d.ip.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#EA580C] flex items-center justify-center shadow-xs">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Master Administration Console
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Burger King & Talabat Audit Licensing & Device Management
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Notification Banner for Pending Approvals */}
        {pendingRequests.length > 0 && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2.5 flex items-center justify-between gap-3 text-xs font-bold text-amber-900">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#EA580C]" />
              </span>
              <span>
                {pendingRequests.length} Device{pendingRequests.length > 1 ? 's' : ''} Pending Activation Approval!
              </span>
              <span className="text-slate-600 font-medium hidden sm:inline">
                ({pendingRequests.map(d => d.requestedBranch || d.deviceId).slice(0, 2).join(', ')})
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('approvals')}
              className="px-3 py-1 bg-[#EA580C] hover:bg-[#C2410C] text-white text-[11px] font-black rounded-lg transition-colors cursor-pointer"
            >
              Review & Approve
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'approvals'
                ? 'border-[#EA580C] text-[#EA580C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Device Approvals & Licenses</span>
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('devices');
              fetchSessions();
            }}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'devices'
                ? 'border-[#EA580C] text-[#EA580C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Active Sessions ({sessions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'border-[#EA580C] text-[#EA580C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Admin Password & Profile</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Feedback Messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs font-bold text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-xs font-bold text-emerald-800">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>{successMessage}</div>
            </div>
          )}

          {/* ================= TAB 1: DEVICE APPROVALS ================= */}
          {activeTab === 'approvals' && (
            <div className="space-y-6">
              {/* SECTION 1: PENDING APPROVALS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      {pendingRequests.length > 0 && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                      )}
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${pendingRequests.length > 0 ? 'bg-[#EA580C]' : 'bg-slate-300'}`} />
                    </span>
                    <h4 className="text-sm font-black text-slate-900">
                      Pending Activation Requests ({pendingRequests.length})
                    </h4>
                  </div>

                  <button
                    type="button"
                    onClick={fetchDevicesAndApprovals}
                    disabled={isLoadingDevices}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {pendingRequests.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
                    <h5 className="text-xs font-bold text-slate-800">No pending activation requests</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5 max-w-sm mx-auto">
                      All connected devices are either licensed or operating on valid trials. When a new branch submits a request, it will appear here immediately with full GPS location and live tracking.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map(device => {
                      const currentDuration = selectedDurations[device.deviceId] || '1_year';
                      const currentBranch = branchNameEditMap[device.deviceId] ?? (device.requestedBranch || device.branchName || 'Branch Terminal');
                      const isActing = actionInProgressId === device.deviceId;
                      const hasLocation = Boolean(device.latitude || device.city || device.address);

                      const googleMapsUrl = device.latitude && device.longitude
                        ? `https://www.google.com/maps?q=${device.latitude},${device.longitude}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(device.address || device.city || device.ip)}`;

                      return (
                        <div
                          key={device.deviceId}
                          className="bg-orange-50/40 border-2 border-orange-300/80 rounded-2xl p-4 shadow-xs space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-orange-200 pb-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[#EA580C]" />
                                <input
                                  type="text"
                                  value={currentBranch}
                                  onChange={e =>
                                    setBranchNameEditMap(prev => ({
                                      ...prev,
                                      [device.deviceId]: e.target.value,
                                    }))
                                  }
                                  placeholder="Branch Name"
                                  className="font-black text-sm text-slate-900 bg-white border border-slate-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                                />
                                <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200">
                                  New Request
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono">
                                <span>ID: <strong className="text-slate-900">{device.deviceId}</strong></span>
                                {device.requestedPhone && (
                                  <a
                                    href={`https://wa.me/${device.requestedPhone.replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-700 hover:underline flex items-center gap-1 font-bold"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>{device.requestedPhone}</span>
                                  </a>
                                )}
                                <span className="text-slate-400">IP: {device.ip}</span>
                              </div>

                              {/* Location Tracking Box */}
                              <div className="flex items-center gap-2 pt-1">
                                <span className="inline-flex items-center gap-1 text-xs text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                                  <MapPin className="w-3.5 h-3.5 text-[#EA580C]" />
                                  <span>Location:</span>
                                  <strong className="text-slate-900">
                                    {device.address || (device.city ? `${device.city}, ${device.country || ''}` : 'Location unconfirmed')}
                                  </strong>
                                </span>

                                <a
                                  href={googleMapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Track on Google Maps</span>
                                </a>
                              </div>
                            </div>

                            <div className="text-right text-[11px] text-slate-400 shrink-0">
                              {device.requestedAt ? new Date(device.requestedAt).toLocaleTimeString() : 'Just now'}
                            </div>
                          </div>

                          {device.requestedNotes && (
                            <div className="text-xs bg-white p-2.5 rounded-xl border border-slate-200 text-slate-700">
                              <span className="font-bold text-slate-900">Client Note:</span> {device.requestedNotes}
                            </div>
                          )}

                          {/* Duration Selector */}
                          <div className="space-y-1.5 pt-1">
                            <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-[#EA580C]" />
                              <span>Select Granted License Duration:</span>
                            </label>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-semibold">
                              {[
                                { id: '1_month', label: '1 Month (30 Days)' },
                                { id: '3_months', label: '3 Months (90 Days)' },
                                { id: '6_months', label: '6 Months (180 Days)' },
                                { id: '1_year', label: '⭐ 1 Full Year (365 Days)' },
                                { id: '2_years', label: '2 Years (730 Days)' },
                                { id: 'lifetime', label: '👑 Lifetime Perpetual' },
                                { id: 'custom_days', label: 'Custom Days' },
                              ].map(opt => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedDurations(prev => ({
                                      ...prev,
                                      [device.deviceId]: opt.id as DurationOption,
                                    }))
                                  }
                                  className={`px-2.5 py-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                                    currentDuration === opt.id
                                      ? 'bg-slate-900 text-white border-slate-900 font-bold shadow-xs'
                                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>

                            {currentDuration === 'custom_days' && (
                              <div className="flex items-center gap-2 pt-1">
                                <span className="text-xs font-bold text-slate-700">Days:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="3650"
                                  value={customDaysMap[device.deviceId] || 30}
                                  onChange={e =>
                                    setCustomDaysMap(prev => ({
                                      ...prev,
                                      [device.deviceId]: Number(e.target.value) || 30,
                                    }))
                                  }
                                  className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-xs font-bold text-center"
                                />
                              </div>
                            )}
                          </div>

                          {/* Approval Actions */}
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-orange-200">
                            {confirmRejectId === device.deviceId ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleRejectDevice(device.deviceId)}
                                  disabled={isActing}
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  Confirm Dismiss?
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRejectId(null)}
                                  className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRejectId(device.deviceId)}
                                disabled={isActing}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                Dismiss
                              </button>
                            )}

                            <button
                              type="submit"
                              onClick={() => handleApproveDevice(device)}
                              disabled={isActing}
                              className="px-5 py-2 bg-[#EA580C] hover:bg-[#C2410C] text-white rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {isActing ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Check className="w-4 h-4" />
                                  <span>Approve & Activate Terminal Now</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION 2: MANUAL DIRECT ACTIVATION (For codes received via WhatsApp) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-[#EA580C]" />
                  <h4 className="text-xs font-black text-slate-900">
                    Manual Direct Activation (Activate any Device ID directly)
                  </h4>
                </div>

                <form onSubmit={handleManualActivateSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Device ID:
                      </label>
                      <input
                        type="text"
                        value={manualDeviceId}
                        onChange={e => setManualDeviceId(e.target.value)}
                        placeholder="BK-DEV-XXXX-XXXX"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Branch / Client Name:
                      </label>
                      <input
                        type="text"
                        value={manualBranchName}
                        onChange={e => setManualBranchName(e.target.value)}
                        placeholder="e.g. Burger King Zamalek"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        License Duration:
                      </label>
                      <select
                        value={manualDuration}
                        onChange={e => setManualDuration(e.target.value as DurationOption)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                      >
                        <option value="1_month">1 Month (30 Days)</option>
                        <option value="3_months">3 Months (90 Days)</option>
                        <option value="6_months">6 Months (180 Days)</option>
                        <option value="1_year">1 Full Year (365 Days)</option>
                        <option value="2_years">2 Years (730 Days)</option>
                        <option value="lifetime">👑 Lifetime Perpetual</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isManualSubmitting}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      {isManualSubmitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Pre-Activate Device Now</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* SECTION 3: ALL REGISTERED DEVICES TABLE */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-slate-900">
                    Tracked Terminals & Hardware Inventory ({filteredDevices.length})
                  </h4>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={deviceSearchQuery}
                      onChange={e => setDeviceSearchQuery(e.target.value)}
                      placeholder="Search branch, ID, location, IP..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                    />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                          <th className="p-3">Terminal / Branch</th>
                          <th className="p-3">Location & Maps</th>
                          <th className="p-3">License Status</th>
                          <th className="p-3">Expiry Date</th>
                          <th className="p-3 text-center">Actions & Quick Manage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDevices.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400">
                              No devices matching search criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredDevices.map(d => {
                            const isLifetime = d.planType === 'lifetime';
                            const expiresDate = isLifetime
                              ? 'Perpetual'
                              : d.licenseExpiresAt && d.licenseExpiresAt > 0
                              ? new Date(d.licenseExpiresAt).toLocaleDateString()
                              : d.trialExpiresAt
                              ? new Date(d.trialExpiresAt).toLocaleDateString()
                              : '—';

                            const googleMapsUrl = d.latitude && d.longitude
                              ? `https://www.google.com/maps?q=${d.latitude},${d.longitude}`
                              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address || d.city || d.ip)}`;

                            const isActing = actionInProgressId === d.deviceId;

                            return (
                              <tr key={d.deviceId} className="hover:bg-slate-50/70 transition-colors">
                                <td className="p-3">
                                  <div className="font-bold text-slate-900">
                                    {d.branchName || d.clientName || d.requestedBranch || 'Unnamed Terminal'}
                                  </div>
                                  <div className="font-mono text-[11px] text-slate-500">{d.deviceId}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    IP: {d.ip} • {d.deviceName || 'PC'}
                                  </div>
                                </td>

                                <td className="p-3">
                                  <div className="text-xs text-slate-800 font-medium">
                                    {d.address || (d.city ? `${d.city}, ${d.country || ''}` : 'Location unconfirmed')}
                                  </div>
                                  <a
                                    href={googleMapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-bold mt-1"
                                  >
                                    <MapPin className="w-3 h-3 text-[#EA580C]" />
                                    <span>Track on Maps</span>
                                  </a>
                                </td>

                                <td className="p-3">
                                  {d.status === 'active' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                                      <Check className="w-3 h-3" />
                                      <span>Licensed {isLifetime ? '(Lifetime)' : ''}</span>
                                    </span>
                                  ) : d.status === 'pending_approval' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-orange-800">
                                      <Clock className="w-3 h-3" />
                                      <span>Pending Approval</span>
                                    </span>
                                  ) : d.status === 'trial' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                                      <span>Trial Active</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                                      <span>Expired / Locked</span>
                                    </span>
                                  )}
                                </td>

                                <td className="p-3 font-mono text-[11px] text-slate-600">
                                  {expiresDate}
                                </td>

                                <td className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    {/* +1 Year */}
                                    <button
                                      type="button"
                                      onClick={() => handleDeviceQuickAction('set_duration', d.deviceId, 365)}
                                      disabled={isActing}
                                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-[10px] font-black cursor-pointer transition-colors"
                                      title="Extend 1 full year"
                                    >
                                      +1 Yr
                                    </button>

                                    {/* Lifetime */}
                                    <button
                                      type="button"
                                      onClick={() => handleDeviceQuickAction('set_duration', d.deviceId, 0)}
                                      disabled={isActing}
                                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-black cursor-pointer transition-colors"
                                      title="Activate Lifetime License"
                                    >
                                      Lifetime
                                    </button>

                                    {/* 5-Min Test Trial */}
                                    <button
                                      type="button"
                                      onClick={() => handleDeviceQuickAction('set_trial_5m', d.deviceId)}
                                      disabled={isActing}
                                      className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                                      title="Reset to 5-minute test trial to test lock screen"
                                    >
                                      ⏱️ 5m Test
                                    </button>

                                    {/* Revoke */}
                                    {d.isActivated && (
                                      confirmRevokeId === d.deviceId ? (
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleDeviceQuickAction('revoke', d.deviceId)}
                                            className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-black cursor-pointer"
                                          >
                                            Confirm Lock
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmRevokeId(null)}
                                            className="px-1.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmRevokeId(d.deviceId)}
                                          disabled={isActing}
                                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                                          title="Revoke license and lock terminal immediately"
                                        >
                                          Revoke
                                        </button>
                                      )
                                    )}

                                    {/* Wipe / Delete Device */}
                                    {confirmDeleteId === d.deviceId ? (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleDeviceQuickAction('delete', d.deviceId)}
                                          disabled={isActing}
                                          className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black cursor-pointer shadow-xs animate-pulse"
                                        >
                                          Confirm Delete?
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="px-1.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(d.deviceId)}
                                        disabled={isActing}
                                        className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                                        title="Delete device completely from system records"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: ACTIVE SESSIONS (KICK DEVICES) ================= */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    Active Admin Sessions ({sessions.length})
                  </h4>
                  <p className="text-xs text-slate-500">
                    View and immediately terminate unauthorized or stale browser sessions.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchSessions}
                    disabled={isLoadingSessions}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>

                  {confirmTerminateAll ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleTerminateAllDevices}
                        disabled={isTerminatingAll}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                      >
                        Confirm Kick All?
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTerminateAll(false)}
                        className="px-2 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmTerminateAll(true)}
                      disabled={isTerminatingAll || sessions.filter(s => !s.isCurrent).length === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                      <span>Kick All Other Devices</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                {sessions.map(s => {
                  const isCurrent = Boolean(s.isCurrent);
                  const isTerminating = terminatingSessionId === s.id;

                  return (
                    <div
                      key={s.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            isCurrent
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Laptop className="w-4 h-4" />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">
                              {s.deviceName || 'Web Browser Terminal'}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                                This Browser (Active)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            IP: {s.ip} • Logged in: {new Date(s.loginTime).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      {!isCurrent && (
                        confirmTerminateId === s.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleTerminateSession(s.id)}
                              disabled={isTerminating}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                            >
                              Confirm Kick
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmTerminateId(null)}
                              className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmTerminateId(s.id)}
                            disabled={isTerminating}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Kick Session
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= TAB 3: ADMIN SECURITY & CREDENTIALS ================= */}
          {activeTab === 'security' && (
            <form onSubmit={handleSaveSecurity} className="space-y-4 max-w-md mx-auto py-2">
              <div className="text-center mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#EA580C] flex items-center justify-center mx-auto mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-black text-slate-900">Change Master Password & Admin User</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updating your credentials revokes all other active sessions across any connected devices.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Admin Display Name:
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Master Username:
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Current Master Password:
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password to authorize changes"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New Password (leave blank to keep current):
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                />
              </div>

              {newPassword && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Confirm New Password:
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-[#EA580C] hover:bg-[#C2410C] text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save & Update Master Credentials</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Logged in as: <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.username})</span>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-800 font-bold transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out Admin Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
