import React, { useState } from 'react';
import { FileDown, RotateCcw, CalendarDays, User, LogOut, ShieldCheck, BadgeCheck, Crown, Sparkles, Download, Check, Clock } from 'lucide-react';
import { BurgerKingLogo, TalabatLogo } from './BrandLogos';
import { generateReconciliationPDFBlob } from '../utils/pdfExport';
import { ComparisonRow, ReconciliationSummary, ExcelPaymentSummary, UserAccount, DeviceLicenseInfo } from '../types';
import { ExportModal } from './ExportModal';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
  onReset: () => void;
  hasData: boolean;
  rows?: ComparisonRow[];
  summary?: ReconciliationSummary | null;
  excelFileName?: string;
  excelPayments?: ExcelPaymentSummary;
  onOpenDailyReport?: () => void;
  currentUser?: UserAccount | null;
  onOpenProfile?: () => void;
  onLogout?: () => void;
  onOpenLoginModal?: () => void;
  licenseInfo?: DeviceLicenseInfo | null;
}

export const Header: React.FC<HeaderProps> = ({
  onReset,
  hasData,
  rows = [],
  summary = null,
  excelFileName,
  excelPayments,
  onOpenDailyReport,
  currentUser,
  onOpenProfile,
  onLogout,
  onOpenLoginModal,
  licenseInfo,
}) => {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const defaultPdfName = `BK_Talabat_Reconciliation_Audit_${new Date().toISOString().slice(0, 10)}`;
  const hasDeficits = summary && summary.grossDeficitTotal > 0;

  return (
    <>
      <header className="bg-white border-b border-orange-100/80 shadow-xs mb-6 sticky top-0 z-30">
        <div className="w-full max-w-[98%] 2xl:max-w-[1920px] mx-auto px-3 sm:px-5 lg:px-6 py-3 flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Brand identity */}
          <div className="flex items-center gap-3.5 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center gap-3">
              <div className="flex items-center -space-x-2.5">
                <BurgerKingLogo size="lg" className="ring-2 ring-white shadow-md z-10" />
                <TalabatLogo size="lg" className="ring-2 ring-white shadow-md z-0" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-[#502314] tracking-tight">
                    BURGER KING
                  </h1>
                  <span className="text-stone-300 font-light text-lg">×</span>
                  <span className="text-base sm:text-lg font-black text-[#FF5A00] tracking-tight">
                    talabat
                  </span>
                  <span className="hidden sm:inline-block bg-orange-50 text-[#D71920] text-xs font-bold px-2 py-0.5 rounded-full border border-orange-200/60 ml-1">
                    Aloha POS Audit
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-stone-500 font-medium flex items-center gap-2 flex-wrap">
                  <span>Financial Audit & POS Reconciliation System</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Cloud Synced
                  </span>
                  {licenseInfo && licenseInfo.status === 'active' && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300 font-bold" title={licenseInfo.deviceId}>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>{licenseInfo.planType === 'lifetime' || !licenseInfo.licenseExpiresAt ? 'Authorized (Lifetime)' : `Authorized: ${licenseInfo.daysRemaining || 365} Days`}</span>
                    </span>
                  )}
                  {licenseInfo && licenseInfo.status === 'trial' && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-300 font-bold shadow-2xs">
                      <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                      <span>
                        Trial: {(() => {
                          const ms = licenseInfo.remainingMs ?? 0;
                          if (ms <= 0) return '00:00';
                          const totalSecs = Math.floor(ms / 1000);
                          const mins = Math.floor(totalSecs / 60);
                          const secs = totalSecs % 60;
                          const pad = (n: number) => n.toString().padStart(2, '0');
                          if (mins >= 60) {
                            return `${Math.floor(mins / 60)}h ${mins % 60}m`;
                          }
                          return `${pad(mins)}:${pad(secs)}`;
                        })()} left
                      </span>
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Logged in User Pill or Admin Login Button */}
            <div className="lg:hidden flex items-center gap-2">
              <NotificationBell onOpenManageLicenses={onOpenProfile} />
              {currentUser ? (
                <div className="flex items-center gap-1.5">
                  {onOpenProfile && (
                    <button 
                      type="button"
                      onClick={onOpenProfile}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-900 border border-amber-500/40 rounded-xl shadow-xs text-xs font-bold text-amber-100 cursor-pointer"
                    >
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>{currentUser.name}</span>
                    </button>
                  )}
                  {onLogout && (
                    <button
                      type="button"
                      onClick={onLogout}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs text-xs font-bold cursor-pointer"
                      title="تسجيل الخروج"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>خروج</span>
                    </button>
                  )}
                </div>
              ) : onOpenLoginModal ? (
                <button 
                  type="button"
                  onClick={onOpenLoginModal}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-xl shadow-xs text-xs font-bold text-amber-900 cursor-pointer"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-600" />
                  <span>دخول الإدارة</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Action Controls & User status */}
          <div className="flex items-center gap-2 w-full lg:w-auto justify-end flex-wrap">
            {/* Real-time Notifications Bell for pending activations */}
            <div className="hidden sm:flex items-center mr-1">
              <NotificationBell onOpenManageLicenses={onOpenProfile} />
            </div>

            {/* Logged in User Pill or Admin Login Button */}
            {currentUser ? (
              <div className="hidden sm:flex items-center gap-2 pr-2 border-l border-stone-200 mr-1">
                <button
                  type="button"
                  onClick={onOpenProfile}
                  className="flex items-center gap-2.5 px-3 py-1.5 bg-gradient-to-r from-stone-900 via-stone-950 to-[#2b1008] border border-amber-500/30 rounded-2xl select-none text-left shadow-xs hover:border-amber-400 transition-all cursor-pointer"
                  title="Click to manage Master Password & Multi-Device Security"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-[#D71920] text-white flex items-center justify-center shadow-inner relative">
                    <Crown className="w-4 h-4 text-amber-100" />
                  </div>
                  <div className="flex flex-col">
                    <div className="text-xs font-black text-white flex items-center gap-1">
                      <span>{currentUser.name}</span>
                      <BadgeCheck className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
                      MASTER ADMINISTRATOR
                    </div>
                  </div>
                </button>

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl transition-all cursor-pointer shadow-xs"
                    title="Sign out of Admin Session"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            ) : onOpenLoginModal ? (
              <div className="hidden sm:flex items-center gap-2 pr-2 border-l border-stone-200 mr-1">
                <button
                  type="button"
                  onClick={onOpenLoginModal}
                  className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-stone-900 to-stone-950 hover:from-black hover:to-stone-900 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span>Master Admin Login</span>
                </button>
              </div>
            ) : null}

            {/* Daily Discrepancy Breakdown Shortcut */}
            {hasData && onOpenDailyReport && (
              <button
                type="button"
                onClick={onOpenDailyReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition-all cursor-pointer shadow-xs"
                title="Open Day-by-Day Discrepancy Breakdown Report"
              >
                <CalendarDays className="w-4 h-4 text-amber-600" />
                <span>Daily Deficit Report</span>
                {hasDeficits && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    !
                  </span>
                )}
              </button>
            )}

            {hasData && (
              <>
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-98 border border-rose-700 rounded-xl transition-all cursor-pointer shadow-sm shadow-rose-500/20"
                  title="Export entire page as PDF report with Save As"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Export PDF</span>
                </button>

                <button
                  onClick={onReset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-stone-600 hover:text-red-700 bg-stone-100 hover:bg-red-50 border border-stone-200 rounded-xl transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Export Modal with Save As selection */}
      {summary && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          title="Export Audit Report (PDF)"
          defaultFileName={defaultPdfName}
          fileExtension="pdf"
          fileBlobGenerator={() =>
            generateReconciliationPDFBlob({
              rows,
              summary,
              excelFileName,
              excelPaymentSummary: excelPayments,
            })
          }
        />
      )}
    </>
  );
};






