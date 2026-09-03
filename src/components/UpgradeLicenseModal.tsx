import React, { useState } from 'react';
import { DeviceLicenseInfo } from '../types';
import { apiActivateLicense, getWhatsAppPurchaseUrl } from '../utils/license';
import {
  Crown,
  Copy,
  Check,
  MessageSquare,
  KeyRound,
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface UpgradeLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  licenseInfo: DeviceLicenseInfo;
  onActivated: (updated: DeviceLicenseInfo) => void;
}

export const UpgradeLicenseModal: React.FC<UpgradeLicenseModalProps> = ({
  isOpen,
  onClose,
  licenseInfo,
  onActivated,
}) => {
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [clientNameInput, setClientNameInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedDevice, setCopiedDevice] = useState(false);

  if (!isOpen) return null;

  const handleCopyDeviceId = () => {
    navigator.clipboard.writeText(licenseInfo.deviceId);
    setCopiedDevice(true);
    setTimeout(() => setCopiedDevice(false), 2000);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) {
      setErrorMsg('Please enter a valid license key.');
      return;
    }

    setIsActivating(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiActivateLicense(
        licenseKeyInput.trim(),
        clientNameInput.trim() || undefined,
        licenseInfo.deviceId
      );

      if (res.success) {
        setSuccessMsg(res.message);
        setTimeout(() => {
          onActivated({
            ...licenseInfo,
            status: 'active',
            isExpired: false,
            licenseKey: licenseKeyInput.trim(),
            planType: (res.planType as any) || 'annual',
          });
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res.message);
      }
    } catch {
      setErrorMsg('Unable to connect to license server.');
    } finally {
      setIsActivating(false);
    }
  };

  const whatsappUrl = getWhatsAppPurchaseUrl(licenseInfo.deviceId, licenseInfo.priceEgp || 5000);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-orange-100 text-[#EA580C] flex items-center justify-center shadow-xs">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Upgrade & Activate License</h2>
            <p className="text-xs text-slate-500">
              Get full enterprise access for BURGER KING & Talabat Audit Pro
            </p>
          </div>
        </div>

        {/* Device ID Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5 flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Unique Hardware ID:
            </span>
            <span className="font-mono text-sm font-bold text-slate-800">
              {licenseInfo.deviceId}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyDeviceId}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            {copiedDevice ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* WhatsApp & Instant Order Box */}
        <div className="bg-orange-50/60 border border-orange-200 rounded-xl p-4 mb-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-bold text-orange-950">Annual License Package:</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-900">5,000</span>
              <span className="text-xs font-bold text-orange-700">EGP</span>
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            Direct transfer available via InstaPay / Vodafone Cash: <span className="font-mono font-bold text-slate-900">01100051593</span>
          </p>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Request Activation Key via WhatsApp</span>
          </a>
        </div>

        {/* Enter Code form */}
        <form onSubmit={handleActivate} className="space-y-3">
          <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Enter Received License Key:</span>
          </label>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <input
            type="text"
            value={licenseKeyInput}
            onChange={e => setLicenseKeyInput(e.target.value)}
            placeholder="BK-LIC-XXXX-XXXX-XXXX-XXXX"
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C]"
            required
          />

          <button
            type="submit"
            disabled={isActivating}
            className="w-full py-3 bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs"
          >
            {isActivating ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Activate License Key</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
