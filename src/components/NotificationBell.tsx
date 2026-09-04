import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle2, ShieldCheck, Clock, Phone, MapPin, Sparkles, ExternalLink, X, RefreshCw } from 'lucide-react';
import { apiAdminApproveActivation } from '../utils/license';

export interface AdminNotificationItem {
  id: string;
  type: 'activation_request' | 'device_approved' | 'license_expired' | 'security_alert';
  title: string;
  message: string;
  deviceId: string;
  branchName: string;
  phone?: string;
  notes?: string;
  timestamp: number;
  read: boolean;
  status: 'pending' | 'approved' | 'dismissed';
}

interface NotificationBellProps {
  onOpenManageLicenses?: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onOpenManageLicenses }) => {
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async (silent = true) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch('/api/admin/notifications', {
        headers: { 'x-master-pin': '1993' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      }
    } catch {
      // transient network hiccup
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications(true);
    const interval = setInterval(() => fetchNotifications(true), 4000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleQuickApprove = async (deviceId: string, branchName: string, duration: '1_month' | '1_year' | 'lifetime') => {
    setActionInProgress(deviceId);
    try {
      const res = await apiAdminApproveActivation({
        deviceId,
        durationType: duration,
        branchName,
      });
      if (res.success) {
        setToastMessage(`✅ تمت الموافقة وتفعيل فرع (${branchName}) بنجاح!`);
        setTimeout(() => setToastMessage(null), 4000);
        await fetchNotifications(true);
      } else {
        alert(res.error || 'تعذر اعتماد التفعيل.');
      }
    } catch (err: any) {
      alert(err?.message || 'خطأ أثناء تفعيل الجهاز.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/admin/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-pin': '1993' },
        body: JSON.stringify({}),
      });
      setUnreadCount(0);
      fetchNotifications(true);
    } catch {}
  };

  const pendingRequests = notifications.filter(n => n.status === 'pending');

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) {
            handleMarkAllRead();
          }
        }}
        className={`relative p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
          unreadCount > 0
            ? 'bg-amber-500/15 text-[#EA580C] border-[#EA580C]/40 hover:bg-amber-500/25 shadow-xs animate-bounce'
            : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'
        }`}
        title="إشعارات طلبات تفعيل الفروع والأجهزة"
      >
        <Bell className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${unreadCount > 0 ? 'text-[#EA580C] animate-pulse' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow-xs">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div 
          className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-[340px] sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-stone-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          dir="rtl"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-stone-900 via-stone-950 to-[#2b1008] px-4 py-3 text-white flex items-center justify-between border-b border-amber-500/30">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <Bell className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h4 className="text-xs font-black text-white">إشعارات طلبات التفعيل</h4>
                <p className="text-[10px] text-amber-300/80">فروع تطلب اعتماد المنظومة الفوري</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fetchNotifications(false)}
                disabled={isLoading}
                className="p-1 text-amber-200/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="تحديث الإشعارات"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-amber-200/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Toast Notification Alert */}
          {toastMessage && (
            <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 text-center animate-in fade-in">
              {toastMessage}
            </div>
          )}

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-stone-100 p-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-stone-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-stone-800">لا توجد إشعارات جديدة حالياً</p>
                <p className="text-[11px] text-stone-400">جميع طلبات الفروع معتمدة أو لا توجد أجهزة بانتظار الموافقة</p>
              </div>
            ) : (
              notifications.map(item => {
                const isPending = item.status === 'pending';
                const timeAgo = Math.round((Date.now() - item.timestamp) / 60000);
                const timeText = timeAgo <= 1 ? 'الآن' : `منذ ${timeAgo} دقيقة`;

                return (
                  <div
                    key={item.id}
                    className={`p-3 transition-colors ${
                      isPending ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'bg-white hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isPending ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`} />
                        <span className="font-black text-xs text-stone-900">{item.branchName || 'فرع جديد'}</span>
                      </div>
                      <span className="text-[10px] text-stone-400 font-medium flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {timeText}
                      </span>
                    </div>

                    <div className="mt-1.5 space-y-1 text-[11px] text-stone-600">
                      <div className="flex items-center gap-2">
                        <span className="text-stone-400">كود الجهاز:</span>
                        <code className="bg-stone-100 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold text-stone-700">
                          {item.deviceId}
                        </code>
                      </div>

                      {item.phone && (
                        <div className="flex items-center gap-1.5 text-stone-700">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span className="font-mono font-bold text-[11px]">{item.phone}</span>
                          <a
                            href={`https://wa.me/2${item.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-emerald-600 hover:underline font-bold mr-2"
                          >
                            مراسلة واتساب
                          </a>
                        </div>
                      )}

                      {item.notes && (
                        <div className="text-[11px] text-stone-500 bg-stone-100/70 p-1.5 rounded-lg border border-stone-200/50">
                          📝 {item.notes}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons for Pending Items */}
                    {isPending && (
                      <div className="mt-2.5 pt-2 border-t border-amber-200/60 space-y-1.5">
                        <div className="text-[10px] font-bold text-stone-600">حدد مدة التفعيل الممنوحة لهذا الجهاز:</div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
                          <button
                            type="button"
                            disabled={actionInProgress === item.deviceId}
                            onClick={() => handleQuickApprove(item.deviceId, item.branchName, '1_month')}
                            className="py-1.5 px-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black transition-all cursor-pointer shadow-xs disabled:opacity-50 text-center"
                          >
                            شهر (30 يوم)
                          </button>
                          <button
                            type="button"
                            disabled={actionInProgress === item.deviceId}
                            onClick={() => handleQuickApprove(item.deviceId, item.branchName, '3_months' as any)}
                            className="py-1.5 px-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-[10px] font-black transition-all cursor-pointer shadow-xs disabled:opacity-50 text-center"
                          >
                            3 أشهر
                          </button>
                          <button
                            type="button"
                            disabled={actionInProgress === item.deviceId}
                            onClick={() => handleQuickApprove(item.deviceId, item.branchName, '6_months' as any)}
                            className="py-1.5 px-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-[10px] font-black transition-all cursor-pointer shadow-xs disabled:opacity-50 text-center"
                          >
                            6 أشهر
                          </button>
                          <button
                            type="button"
                            disabled={actionInProgress === item.deviceId}
                            onClick={() => handleQuickApprove(item.deviceId, item.branchName, '1_year')}
                            className="py-1.5 px-1.5 bg-[#EA580C] hover:bg-[#C2410C] text-white rounded-lg text-[10px] font-black transition-all cursor-pointer shadow-xs disabled:opacity-50 text-center"
                          >
                            ⭐ سنة كاملة
                          </button>
                          <button
                            type="button"
                            disabled={actionInProgress === item.deviceId}
                            onClick={() => handleQuickApprove(item.deviceId, item.branchName, 'lifetime')}
                            className="py-1.5 px-1.5 bg-stone-900 hover:bg-black text-amber-300 rounded-lg text-[10px] font-black transition-all cursor-pointer shadow-xs disabled:opacity-50 text-center"
                          >
                            👑 دائم
                          </button>
                        </div>
                      </div>
                    )}

                    {!isPending && (
                      <div className="mt-2 text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>تم تفعيل واعتماد الجهاز بنجاح</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer with link to complete licenses modal */}
          {onOpenManageLicenses && (
            <div className="bg-stone-50 p-2.5 border-t border-stone-200 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenManageLicenses();
                }}
                className="w-full py-1.5 text-xs font-black text-[#EA580C] hover:text-[#C2410C] hover:bg-amber-100/50 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>فتح لوحة التحكم والتراخيص الشاملة</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
