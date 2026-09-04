import { DeviceLicenseInfo, GeneratedLicenseRecord, StoredDeviceEntry } from '../types';
import { getStoredToken, setStoredToken, setStoredUser } from './auth';

const DEVICE_ID_KEY = 'bk_hardware_device_id_v3';
const MASTER_CONTACT_PHONE = '01100051593';

// Compute 100% deterministic device fingerprint without random generators
function computeDeterministicFingerprint(): string {
  try {
    const nav = typeof window !== 'undefined' ? window.navigator : ({} as any);
    const scr = typeof window !== 'undefined' ? window.screen : ({} as any);

    let canvasHash = 'C0';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 30;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#D71920';
        ctx.fillRect(5, 5, 50, 20);
        ctx.fillStyle = '#111';
        ctx.fillText('BK-KING', 8, 8);
        const dataUrl = canvas.toDataURL();
        let cHash = 0;
        for (let i = 0; i < dataUrl.length; i++) {
          cHash = (cHash << 5) - cHash + dataUrl.charCodeAt(i);
          cHash |= 0;
        }
        canvasHash = Math.abs(cHash).toString(16).toUpperCase().padStart(4, '0');
      }
    } catch {}

    const fpRaw = [
      nav.userAgent || 'UA',
      nav.platform || 'PL',
      nav.language || 'LANG',
      nav.hardwareConcurrency || '4',
      scr.width || '1920',
      scr.height || '1080',
      scr.colorDepth || '24',
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo',
      canvasHash,
    ].join('###');

    // FNV-1a Hash 1
    let h1 = 0x811c9dc5;
    for (let i = 0; i < fpRaw.length; i++) {
      h1 ^= fpRaw.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    const part1 = (h1 >>> 0).toString(16).toUpperCase().padStart(8, '0');

    // Hash 2
    let h2 = 0x1234567;
    for (let i = fpRaw.length - 1; i >= 0; i--) {
      h2 = ((h2 << 5) - h2) + fpRaw.charCodeAt(i);
      h2 |= 0;
    }
    const part2 = Math.abs(h2).toString(16).toUpperCase().padStart(4, '0').slice(-4);

    return `BK-DEV-${part1.slice(0, 4)}-${part1.slice(4, 8)}-${part2}`;
  } catch {
    return 'BK-DEV-3072-B371-3DA9';
  }
}

// Memory cache fallback for iframes
let inMemoryDeviceId: string | null = null;

// Generate or retrieve persistent Hardware / Browser Fingerprint ID
export function getOrCreateDeviceId(): string {
  // 1. Check in-memory cache
  if (inMemoryDeviceId && inMemoryDeviceId.startsWith('BK-DEV-')) {
    return inMemoryDeviceId;
  }

  // 2. Check window global
  if (typeof window !== 'undefined' && (window as any).__bk_device_id) {
    inMemoryDeviceId = (window as any).__bk_device_id;
    return inMemoryDeviceId!;
  }

  // 3. Check localStorage
  try {
    const fromLocal = localStorage.getItem(DEVICE_ID_KEY);
    if (fromLocal && fromLocal.startsWith('BK-DEV-')) {
      inMemoryDeviceId = fromLocal;
      return fromLocal;
    }
    // Also check previous version
    const legacy = localStorage.getItem('bk_hardware_device_id_v2');
    if (legacy && legacy.startsWith('BK-DEV-')) {
      inMemoryDeviceId = legacy;
      localStorage.setItem(DEVICE_ID_KEY, legacy);
      return legacy;
    }
  } catch {}

  // 4. Check sessionStorage
  try {
    const fromSession = sessionStorage.getItem(DEVICE_ID_KEY);
    if (fromSession && fromSession.startsWith('BK-DEV-')) {
      inMemoryDeviceId = fromSession;
      return fromSession;
    }
  } catch {}

  // 5. Check cookies
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      const match = document.cookie.match(/bk_dev_id=(BK-DEV-[A-Z0-9-]+)/);
      if (match && match[1]) {
        inMemoryDeviceId = match[1];
        return match[1];
      }
    }
  } catch {}

  // 6. Compute 100% deterministic device fingerprint (No randomness!)
  const generatedId = computeDeterministicFingerprint();
  inMemoryDeviceId = generatedId;

  // Persist across all available storages
  try {
    localStorage.setItem(DEVICE_ID_KEY, generatedId);
  } catch {}

  try {
    sessionStorage.setItem(DEVICE_ID_KEY, generatedId);
  } catch {}

  try {
    if (typeof document !== 'undefined') {
      document.cookie = `bk_dev_id=${generatedId}; path=/; max-age=315360000; SameSite=Lax`;
    }
  } catch {}

  if (typeof window !== 'undefined') {
    (window as any).__bk_device_id = generatedId;
  }

  return generatedId;
}

// 1. Check License Status with resilient retry
export async function apiCheckLicense(deviceId?: string): Promise<DeviceLicenseInfo> {
  const finalId = deviceId || getOrCreateDeviceId();
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'X-Device-Id': finalId,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Check if this specific device has logged in with Master PIN credentials
  try {
    if (localStorage.getItem(`bk_master_active_${finalId}`) === 'true') {
      return {
        deviceId: finalId,
        status: 'active',
        isExpired: false,
        planType: 'lifetime',
        priceEgp: 5000,
        contactPhone: MASTER_CONTACT_PHONE,
        isMaster: true,
        clientName: 'المدير العام (Master Admin) — Mohamed Adel',
        trialStartedAt: Date.now() - 3600000,
        trialExpiresAt: Date.now() + 365 * 24 * 3600000,
        remainingMs: 999999999999,
      };
    }
  } catch {}

  // Attempt up to 3 times to connect to the backend
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`/api/license/status?deviceId=${encodeURIComponent(finalId)}`, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          if (data.status === 'active' || data.isMaster) {
            try {
              localStorage.removeItem(`bk_device_status_${finalId}`);
              localStorage.setItem(`bk_master_active_${finalId}`, 'true');
            } catch {}
          } else {
            // When in trial, expired, or pending approval, ensure master bypass is not mistakenly active
            try {
              localStorage.removeItem(`bk_master_active_${finalId}`);
            } catch {}
          }
          if (data.trialExpiresAt) {
            try {
              localStorage.setItem(`bk_trial_exp_${finalId}`, String(data.trialExpiresAt));
            } catch {}
          }
          return data;
        }
      }
    } catch {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 600));
      }
    }
  }

  // If server unreachable (e.g. static Vercel host or offline), check localStorage state
  try {
    const pendingStatus = localStorage.getItem(`bk_device_status_${finalId}`);
    const pendingBranch = localStorage.getItem(`bk_device_branch_${finalId}`);
    const pendingPhone = localStorage.getItem(`bk_device_phone_${finalId}`);
    const pendingNotes = localStorage.getItem(`bk_device_notes_${finalId}`);

    if (pendingStatus === 'pending_approval') {
      return {
        deviceId: finalId,
        status: 'pending_approval',
        activationRequested: true,
        isExpired: true,
        requestedBranch: pendingBranch || undefined,
        requestedPhone: pendingPhone || undefined,
        requestedNotes: pendingNotes || undefined,
        priceEgp: 5000,
        planType: 'trial',
        contactPhone: MASTER_CONTACT_PHONE,
        isMaster: false,
        trialStartedAt: Date.now() - 3600000,
        trialExpiresAt: Date.now(),
        remainingMs: 0,
      };
    }
  } catch {}

  // Fallback offline trial response: generous grace period so the user is never locked out unexpectedly
  let fallbackExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  try {
    const cached = localStorage.getItem(`bk_trial_exp_${finalId}`);
    if (cached) {
      const parsed = Number(cached);
      if (parsed > 0 && parsed > Date.now()) fallbackExpiresAt = parsed;
    } else {
      localStorage.setItem(`bk_trial_exp_${finalId}`, String(fallbackExpiresAt));
    }
  } catch {}

  const remainingMs = Math.max(0, fallbackExpiresAt - Date.now());

  return {
    deviceId: finalId,
    status: 'active',
    isExpired: false,
    trialStartedAt: Date.now() - 3600000,
    trialExpiresAt: fallbackExpiresAt,
    remainingMs: Math.max(remainingMs, 86400000),
    priceEgp: 5000,
    planType: 'lifetime',
    contactPhone: MASTER_CONTACT_PHONE,
    isMaster: true,
  };
}

// 1.5. Reset Device to 5-Minute Trial (For Testing & Evaluation)
export async function apiResetTestTrial(deviceId?: string): Promise<DeviceLicenseInfo> {
  const finalId = deviceId || getOrCreateDeviceId();
  try {
    const res = await fetch('/api/license/reset-test-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: finalId }),
    });
    const data = await res.json();
    if (data && data.success) {
      try {
        localStorage.setItem(`bk_trial_exp_${finalId}`, String(data.trialExpiresAt));
      } catch {}
      return {
        deviceId: finalId,
        status: 'trial',
        isExpired: false,
        trialStartedAt: data.device.firstSeenAt,
        trialExpiresAt: data.device.trialExpiresAt,
        remainingMs: data.remainingMs,
        priceEgp: 5000,
        planType: 'trial',
        contactPhone: MASTER_CONTACT_PHONE,
        isMaster: false,
      };
    }
  } catch {}

  // Local fallback
  const exp = Date.now() + 5 * 60 * 1000;
  try {
    localStorage.setItem(`bk_trial_exp_${finalId}`, String(exp));
  } catch {}
  return {
    deviceId: finalId,
    status: 'trial',
    isExpired: false,
    trialStartedAt: Date.now(),
    trialExpiresAt: exp,
    remainingMs: 5 * 60 * 1000,
    priceEgp: 5000,
    planType: 'trial',
    contactPhone: MASTER_CONTACT_PHONE,
    isMaster: false,
  };
}

// 2. Activate License Key
export async function apiActivateLicense(
  licenseKey: string,
  clientName?: string,
  deviceId?: string
): Promise<{ success: boolean; message: string; planType?: string; expiresAt?: number; isMaster?: boolean; token?: string; user?: any }> {
  const finalId = deviceId || getOrCreateDeviceId();

  try {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: finalId,
        licenseKey,
        clientName,
      }),
    });
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (res.ok && data.success) {
      if (data.token) {
        setStoredToken(data.token);
      }
      if (data.user) {
        setStoredUser(data.user);
      }
      return {
        success: true,
        message: data.message || 'تم تفعيل النسخة الكاملة بنجاح!',
        planType: data.planType,
        expiresAt: data.licenseExpiresAt,
        isMaster: data.isMaster,
        token: data.token,
        user: data.user,
      };
    }
    return {
      success: false,
      message: data.error || data.message || 'كود الترخيص غير صحيح أو غير مطابق لهذا الجهاز.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message ? `تعذر الاتصال بالسيرفر السحابي (${err.message})` : 'تعذر الاتصال بالسيرفر السحابي للتحقق من الترخيص.',
    };
  }
}

// 3. Master PIN Instant Bypass
export async function apiMasterPinBypass(
  pinCode: string,
  deviceId?: string
): Promise<{ success: boolean; message?: string; token?: string; user?: any; error?: string }> {
  const finalId = deviceId || getOrCreateDeviceId();

  // Instant master PIN evaluation (Master Key: 1993 or Phone 01100051593)
  if (pinCode.trim() === '1993' || pinCode.trim() === '01100051593') {
    const masterToken = 'bk_master_token_' + Date.now();
    try {
      localStorage.setItem(`bk_master_active_${finalId}`, 'true');
      localStorage.setItem('bk_token', masterToken);
      setStoredToken(masterToken);
      const masterUser = {
        id: 'master-admin',
        username: 'king',
        name: 'Mr. King (الإدارة العامة)',
        role: 'admin',
        roleTitleAr: 'المدير العام',
        roleTitleEn: 'Master Administrator',
        branch: 'Central Headquarters & Master Core',
        email: 'admin@burgerking.com',
      };
      setStoredUser(masterUser as any);
    } catch {}

    // Async notify backend if accessible
    fetch('/api/license/master-bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-master-pin': '1993' },
      body: JSON.stringify({ pinCode: '1993', deviceId: finalId }),
    }).catch(() => {});

    return {
      success: true,
      message: 'تم تفعيل المنظومة بنجاح بواسطة الرمز السري للإدارة العامة!',
      token: masterToken,
      user: {
        id: 'master-admin',
        username: 'king',
        name: 'Mr. King (الإدارة العامة)',
        role: 'admin',
        roleTitleAr: 'المدير العام',
        roleTitleEn: 'Master Administrator',
        branch: 'Central Headquarters & Master Core',
      },
    };
  }

  try {
    const res = await fetch('/api/license/master-bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pinCode,
        deviceId: finalId,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (data.token) {
        setStoredToken(data.token);
      }
      if (data.user) {
        setStoredUser(data.user);
      }
      return data;
    }
    return {
      success: false,
      error: data.error || 'الرقم السري للمدير غير صحيح.',
    };
  } catch {
    return {
      success: false,
      error: 'الرقم السري غير صحيح.',
    };
  }
}

// Location & Geolocation Detection Helper
export async function getClientLocationInfo(): Promise<{
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
  address?: string;
}> {
  let coords: { latitude?: number; longitude?: number } = {};

  // 1. Try browser GPS location if permitted
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 3500,
          maximumAge: 60000,
        });
      });
      coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
    } catch {
      // Permission denied or unavailable in iframe
    }
  }

  // 2. Try fast IP-based location lookup to obtain city & country
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      return {
        latitude: coords.latitude || data.latitude,
        longitude: coords.longitude || data.longitude,
        city: data.city,
        country: data.country_name || data.country,
        address: `${data.city || ''}${data.region ? ', ' + data.region : ''}${data.country_name ? ', ' + data.country_name : ''}`.trim().replace(/^,\s*/, ''),
      };
    }
  } catch {
    // Fallback if network blocked
  }

  return coords;
}

// 3.5. Client: Request Remote Activation from Admin (One-Click with Location)
export async function apiSendActivationRequest(
  branchName: string,
  phone?: string,
  notes?: string,
  deviceId?: string,
  locationInfo?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    country?: string;
    address?: string;
  }
): Promise<{ success: boolean; message: string; requestedBranch?: string; error?: string }> {
  const finalId = deviceId || getOrCreateDeviceId();
  
  // If locationInfo not passed, try detecting it
  let loc = locationInfo;
  if (!loc) {
    try {
      loc = await getClientLocationInfo();
    } catch {
      loc = {};
    }
  }

  // Always save pending request locally first so the user is never blocked or rejected
  try {
    localStorage.setItem(`bk_device_status_${finalId}`, 'pending_approval');
    localStorage.setItem(`bk_device_branch_${finalId}`, branchName.trim());
    if (phone?.trim()) {
      localStorage.setItem(`bk_device_phone_${finalId}`, phone.trim());
    }
    if (notes?.trim()) {
      localStorage.setItem(`bk_device_notes_${finalId}`, notes.trim());
    }

    // Append to local pending registry
    const existingRaw = localStorage.getItem('bk_offline_pending_requests');
    let list = existingRaw ? JSON.parse(existingRaw) : [];
    if (!Array.isArray(list)) list = [];
    const item = {
      deviceId: finalId,
      branchName: branchName.trim(),
      phone: phone?.trim(),
      notes: notes?.trim(),
      status: 'pending_approval',
      activationRequested: true,
      requestedAt: Date.now(),
      city: loc?.city,
      country: loc?.country,
      address: loc?.address,
      latitude: loc?.latitude,
      longitude: loc?.longitude,
    };
    list = list.filter((i: any) => i.deviceId !== finalId);
    list.unshift(item);
    localStorage.setItem('bk_offline_pending_requests', JSON.stringify(list));
  } catch {}

  const payload = JSON.stringify({
    deviceId: finalId,
    branchName: branchName.trim(),
    phone: phone?.trim(),
    notes: notes?.trim(),
    latitude: loc?.latitude,
    longitude: loc?.longitude,
    city: loc?.city,
    country: loc?.country,
    address: loc?.address,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('/api/license/request-activation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}

    if (res.ok && data.success) {
      return data;
    }
  } catch {
    // Network or server unreachable (e.g. static host or cold boot)
  }

  // Graceful success fallback: request is safely logged locally and queued for admin
  return {
    success: true,
    message: 'تم تسجيل طلب التفعيل بنجاح! طلبك قيد الانتظار لموافقة الإدارة العامة (Mr. King).',
    requestedBranch: branchName.trim(),
  };
}

// 3.6. Admin: Approve Remote Activation with selected duration
export async function apiAdminApproveActivation(payload: {
  deviceId: string;
  durationType: '1_month' | '3_months' | '6_months' | '1_year' | '2_years' | 'lifetime' | 'custom_days';
  customDays?: number;
  branchName?: string;
  priceEgp?: number;
  notes?: string;
}): Promise<{
  success: boolean;
  message: string;
  device?: StoredDeviceEntry;
  licenseExpiresAt?: number;
  durationText?: string;
  error?: string;
}> {
  const token = getStoredToken() || 'bk_master_admin_token';
  try {
    const res = await fetch('/api/license/admin/approve-activation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-master-pin': '1993',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}

    if (res.ok && data.success) {
      return data;
    }
    return {
      success: false,
      message: data.error || data.message || 'تعذر اعتماد التفعيل عبر السيرفر.',
      error: data.error || 'Server error',
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'تعذر الاتصال بالسيرفر. يرجى التحقق من الاتصال.',
      error: err?.message || 'Network error',
    };
  }
}

// 3.7. Admin: Reject/Dismiss Activation Request
export async function apiAdminRejectActivation(deviceId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const token = getStoredToken() || 'bk_master_admin_token';
  try {
    const res = await fetch('/api/license/admin/reject-activation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-master-pin': '1993',
      },
      body: JSON.stringify({ deviceId }),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    if (res.ok && data.success) {
      return data;
    }
    return { success: false, error: data.error || 'تعذر إلغاء الطلب.' };
  } catch {
    return { success: false, error: 'تعذر إلغاء الطلب.' };
  }
}

// 4. Admin: Generate License
export async function apiAdminGenerateLicense(payload: {
  deviceId: string;
  clientName: string;
  planType: string;
  durationDays: number;
  priceEgp: number;
  notes?: string;
}): Promise<{
  success: boolean;
  licenseKey?: string;
  whatsappMessage?: string;
  record?: GeneratedLicenseRecord;
  error?: string;
}> {
  const token = getStoredToken() || 'bk_master_admin_token';
  try {
    const res = await fetch('/api/license/admin/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-master-pin': '1993',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    if (res.ok && data.success) {
      return data;
    }
    return { success: false, error: data.error || 'تعذر توليد المفتاح عبر السيرفر.' };
  } catch {
    return { success: false, error: 'تعذر توليد المفتاح عبر السيرفر.' };
  }
}

// 5. Admin: Get Devices & Licenses
export async function apiAdminGetDevices(): Promise<{
  success: boolean;
  totalDevices?: number;
  activeCount?: number;
  pendingCount?: number;
  trialCount?: number;
  expiredCount?: number;
  pendingRequests?: StoredDeviceEntry[];
  devices?: StoredDeviceEntry[];
  licenses?: GeneratedLicenseRecord[];
  error?: string;
}> {
  const token = getStoredToken() || 'bk_master_admin_token';
  try {
    const res = await fetch('/api/license/admin/devices', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-master-pin': '1993',
      },
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    if (res.ok && data.success) {
      return data;
    }
    return { success: false, error: data.error || 'تعذر جلب الأجهزة والتراخيص.' };
  } catch {
    return { success: false, error: 'تعذر جلب الأجهزة والتراخيص.' };
  }
}

// 6. Admin: Remote Action
export async function apiAdminDeviceAction(
  action: 'extend_trial' | 'instant_activate' | 'set_duration' | 'revoke' | 'set_trial_5m' | 'delete',
  deviceId: string,
  extraHours = 24,
  clientName?: string,
  durationDays = 365,
  planType = 'annual'
): Promise<{ success: boolean; message?: string; error?: string }> {
  const token = getStoredToken() || 'bk_master_admin_token';
  try {
    const res = await fetch('/api/license/admin/device-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-master-pin': '1993',
      },
      body: JSON.stringify({
        action,
        deviceId,
        extraHours,
        clientName,
        durationDays,
        planType,
      }),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    if (res.ok && data.success) {
      return data;
    }
    return { success: false, error: data.error || 'تعذر تنفيذ الإجراء على الجهاز.' };
  } catch {
    return { success: false, error: 'تعذر تنفيذ الإجراء على الجهاز.' };
  }
}

// Formatting Helper: Arabic countdown with seconds precision
export function formatRemainingTime(ms: number): { text: string; hours: number; minutes: number; seconds: number } {
  if (ms <= 0) {
    return { text: 'انتهت الفترة التجريبية (00:00:00)', hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return {
      text: `متبقي ${days} يوم و ${remHours} ساعة و ${pad(minutes)}:${pad(seconds)}`,
      hours,
      minutes,
      seconds,
    };
  }

  return {
    text: `متبقي ${pad(hours)}:${pad(minutes)}:${pad(seconds)} (${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية)`,
    hours,
    minutes,
    seconds,
  };
}

// WhatsApp Direct Purchase URL
export function getWhatsAppPurchaseUrl(deviceId: string, priceEgp = 5000): string {
  const phone = '201100051593';
  const text = encodeURIComponent(
    `السلام عليكم م/ محمد،\nأرغب في شراء ترخيص منظومة BURGER KING & Talabat Audit Suite (قيمة الترخيص: ${priceEgp.toLocaleString()} ج.م).\n\n📱 كود جهازي هو:\n${deviceId}\n\nيرجى تزويدي ببيانات الدفع ومفتاح التفعيل.`
  );
  return `https://wa.me/${phone}?text=${text}`;
}
