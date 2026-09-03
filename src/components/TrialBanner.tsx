import React, { useState, useEffect } from 'react';
import { DeviceLicenseInfo } from '../types';
import { formatRemainingTime, getWhatsAppPurchaseUrl } from '../utils/license';
import { Clock, Sparkles, Copy, Check, MessageSquare, ChevronRight } from 'lucide-react';

interface TrialBannerProps {
  licenseInfo: DeviceLicenseInfo;
  onOpenUpgradeModal: () => void;
}

export const TrialBanner: React.FC<TrialBannerProps> = ({
  licenseInfo,
  onOpenUpgradeModal,
}) => {
  const calcRemaining = () => {
    if (licenseInfo.trialExpiresAt && licenseInfo.trialExpiresAt > 0) {
      return Math.max(0, licenseInfo.trialExpiresAt - Date.now());
    }
    return Math.max(0, licenseInfo.remainingMs);
  };

  const [remainingMs, setRemainingMs] = useState(calcRemaining);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRemainingMs(calcRemaining());
    const interval = setInterval(() => {
      setRemainingMs(calcRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, [licenseInfo.trialExpiresAt, licenseInfo.remainingMs]);

  if (licenseInfo.status === 'active' && !licenseInfo.remainingMs) {
    return null;
  }

  if (licenseInfo.isMaster) {
    return null;
  }

  const countdown = formatRemainingTime(remainingMs);
  const isUrgent = remainingMs < 3 * 3600 * 1000;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(licenseInfo.deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappUrl = getWhatsAppPurchaseUrl(licenseInfo.deviceId, licenseInfo.priceEgp || 5000);

  return (
    <div
      className={`w-full border-b transition-all px-3 py-2 select-none z-40 ${
        isUrgent
          ? 'bg-rose-950 text-rose-100 border-rose-800 shadow-xs'
          : 'bg-slate-900 text-slate-100 border-slate-800 shadow-xs'
      }`}
    >
      <div className="w-full max-w-[98%] 2xl:max-w-[1920px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
        {/* Left: Status & Countdown */}
        <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-start">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isUrgent
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                : 'bg-orange-500/20 text-orange-300 border-orange-500/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Evaluation Trial Mode</span>
          </span>

          <span className="text-xs font-semibold text-slate-200">
            {countdown.text}
          </span>

          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
            <span>Device ID:</span>
            <span className="font-mono text-orange-400 font-bold">{licenseInfo.deviceId}</span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Copy Device ID"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Right: Upgrade Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Contact via WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={onOpenUpgradeModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-[#EA580C] hover:bg-[#C2410C] text-white rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Upgrade Full License</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
