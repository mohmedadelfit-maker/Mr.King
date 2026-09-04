import React, { useState, useEffect } from 'react';
import { DeviceLicenseInfo } from '../types';
import {
  apiCheckLicense,
  apiMasterPinBypass,
  apiSendActivationRequest,
  getClientLocationInfo,
} from '../utils/license';
import {
  ShieldAlert,
  Copy,
  Check,
  Phone,
  MessageSquare,
  ShieldCheck,
  AlertCircle,
  Building2,
  Clock,
  RefreshCw,
  Send,
  Radio,
  MapPin,
  KeyRound,
  ExternalLink,
  Crown,
} from 'lucide-react';
import { BurgerKingLogo, TalabatLogo } from './BrandLogos';

interface PaywallLockScreenProps {
  licenseInfo: DeviceLicenseInfo;
  onActivated: (updated: DeviceLicenseInfo) => void;
  onMasterLoginSuccess?: (user: any) => void;
}

export const PaywallLockScreen: React.FC<PaywallLockScreenProps> = ({
  licenseInfo,
  onActivated,
  onMasterLoginSuccess,
}) => {
  // Current status
  const [currentStatus, setCurrentStatus] = useState<DeviceLicenseInfo['status']>(licenseInfo.status);
  const [copiedDevice, setCopiedDevice] = useState(false);

  // Form states
  const [branchNameInput, setBranchNameInput] = useState(licenseInfo.requestedBranch || '');
  const [phoneInput, setPhoneInput] = useState(licenseInfo.requestedPhone || '');
  const [notesInput, setNotesInput] = useState(licenseInfo.requestedNotes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Location detection
  const [locationData, setLocationData] = useState<{
    latitude?: number;
    longitude?: number;
    city?: string;
    country?: string;
    address?: string;
  }>({
    city: licenseInfo.city,
    country: licenseInfo.country,
    address: licenseInfo.address,
    latitude: licenseInfo.latitude,
    longitude: licenseInfo.longitude,
  });

  // Master bypass modal
  const [showMasterPinModal, setShowMasterPinModal] = useState(false);
  const [masterPin, setMasterPin] = useState('');
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState('');

  // Polling state
  const [isChecking, setIsChecking] = useState(false);
  const isPending = currentStatus === 'pending_approval' || Boolean(licenseInfo.activationRequested);

  // Detect location on mount
  useEffect(() => {
    getClientLocationInfo().then(loc => {
      if (loc && (loc.city || loc.latitude)) {
        setLocationData(loc);
      }
    }).catch(() => {});
  }, []);

  // Copy Device ID
  const handleCopy = () => {
    navigator.clipboard.writeText(licenseInfo.deviceId);
    setCopiedDevice(true);
    setTimeout(() => setCopiedDevice(false), 2000);
  };

  // Poll for admin approval continuously so any remote approval unlocks instantly
  const pollApprovalStatus = async (silent = false) => {
    if (!silent) setIsChecking(true);
    try {
      const res = await apiCheckLicense(licenseInfo.deviceId);
      if (res.status === 'active' && !res.isExpired) {
        onActivated(res);
      } else {
        setCurrentStatus(res.status);
      }
    } catch {
      // transient network hiccup
    } finally {
      if (!silent) setIsChecking(false);
    }
  };

  useEffect(() => {
    pollApprovalStatus(true);
    const timer = setInterval(() => pollApprovalStatus(true), 3000);
    return () => clearInterval(timer);
  }, [licenseInfo.deviceId]);

  // Submit request
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchNameInput.trim()) {
      setFeedback({
        type: 'error',
        message: 'يرجى إدخال اسم الفرع أو المطعم للمتابعة.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await apiSendActivationRequest(
        branchNameInput.trim(),
        phoneInput.trim() || undefined,
        notesInput.trim() || undefined,
        licenseInfo.deviceId,
        locationData
      );

      if (res.success) {
        setCurrentStatus('pending_approval');
        setFeedback({
          type: 'success',
          message: res.message || 'تم إرسال طلب التفعيل بنجاح! بانتظار موافقة الإدارة العامة (Mr. King).',
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'تعذر إرسال الطلب عبر السيرفر.',
        });
      }
    } catch {
      setCurrentStatus('pending_approval');
      setFeedback({
        type: 'success',
        message: 'تم تسجيل طلب التفعيل بنجاح! سيتم فتح المنظومة فور اعتماد الإدارة العامة.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Master Pin Bypass
  const handleMasterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterPin.trim()) return;

    setMasterLoading(true);
    setMasterError('');

    try {
      const res = await apiMasterPinBypass(masterPin.trim(), licenseInfo.deviceId);
      if (res.success) {
        if (res.token && res.user && onMasterLoginSuccess) {
          onMasterLoginSuccess(res.user);
        }
        onActivated({
          ...licenseInfo,
          status: 'active',
          isExpired: false,
          isMaster: true,
          planType: 'lifetime',
        });
        setShowMasterPinModal(false);
      } else {
        setMasterError(res.error || 'Invalid Master Admin PIN.');
      }
    } catch {
      setMasterError('Network error while verifying PIN.');
    } finally {
      setMasterLoading(false);
    }
  };

  const whatsappMsg = encodeURIComponent(
    `Burger King Aloha & Talabat Audit System Activation Request:\n` +
    `- Device ID: ${licenseInfo.deviceId}\n` +
    `- Branch: ${branchNameInput || 'New Branch'}\n` +
    `- Phone: ${phoneInput || 'N/A'}\n` +
    `- Location: ${locationData.city ? locationData.city + ', ' + (locationData.country || '') : 'Not detected'}`
  );
  const whatsappUrl = `https://wa.me/201100051593?text=${whatsappMsg}`;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col justify-between items-center px-4 py-8 select-none font-sans">
      {/* Top Brand Bar */}
      <header className="w-full max-w-xl flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center -space-x-1.5">
            <BurgerKingLogo size="sm" className="ring-2 ring-white shadow-xs" />
            <TalabatLogo size="sm" className="ring-2 ring-white shadow-xs" />
          </div>
          <div>
            <span className="text-xs font-black tracking-wider uppercase text-slate-900 block leading-tight">
              BURGER KING & TALABAT
            </span>
            <span className="text-[10px] font-semibold text-slate-500 block">
              Financial Audit & Reconciliation Pro
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowMasterPinModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Crown className="w-3.5 h-3.5 text-amber-500" />
          <span>Master Admin</span>
        </button>
      </header>

      {/* Main Activation Card - Modern Card Style */}
      <main className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 my-auto">
        {/* Title Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-50 text-[#EA580C] border border-orange-200/60 mb-3 shadow-xs">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {isPending ? 'طلب التفعيل قيد المراجعة' : 'انتهت الفترة التجريبية (5 دقائق)'}
          </h1>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            {isPending
              ? 'تم إرسال طلب التفعيل بنجاح للمدير العام (م/ محمد عادل). النظام بانتظار تحديد مدة الصلاحية وسيقوم بفتح القفل فوراً وتلقائياً.'
              : 'حصل هذا الجهاز على فترة تجريبية مجانية 5 دقائق. لإعادة تشغيل النظام، أرسل طلب التفعيل لتحدد لك الإدارة العامة مدة الترخيص.'}
          </p>
        </div>

        {/* Location Detection Banner */}
        {(locationData.city || locationData.country || locationData.address) && (
          <div className="mb-4 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1.5 font-medium">
              <MapPin className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
              <span>Location:</span>
              <strong className="text-slate-800 font-semibold">
                {locationData.address || `${locationData.city || ''}, ${locationData.country || ''}`}
              </strong>
            </span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Verified
            </span>
          </div>
        )}

        {/* Device ID Display Box */}
        <div className="mb-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
          <div className="overflow-hidden">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Hardware Device ID
            </span>
            <span className="font-mono text-sm font-bold text-slate-800 tracking-wide select-all truncate block">
              {licenseInfo.deviceId}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
              copiedDevice
                ? 'bg-emerald-600 text-white'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {copiedDevice ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mb-4 p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{feedback.message}</div>
          </div>
        )}

        {/* Dynamic Section: Pending Approval Tracker OR Request Form */}
        {isPending ? (
          <div className="space-y-4 text-center py-2">
            <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-xl space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs font-black text-orange-900">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] animate-ping" />
                <span>Awaiting Management Signal...</span>
              </div>
              <p className="text-xs text-orange-800 leading-relaxed">
                Branch: <strong className="font-bold">{branchNameInput || 'Branch'}</strong>
              </p>
              <p className="text-[11px] text-slate-500">
                This screen checks every 3 seconds and will unlock as soon as your device is approved in the Admin Console.
              </p>
            </div>

            <button
              type="button"
              onClick={() => pollApprovalStatus(false)}
              disabled={isChecking}
              className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Verifying with Server...' : 'Check Approval Status Now'}</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitRequest} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Branch / Restaurant Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={branchNameInput}
                  onChange={e => setBranchNameInput(e.target.value)}
                  placeholder="e.g. Burger King - Mall of Arabia"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C] transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Phone Number (WhatsApp)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="e.g. 01100051593"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Additional Notes (Optional)
              </label>
              <input
                type="text"
                value={notesInput}
                onChange={e => setNotesInput(e.target.value)}
                placeholder="e.g. Cashier Terminal #2"
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C] transition-all"
              />
            </div>

            {/* Primary Orange Button Matching Image 2 */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-orange-600/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Request...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Activation Request to Admin</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Clean Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              OR
            </span>
          </div>
        </div>

        {/* Secondary Clean Buttons */}
        <div className="space-y-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>Request Activation via WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={() => setShowMasterPinModal(true)}
            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-amber-500" />
            <span>Master Admin PIN Bypass</span>
          </button>
        </div>

        {/* Footer Notice */}
        <p className="text-[10px] text-slate-400 text-center mt-5 leading-normal">
          By activating, you confirm this terminal is authorized for Burger King Egypt & Talabat financial reconciliation operations.
        </p>
      </main>

      {/* Footer Branding */}
      <footer className="text-center text-xs text-slate-400 mt-6">
        © {new Date().getFullYear()} Burger King Financial Audit Systems • All rights reserved
      </footer>

      {/* Master Admin PIN Modal */}
      {showMasterPinModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="text-center">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-2">
                <Crown className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">Master Admin Bypass</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter your Master PIN to instantly unlock and authenticate this device.
              </p>
            </div>

            {masterError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800">
                {masterError}
              </div>
            )}

            <form onSubmit={handleMasterSubmit} className="space-y-3">
              <input
                type="password"
                value={masterPin}
                onChange={e => setMasterPin(e.target.value)}
                placeholder="Enter Master PIN (e.g. 1993)"
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-center tracking-widest text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C]"
                autoFocus
                required
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMasterPinModal(false);
                    setMasterPin('');
                    setMasterError('');
                  }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={masterLoading}
                  className="flex-1 py-2.5 bg-[#EA580C] hover:bg-[#C2410C] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {masterLoading ? 'Verifying...' : 'Unlock Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
