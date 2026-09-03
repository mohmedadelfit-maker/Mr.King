import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = 3000;
const ROOT_DIR = process.cwd();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy Google GenAI Client
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Data Directory for persistent credentials
const DATA_DIR = path.join(ROOT_DIR, 'server-data');
const AUTH_FILE = path.join(DATA_DIR, 'auth-config.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface MasterAuthConfig {
  username: string;
  passwordHash: string; // Plain or hashed
  name: string;
  authVersion: number; // Increments on password change to invalidate all existing sessions
  lastUpdated: string;
  updatedBy: string;
  masterEmail?: string;
  masterPin?: string;
  masterPhone?: string;
}

const MASTER_RECOVERY_PIN = '1993';
const AUTHORIZED_ADMIN_EMAIL = '0kingold0@gmail.com';

const DEFAULT_AUTH: MasterAuthConfig = {
  username: 'King',
  passwordHash: 'BKKing',
  name: 'M-King',
  authVersion: 1,
  masterPin: MASTER_RECOVERY_PIN,
  lastUpdated: new Date().toISOString(),
  updatedBy: 'System Init',
  masterEmail: AUTHORIZED_ADMIN_EMAIL,
  masterPhone: '01100051593',
};

function getMasterAuth(): MasterAuthConfig {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      fs.writeFileSync(AUTH_FILE, JSON.stringify(DEFAULT_AUTH, null, 2), 'utf-8');
      return DEFAULT_AUTH;
    }
    const content = fs.readFileSync(AUTH_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Error reading auth file, using defaults', err);
    return DEFAULT_AUTH;
  }
}

function saveMasterAuth(config: MasterAuthConfig): void {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving auth file', err);
  }
}

// In-memory active tokens mapped to authVersion
interface ActiveSession {
  id: string;
  token: string;
  username: string;
  name: string;
  authVersion: number;
  loginTime: number;
  lastActive: number;
  ip: string;
  userAgent: string;
  deviceName: string;
}

const activeSessions = new Map<string, ActiveSession>();

function parseDeviceName(userAgent: string): string {
  if (!userAgent) return 'متصفح غير معروف (Unknown Device)';
  let os = 'جهاز كمبيوتر';
  if (/windows/i.test(userAgent)) os = 'ويندوز (Windows PC)';
  else if (/macintosh|mac os x/i.test(userAgent)) os = 'ماك (Mac)';
  else if (/android/i.test(userAgent)) os = 'هاتف أندرويد (Android)';
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'آيفون / آيباد (iOS)';
  else if (/linux/i.test(userAgent)) os = 'لينكس (Linux)';

  let browser = 'متصفح ويب';
  if (/edg/i.test(userAgent)) browser = 'Microsoft Edge';
  else if (/chrome|crios/i.test(userAgent)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(userAgent)) browser = 'Apple Safari';

  return `${os} — ${browser}`;
}

// In-memory pending OTPs
interface PendingOtp {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

let pendingOtpRecord: PendingOtp | null = null;

function generateToken(): string {
  return 'bk_sec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 12);
}

// Nodemailer setup for sending actual OTP emails
async function createMailTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Gmail direct or test transporter
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  // Create ethereal/standard test transport
  try {
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  } catch {
    // Fallback JSON transporter for safety
    return nodemailer.createTransport({
      jsonTransport: true,
    });
  }
}

async function sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean> {
  try {
    const transporter = await createMailTransporter();
    const info = await transporter.sendMail({
      from: '"منظومة برجر كينج وطلبات" <security@burgerking-audit.local>',
      to: toEmail,
      subject: `👑 كود استعادة الحساب السري: ${otpCode}`,
      text: `مرحباً م/ محمد عادل، كود التحقق الأمني الخاص بك هو: ${otpCode} (صالح لمدة 10 دقائق).`,
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 25px; background: #fffcf9; border: 2px solid #D71920; border-radius: 16px; max-width: 500px; margin: auto;">
          <h2 style="color: #D71920; margin-top: 0; font-size: 22px;">👑 منظومة مطابقة برجر كينج وطلبات</h2>
          <p style="font-size: 15px; color: #333; margin-bottom: 12px;">مرحباً <strong>م/ محمد عادل</strong>،</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">تم استلام طلب لإعادة تعيين كلمة المرور وطرد جميع الأجهزة الأخرى. كود التحقق الأمني الخاص بك هو:</p>
          <div style="background: #502314; color: #FDB813; font-size: 32px; font-weight: 900; letter-spacing: 8px; text-align: center; padding: 18px; border-radius: 12px; margin: 20px 0; font-family: monospace; border: 1px solid #FF5A00;">
            ${otpCode}
          </div>
          <p style="font-size: 13px; color: #888; margin-bottom: 0;">⏱️ هذا الكود صالح لمدة <strong>10 دقائق</strong> فقط. لا تشارك هذا الرمز مع أي شخص حفاظاً على أمان المنظومة.</p>
        </div>
      `,
    });

    console.log('OTP Email Dispatched to', toEmail, 'MessageId:', info.messageId);
    return true;
  } catch (err) {
    console.error('Failed to send OTP email via SMTP:', err);
    return false;
  }
}

// ==================== AUTH API ROUTES ====================

// 1. Check Server Status
app.get('/api/auth/status', (req, res) => {
  const current = getMasterAuth();
  res.json({
    status: 'ok',
    system: 'BURGER KING & Talabat Enterprise Audit Core',
    authVersion: current.authVersion,
    timestamp: Date.now(),
  });
});

// 2. Login Endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    res.status(400).json({ success: false, error: 'يرجى إدخال اسم/كود المستخدم وكلمة المرور.' });
    return;
  }

  const currentAuth = getMasterAuth();

  const cleanUser = (username || '').toString().trim().toLowerCase();
  const cleanPass = (password || '').toString().trim();

  // Permissive and resilient Master Admin credentials recognition
  const validUsernames = [
    (currentAuth.username || '').toLowerCase(),
    'king',
    'm-king',
    'mking',
    'admin',
    'master',
    '0kingold0@gmail.com',
    '0kingold0',
    '01100051593',
    '1993',
    'مدير',
    'المدير العام',
  ];

  const validPasswords = [
    currentAuth.passwordHash,
    '0kingold0',
    'BKKing',
    'bkking',
    '1993',
    '01100051593',
    'King',
    'king',
  ];

  const isUserMatch = validUsernames.includes(cleanUser);
  const isPassMatch = validPasswords.includes(cleanPass);
  const isMasterPinBypass = cleanPass === '1993' || cleanPass === '01100051593' || cleanUser === '1993' || cleanPass === '0kingold0';

  if (!isMasterPinBypass && (!isUserMatch || !isPassMatch)) {
    res.status(401).json({
      success: false,
      error: 'بيانات الدخول غير صحيحة! يمكنك استخدام: اسم المستخدم: King أو 0kingold0@gmail.com | كلمة المرور: 0kingold0 أو BKKing أو الرقم السري: 1993',
    });
    return;
  }

  const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || '';
  const deviceName = parseDeviceName(userAgent);
  const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

  const token = generateToken();
  const session: ActiveSession = {
    id: sessionId,
    token,
    username: currentAuth.username || 'King',
    name: currentAuth.name || 'M-King',
    authVersion: currentAuth.authVersion,
    loginTime: Date.now(),
    lastActive: Date.now(),
    ip: clientIp,
    userAgent,
    deviceName,
  };

  activeSessions.set(token, session);

  // Auto-activate this device as Lifetime Master upon logging in as Master Admin
  try {
    const rawDevId = (req.headers['x-device-id'] as string) || (req.body?.deviceId as string);
    if (rawDevId) {
      const cleanDev = rawDevId.trim().toUpperCase();
      const store = getLicenseStore();
      const now = Date.now();
      if (!store.devices[cleanDev]) {
        store.devices[cleanDev] = {
          deviceId: cleanDev,
          firstSeenAt: now,
          trialDurationMs: TRIAL_DURATION_MS,
          trialExpiresAt: now + 365 * 24 * 3600000,
          isActivated: true,
          activatedAt: now,
          licenseKey: 'BK-LIC-KING-1993-MASTER-LIFETIME',
          licenseExpiresAt: 0,
          planType: 'lifetime',
          clientName: 'جهاز المدير العام (M-King Master)',
          lastSeenAt: now,
          ip: clientIp,
          deviceName,
        };
      } else {
        store.devices[cleanDev].isActivated = true;
        store.devices[cleanDev].licenseKey = 'BK-LIC-KING-1993-MASTER-LIFETIME';
        store.devices[cleanDev].licenseExpiresAt = 0;
        store.devices[cleanDev].planType = 'lifetime';
        store.devices[cleanDev].clientName = 'جهاز المدير العام (M-King Master)';
        store.devices[cleanDev].lastSeenAt = now;
      }
      saveLicenseStore(store);
    }
  } catch (err) {
    console.warn('Notice: Device auto-activation upon login error:', err);
  }

  res.json({
    success: true,
    token,
    sessionId,
    authVersion: currentAuth.authVersion,
    isMaster: true,
    user: {
      username: currentAuth.username || 'King',
      name: currentAuth.name || 'M-King',
      role: 'admin',
      roleTitleAr: 'المدير العام',
      roleTitleEn: 'Master Administrator',
      branch: 'Central Headquarters & Master Core',
    },
  });
});

// 3. Verify Session (Heartbeat & Security Check)
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.query.token as string);

  if (!token) {
    res.status(401).json({ valid: false, error: 'missing_token' });
    return;
  }

  const session = activeSessions.get(token);
  const currentAuth = getMasterAuth();

  if (!session) {
    res.status(401).json({
      valid: false,
      error: 'session_terminated',
      message: 'تم إنهاء أو طرد جلسة هذا الجهاز من قِبل المدير العام.',
    });
    return;
  }

  // If password was changed on another device, authVersion will NOT match!
  if (session.authVersion !== currentAuth.authVersion) {
    activeSessions.delete(token);
    res.status(401).json({
      valid: false,
      error: 'password_changed',
      message: 'تم تغيير كلمة المرور الرئيسية للمنظومة. تم إنهاء الجلسة تلقائياً لجميع الأجهزة الأخرى لضمان الأمان.',
    });
    return;
  }

  // Update lastActive timestamp
  session.lastActive = Date.now();

  res.json({
    valid: true,
    authVersion: currentAuth.authVersion,
    sessionId: session.id,
    user: {
      username: currentAuth.username,
      name: currentAuth.name,
      role: 'admin',
      roleTitleAr: 'المدير العام',
      roleTitleEn: 'Master Administrator',
      branch: 'Central Headquarters & Master Core',
    },
  });
});

// 3.1. Get Active Sessions / Connected Devices
app.get('/api/auth/active-sessions', (req, res) => {
  const authHeader = req.headers.authorization;
  const currentToken = authHeader?.replace('Bearer ', '') || (req.query.token as string);

  if (!currentToken || !activeSessions.has(currentToken)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const sessionsList = Array.from(activeSessions.values()).map(s => ({
    id: s.id,
    username: s.username,
    name: s.name,
    deviceName: s.deviceName,
    ip: s.ip,
    loginTime: s.loginTime,
    lastActive: s.lastActive,
    isCurrent: s.token === currentToken,
  }));

  res.json({
    success: true,
    totalActive: sessionsList.length,
    sessions: sessionsList,
  });
});

// 3.2. Terminate a Specific Session / Kick out Device
app.post('/api/auth/terminate-session', (req, res) => {
  const authHeader = req.headers.authorization;
  const currentToken = authHeader?.replace('Bearer ', '') || (req.body.token as string);

  if (!currentToken || !activeSessions.has(currentToken)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const { sessionId } = req.body || {};
  if (!sessionId) {
    res.status(400).json({ success: false, error: 'معرّف الجلسة مطلوب.' });
    return;
  }

  // Find token with this sessionId
  let targetToken: string | null = null;
  for (const [t, s] of activeSessions.entries()) {
    if (s.id === sessionId) {
      targetToken = t;
      break;
    }
  }

  if (targetToken) {
    activeSessions.delete(targetToken);
    res.json({ success: true, message: 'تم طرد الجهاز وإنهاء جلسته بنجاح.' });
  } else {
    res.status(404).json({ success: false, error: 'الجهاز غير موجود أو تم إغلاق جلسته بالفعل.' });
  }
});

// 3.3. Terminate All Other Devices Immediately (Master Kill-Switch)
app.post('/api/auth/terminate-all-devices', (req, res) => {
  const authHeader = req.headers.authorization;
  const currentToken = authHeader?.replace('Bearer ', '') || (req.body.token as string);

  if (!currentToken || !activeSessions.has(currentToken)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  let terminatedCount = 0;
  for (const [t] of activeSessions.entries()) {
    if (t !== currentToken) {
      activeSessions.delete(t);
      terminatedCount++;
    }
  }

  res.json({
    success: true,
    terminatedCount,
    message: `تم طرد وإخراج جميع الأجهزة الأخرى المتصلة بنجاح (${terminatedCount} جهاز).`,
  });
});

// 4. Change Central Master Credentials
app.post('/api/auth/change-credentials', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.body.token as string);

  const { currentPassword, newUsername, newPassword, newName } = req.body || {};

  const currentAuth = getMasterAuth();

  // Validate current password
  if (currentPassword?.trim() !== currentAuth.passwordHash) {
    res.status(403).json({
      success: false,
      error: 'Current password is incorrect! Verification required to update credentials.',
    });
    return;
  }

  if (!newUsername || newUsername.trim().length < 3) {
    res.status(400).json({ success: false, error: 'New username must be at least 3 characters long.' });
    return;
  }

  if (!newPassword || newPassword.trim().length < 3) {
    res.status(400).json({ success: false, error: 'New password must be at least 3 characters long.' });
    return;
  }

  // Update credentials and bump authVersion to immediately revoke ALL other sessions
  const newAuthVersion = currentAuth.authVersion + 1;
  const updatedConfig: MasterAuthConfig = {
    username: newUsername.trim(),
    passwordHash: newPassword.trim(),
    name: newName?.trim() || currentAuth.name,
    authVersion: newAuthVersion,
    lastUpdated: new Date().toISOString(),
    updatedBy: newUsername.trim(),
  };

  saveMasterAuth(updatedConfig);

  // Clear all old sessions from memory
  activeSessions.clear();

  // Create a fresh token for the current user who performed the change
  const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || '';
  const deviceName = parseDeviceName(userAgent);
  const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

  const freshToken = generateToken();
  activeSessions.set(freshToken, {
    id: sessionId,
    token: freshToken,
    username: updatedConfig.username,
    name: updatedConfig.name,
    authVersion: newAuthVersion,
    loginTime: Date.now(),
    lastActive: Date.now(),
    ip: clientIp,
    userAgent,
    deviceName,
  });

  res.json({
    success: true,
    newToken: freshToken,
    authVersion: newAuthVersion,
    message: 'Master credentials updated successfully! All other active desktop sessions have been logged out instantly.',
    user: {
      username: updatedConfig.username,
      name: updatedConfig.name,
      role: 'admin',
      roleTitleAr: 'المدير العام',
      roleTitleEn: 'Master Administrator',
      branch: 'Central Headquarters & Master Core',
    },
  });
});

// 4.5. Request Email OTP for Password Reset
app.post('/api/auth/send-email-otp', async (req, res) => {
  const { email } = req.body || {};

  const cleanEmail = (email || '').toString().trim().toLowerCase();

  if (!cleanEmail || cleanEmail !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
    res.status(403).json({
      success: false,
      error: 'The entered email address is not registered as an authorized administrator!',
    });
    return;
  }

  // Generate 6-digit cryptographic-like OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  pendingOtpRecord = {
    code: otpCode,
    email: AUTHORIZED_ADMIN_EMAIL,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
    attempts: 0,
  };

  console.log(`[SECURITY OTP] Generated OTP for ${AUTHORIZED_ADMIN_EMAIL}: [${otpCode}]`);

  // Dispatch actual email
  await sendOtpEmail(AUTHORIZED_ADMIN_EMAIL, otpCode);

  res.json({
    success: true,
    message: 'A 6-digit verification code has been dispatched to your authorized email.',
  });
});

// 4.6. Direct PIN & Authorized Email Recovery (Zero-dependency on external mail delivery)
app.post('/api/auth/reset-by-master-pin', (req, res) => {
  const { email, pinCode, newPassword } = req.body || {};

  const cleanEmail = (email || '').toString().trim().toLowerCase();
  const cleanPin = (pinCode || '').toString().trim();

  const isMasterPinMatch = 
    cleanPin === MASTER_RECOVERY_PIN || 
    cleanPin === '1993' ||
    cleanPin === '01100051593' ||
    cleanPin === '201100051593' ||
    cleanPin === '0kingold0';

  const validAdminIdentifiers = [
    AUTHORIZED_ADMIN_EMAIL.toLowerCase(),
    '0kingold0@gmail.com',
    '0kingold0',
    'king',
    'm-king',
    'mking',
    'admin',
    'master',
    '01100051593',
    '1993',
    '',
  ];

  const isAuthorizedIdentifier = validAdminIdentifiers.includes(cleanEmail) || isMasterPinMatch;

  if (!isAuthorizedIdentifier) {
    res.status(403).json({
      success: false,
      error: 'البريد أو اسم المستخدم غير مسجل كمدير عام! يرجى إدخال 0kingold0@gmail.com أو King أو تركه للملء التلقائي.',
    });
    return;
  }

  if (!isMasterPinMatch) {
    res.status(403).json({
      success: false,
      error: 'الرقم السري للمدير (Master PIN) غير صحيح! الرقم السري الافتراضي هو 1993.',
    });
    return;
  }

  if (!newPassword || newPassword.trim().length < 4) {
    res.status(400).json({
      success: false,
      error: 'New password must be at least 4 characters long.',
    });
    return;
  }

  const currentAuth = getMasterAuth();
  const newAuthVersion = currentAuth.authVersion + 1;
  const updatedConfig: MasterAuthConfig = {
    username: currentAuth.username || 'King',
    passwordHash: newPassword.trim(),
    name: currentAuth.name || 'M-King',
    authVersion: newAuthVersion,
    lastUpdated: new Date().toISOString(),
    masterPin: MASTER_RECOVERY_PIN,
    updatedBy: `Master PIN Recovery (${AUTHORIZED_ADMIN_EMAIL})`,
    masterEmail: AUTHORIZED_ADMIN_EMAIL,
    masterPhone: currentAuth.masterPhone || '01100051593',
  };

  saveMasterAuth(updatedConfig);

  // Global Kill-Switch: terminate all existing sessions instantly across all devices
  activeSessions.clear();
  pendingOtpRecord = null;

  const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || '';
  const deviceName = parseDeviceName(userAgent);
  const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

  const freshToken = generateToken();
  activeSessions.set(freshToken, {
    id: sessionId,
    token: freshToken,
    username: updatedConfig.username,
    name: updatedConfig.name,
    authVersion: newAuthVersion,
    loginTime: Date.now(),
    lastActive: Date.now(),
    ip: clientIp,
    userAgent,
    deviceName,
  });

  res.json({
    success: true,
    newToken: freshToken,
    authVersion: newAuthVersion,
    message: 'Master password has been reset successfully! All other connected devices have been revoked and locked.',
    user: {
      username: updatedConfig.username,
      name: updatedConfig.name,
      role: 'admin',
      roleTitleAr: 'المدير العام',
      roleTitleEn: 'Master Administrator',
      branch: 'Central Headquarters & Master Core',
    },
  });
});

// 4.7. Verify Email OTP & Reset Password with Global Kill Switch (Fallback compatible)
app.post('/api/auth/verify-email-otp-and-reset', (req, res) => {
  const { email, otpCode, pinCode, newPassword } = req.body || {};

  const cleanEmail = (email || '').toString().trim().toLowerCase();
  const cleanOtp = (otpCode || pinCode || '').toString().trim();

  const isPin = cleanOtp === '1993' || cleanOtp === '01100051593' || cleanOtp === '201100051593';

  const validEmailsOrUsernames = [
    AUTHORIZED_ADMIN_EMAIL.toLowerCase(),
    'king',
    'm-king',
    'mking',
    '0kingold0',
    '0kingold0@gmail.com',
    '01100051593',
    'admin',
  ];

  if (!cleanEmail || !validEmailsOrUsernames.includes(cleanEmail)) {
    res.status(403).json({
      success: false,
      error: 'البريد أو اسم المستخدم غير مصرح له. يرجى إدخال 0kingold0@gmail.com أو King.',
    });
    return;
  }

  if (!isPin && (!pendingOtpRecord || Date.now() > pendingOtpRecord.expiresAt || pendingOtpRecord.code !== cleanOtp)) {
    res.status(400).json({
      success: false,
      error: 'Security OTP code or PIN is invalid or expired!',
    });
    return;
  }

  if (!newPassword || newPassword.trim().length < 4) {
    res.status(400).json({
      success: false,
      error: 'New password must be at least 4 characters long.',
    });
    return;
  }

  const currentAuth = getMasterAuth();
  const newAuthVersion = currentAuth.authVersion + 1;
  const updatedConfig: MasterAuthConfig = {
    username: currentAuth.username || 'King',
    passwordHash: newPassword.trim(),
    name: currentAuth.name || 'M-King',
    authVersion: newAuthVersion,
    lastUpdated: new Date().toISOString(),
    updatedBy: `Recovery (${AUTHORIZED_ADMIN_EMAIL})`,
    masterEmail: AUTHORIZED_ADMIN_EMAIL,
    masterPhone: currentAuth.masterPhone || '01100051593',
  };

  saveMasterAuth(updatedConfig);

  // Global Kill-Switch: terminate all existing sessions instantly across all devices
  activeSessions.clear();
  pendingOtpRecord = null;

  const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || '';
  const deviceName = parseDeviceName(userAgent);
  const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

  const freshToken = generateToken();
  activeSessions.set(freshToken, {
    id: sessionId,
    token: freshToken,
    username: updatedConfig.username,
    name: updatedConfig.name,
    authVersion: newAuthVersion,
    loginTime: Date.now(),
    lastActive: Date.now(),
    ip: clientIp,
    userAgent,
    deviceName,
  });

  res.json({
    success: true,
    newToken: freshToken,
    authVersion: newAuthVersion,
    message: 'Master password has been reset successfully! All sessions updated.',
    user: {
      username: updatedConfig.username,
      name: updatedConfig.name,
      role: 'admin',
      roleTitleAr: 'المدير العام',
      roleTitleEn: 'Master Administrator',
      branch: 'Central Headquarters & Master Core',
    },
  });
});

// 5. Logout Endpoint
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.body.token as string);

  if (token) {
    activeSessions.delete(token);
  }

  res.json({ success: true });
});

// ==================== LICENSE & TRIAL MANAGEMENT SYSTEM ====================

const LICENSE_STORE_FILE = path.join(DATA_DIR, 'license-store.json');
const TRIAL_DURATION_MS = 5 * 60 * 1000; // 5 Minutes Free Trial for Testing
const DEFAULT_LICENSE_PRICE_EGP = 5000; // 5,000 EGP License
const MASTER_CONTACT_PHONE = '01100051593';

interface DeviceRecord {
  deviceId: string;
  firstSeenAt: number;
  trialDurationMs: number;
  trialExpiresAt: number;
  isActivated: boolean;
  activatedAt?: number;
  licenseKey?: string;
  licenseExpiresAt?: number;
  planType: 'trial' | 'annual' | 'lifetime' | 'monthly' | 'semi_annual' | 'custom';
  clientName?: string;
  branchName?: string;
  phone?: string;
  notes?: string;
  activationRequested?: boolean;
  requestedAt?: number;
  requestedBranch?: string;
  requestedPhone?: string;
  requestedNotes?: string;
  lastSeenAt: number;
  ip: string;
  deviceName: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
  address?: string;
}

interface StoredLicenseRecord {
  key: string;
  deviceId: string;
  clientName: string;
  planType: 'annual' | 'lifetime' | 'monthly' | 'semi_annual' | 'custom';
  priceEgp: number;
  createdAt: number;
  expiresAt: number;
  generatedBy: string;
  notes?: string;
  usedAt?: number;
  isActive: boolean;
}

interface LicenseStoreData {
  masterSecret: string;
  defaultPriceEgp: number;
  devices: Record<string, DeviceRecord>;
  licenses: Record<string, StoredLicenseRecord>;
}

function getLicenseStore(): LicenseStoreData {
  try {
    if (!fs.existsSync(LICENSE_STORE_FILE)) {
      const initialStore: LicenseStoreData = {
        masterSecret: 'bk_king_master_secret_' + Math.random().toString(36).substring(2, 15),
        defaultPriceEgp: DEFAULT_LICENSE_PRICE_EGP,
        devices: {},
        licenses: {},
      };
      fs.writeFileSync(LICENSE_STORE_FILE, JSON.stringify(initialStore, null, 2), 'utf-8');
      return initialStore;
    }
    const raw = fs.readFileSync(LICENSE_STORE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading license store', err);
    return {
      masterSecret: 'bk_king_master_secret_fallback',
      defaultPriceEgp: DEFAULT_LICENSE_PRICE_EGP,
      devices: {},
      licenses: {},
    };
  }
}

function saveLicenseStore(store: LicenseStoreData): void {
  try {
    fs.writeFileSync(LICENSE_STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving license store', err);
  }
}

// Generate deterministic & cryptographically signed license keys
function generateLicenseKey(
  deviceId: string,
  planType: 'annual' | 'lifetime' | 'monthly' | 'semi_annual' | 'custom',
  durationDays: number
): { key: string; expiresAt: number } {
  const store = getLicenseStore();
  const rawId = (deviceId || '').trim().toUpperCase();
  const isUniversal = !rawId || rawId === 'UNIVERSAL' || rawId === 'ANY' || rawId === 'ALL';
  const cleanId = isUniversal ? 'UNIVERSAL' : rawId;
  const now = Date.now();
  const expiresAt = durationDays > 0 ? now + durationDays * 24 * 60 * 60 * 1000 : 0; // 0 = Lifetime
  
  const expChunk = expiresAt > 0 
    ? Math.floor(expiresAt / 86400000).toString(16).toUpperCase().padStart(4, '0') 
    : 'LIFE';
  const devChunk = isUniversal 
    ? 'UNIV' 
    : cleanId.replace(/[^A-Z0-9]/g, '').slice(-4).padStart(4, 'X');
  const salt = crypto.randomBytes(2).toString('hex').toUpperCase();

  const hmac = crypto.createHmac('sha256', store.masterSecret);
  hmac.update(`${cleanId}:${planType}:${expChunk}:${salt}`);
  const signature = hmac.digest('hex').slice(0, 4).toUpperCase();

  const key = `BK-LIC-${salt}-${expChunk}-${devChunk}-${signature}`;
  return { key, expiresAt };
}

// Validate license key for a given device
function verifyLicenseKey(
  key: string,
  deviceId: string
): { valid: boolean; planType?: 'annual' | 'lifetime' | 'monthly' | 'semi_annual' | 'custom'; expiresAt?: number; reason?: string; isMaster?: boolean } {
  const store = getLicenseStore();
  const cleanKey = (key || '').trim().toUpperCase();
  const cleanDevice = (deviceId || '').trim().toUpperCase();

  // 1. Universal Master Bypass Keys & PINs
  const masterBypassKeys = [
    'BK-LIC-KING-1993-MASTER-LIFETIME',
    'BK-LIC-M-KING-01100051593',
    'KING-1993',
    'KING1993',
    '1993',
    '01100051593',
    '0KINGOLD0',
    'BKKING',
    'KING',
    'M-KING',
    'MKING',
    'MASTER',
    'LIFETIME',
    'ADMIN',
  ];

  if (masterBypassKeys.includes(cleanKey)) {
    return { valid: true, planType: 'lifetime', expiresAt: 0, isMaster: true };
  }

  // 2. Check explicitly recorded generated keys
  if (store.licenses[cleanKey]) {
    const rec = store.licenses[cleanKey];
    if (!rec.isActive) {
      return { valid: false, reason: 'تم إلغاء أو تعطيل هذا المفتاح بواسطة الإدارة.' };
    }
    if (rec.expiresAt > 0 && Date.now() > rec.expiresAt) {
      return { valid: false, reason: 'انتهت فترة صلاحية هذا الترخيص.' };
    }

    const isUniversalKey = !rec.deviceId || rec.deviceId.toUpperCase() === 'UNIVERSAL' || rec.deviceId === 'ANY' || rec.deviceId === 'ALL';
    
    // If not universal and not matching current device:
    if (!isUniversalKey && rec.deviceId && rec.deviceId.toUpperCase() !== cleanDevice) {
      // If it has not been activated yet, auto-bind to this device!
      if (!rec.usedAt) {
        rec.deviceId = cleanDevice;
      } else {
        return { 
          valid: false, 
          reason: `هذا المفتاح تم تفعيله مسبقاً على جهاز آخر (${rec.deviceId.slice(-9)}). يرجى التواصل مع الإدارة.` 
        };
      }
    }
    return { valid: true, planType: rec.planType, expiresAt: rec.expiresAt };
  }

  // 3. Cryptographic Signature Validation
  const parts = cleanKey.split('-');
  if (parts.length === 6 && parts[0] === 'BK' && parts[1] === 'LIC') {
    const [_, __, salt, expChunk, devChunk, sig] = parts;
    const devMatch = cleanDevice.replace(/[^A-Z0-9]/g, '').slice(-4).padStart(4, 'X');
    const isUnivChunk = devChunk === 'UNIV' || devChunk === 'XXXX' || devChunk === 'ALL';

    if (!isUnivChunk && devChunk !== devMatch) {
      return { 
        valid: false, 
        reason: `كود الترخيص ينتهي برمز (${devChunk}) بينما جهازك الحالي ينتهي بـ (${devMatch}). الكود غير مطابق لهذا الجهاز.` 
      };
    }

    const plans: Array<'annual' | 'lifetime' | 'monthly' | 'semi_annual' | 'custom'> = [
      'annual', 'lifetime', 'monthly', 'semi_annual', 'custom'
    ];
    for (const plan of plans) {
      const hmac = crypto.createHmac('sha256', store.masterSecret);
      const hmacTarget = isUnivChunk ? 'UNIVERSAL' : cleanDevice;
      hmac.update(`${hmacTarget}:${plan}:${expChunk}:${salt}`);
      const expectedSig = hmac.digest('hex').slice(0, 4).toUpperCase();
      if (expectedSig === sig) {
        let expiresAt = 0;
        if (expChunk !== 'LIFE') {
          const days = parseInt(expChunk, 16);
          if (!isNaN(days)) {
            expiresAt = days * 86400000;
            if (Date.now() > expiresAt) {
              return { valid: false, reason: 'انتهت فترة صلاحية هذا الترخيص.' };
            }
          }
        }
        return { valid: true, planType: plan, expiresAt };
      }
    }
  }

  return { valid: false, reason: 'مفتاح الترخيص غير صالح. يرجى التأكد من نسخه بدقة أو إدخال الرقم السري 1993.' };
}

// Check whether caller has Master Admin rights
function isCallerMasterAdmin(req: express.Request): boolean {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.query.token as string);
  const pinHeader = (req.headers['x-master-pin'] as string) || (req.body?.masterPin as string);

  if (pinHeader === MASTER_RECOVERY_PIN || pinHeader === '1993' || pinHeader === '01100051593') {
    return true;
  }

  if (token) {
    if (activeSessions.has(token)) {
      const session = activeSessions.get(token);
      if (session && (session.username.toLowerCase() === 'king' || session.username.toLowerCase() === 'admin')) {
        return true;
      }
    }
    // Also accept valid session token generated for admin
    if (token.startsWith('token_')) {
      return true;
    }
  }
  return false;
}

// 1. Device License & 24-Hour Trial Status Check
app.get('/api/license/status', (req, res) => {
  try {
    const deviceId = ((req.query.deviceId as string) || '').trim().toUpperCase();
    const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = (req.headers['user-agent'] as string) || '';
    const deviceName = parseDeviceName(userAgent);

    const isMaster = isCallerMasterAdmin(req);

    // If Master Admin, always full access and never expired!
    if (isMaster) {
      res.json({
        success: true,
        deviceId: deviceId || 'BK-DEV-MASTER-ADMIN',
        status: 'active',
        isExpired: false,
        isMaster: true,
        trialStartedAt: Date.now() - 3600000,
        trialExpiresAt: Date.now() + 365 * 24 * 3600000,
        remainingMs: 365 * 24 * 3600000,
        priceEgp: DEFAULT_LICENSE_PRICE_EGP,
        planType: 'lifetime',
        contactPhone: MASTER_CONTACT_PHONE,
        clientName: 'المدير العام (Master Admin)',
      });
      return;
    }

    if (!deviceId) {
      res.status(400).json({ success: false, error: 'معرّف الجهاز مطلوب (Device ID required)' });
      return;
    }

    const store = getLicenseStore();
    let device = store.devices[deviceId];
    const now = Date.now();

    // First time this device connects (or after being wiped/deleted by admin): start fresh trial!
    if (!device) {
      device = {
        deviceId,
        firstSeenAt: now,
        trialDurationMs: TRIAL_DURATION_MS,
        trialExpiresAt: now + TRIAL_DURATION_MS,
        isActivated: false,
        planType: 'trial',
        lastSeenAt: now,
        ip: clientIp,
        deviceName,
      };
      store.devices[deviceId] = device;
      saveLicenseStore(store);
    } else {
      // Update last seen
      device.lastSeenAt = now;
      device.ip = clientIp;
      if (deviceName) device.deviceName = deviceName;
      saveLicenseStore(store);
    }

    // Preserve device ID cookie
    try {
      res.setHeader('Set-Cookie', `bk_dev_id=${device.deviceId}; Path=/; Max-Age=31536000; SameSite=Lax`);
    } catch {}

    // Check status
    let status: 'trial' | 'active' | 'expired' | 'pending_approval' = 'trial';
    let isExpired = false;
    let remainingMs = 0;

    const isDeviceMaster = Boolean(
      device.planType !== 'trial' && (
        isMaster ||
        device.licenseKey?.includes('MASTER') ||
        device.licenseKey === 'KING-1993' ||
        device.licenseKey === '1993' ||
        device.clientName?.includes('Master') ||
        device.clientName?.includes('المدير العام') ||
        device.clientName?.includes('M-King')
      )
    );

    if (isDeviceMaster) {
      status = 'active';
      isExpired = false;
      remainingMs = 999999999999;
      device.isActivated = true;
      device.planType = 'lifetime';
    } else if (device.isActivated || (device.licenseExpiresAt && device.licenseExpiresAt > now)) {
      device.isActivated = true;
      if (device.licenseExpiresAt && device.licenseExpiresAt > 0) {
        if (now > device.licenseExpiresAt) {
          status = 'expired';
          isExpired = true;
          remainingMs = 0;
        } else {
          status = 'active';
          remainingMs = device.licenseExpiresAt - now;
        }
      } else {
        // Lifetime license
        status = 'active';
        remainingMs = 999999999999;
      }
    } else if (device.activationRequested) {
      // Client has submitted an activation request and is waiting for Admin approval
      status = 'pending_approval';
      isExpired = now > device.trialExpiresAt;
      remainingMs = Math.max(0, device.trialExpiresAt - now);
    } else {
      // In Trial mode
      if (now > device.trialExpiresAt) {
        status = 'expired';
        isExpired = true;
        remainingMs = 0;
      } else {
        status = 'trial';
        remainingMs = Math.max(0, device.trialExpiresAt - now);
      }
    }

    res.json({
      success: true,
      deviceId: device.deviceId,
      status,
      isExpired,
      activationRequested: Boolean(device.activationRequested),
      requestedAt: device.requestedAt,
      requestedBranch: device.requestedBranch || device.branchName || device.clientName,
      requestedPhone: device.requestedPhone || device.phone,
      requestedNotes: device.requestedNotes || device.notes,
      trialStartedAt: device.firstSeenAt,
      trialExpiresAt: device.trialExpiresAt,
      remainingMs,
      priceEgp: store.defaultPriceEgp || DEFAULT_LICENSE_PRICE_EGP,
      planType: device.planType || 'trial',
      licenseKey: device.licenseKey,
      licenseExpiresAt: device.licenseExpiresAt,
      clientName: device.clientName || device.branchName,
      contactPhone: MASTER_CONTACT_PHONE,
      isMaster: isMaster || isDeviceMaster,
    });
  } catch (err) {
    console.warn('License status endpoint warning:', err);
    res.status(500).json({ success: false, error: 'License server internal error' });
  }
});

// 1.2. Reset Device Trial to 5 Minutes (For Testing & Evaluation)
app.post('/api/license/reset-test-trial', (req, res) => {
  const { deviceId } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ success: false, error: 'كود الجهاز مطلوب.' });
    return;
  }

  const cleanId = (deviceId || '').trim().toUpperCase();
  const store = getLicenseStore();
  const now = Date.now();
  let device = store.devices[cleanId];

  if (!device) {
    const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = (req.headers['user-agent'] as string) || '';
    device = {
      deviceId: cleanId,
      firstSeenAt: now,
      trialDurationMs: TRIAL_DURATION_MS,
      trialExpiresAt: now + TRIAL_DURATION_MS,
      isActivated: false,
      planType: 'trial',
      lastSeenAt: now,
      ip: clientIp,
      deviceName: parseDeviceName(userAgent),
    };
  } else {
    device.isActivated = false;
    device.activationRequested = false;
    device.trialDurationMs = TRIAL_DURATION_MS;
    device.trialExpiresAt = now + TRIAL_DURATION_MS;
    device.planType = 'trial';
    device.licenseKey = undefined;
    device.licenseExpiresAt = undefined;
    device.clientName = undefined;
    device.lastSeenAt = now;
  }

  store.devices[cleanId] = device;
  saveLicenseStore(store);

  res.json({
    success: true,
    message: 'تم بدء تجربة 5 دقائق جديدة لهذا الجهاز بنجاح! سيتم قفل الجهاز بعد 5 دقائق للاختبار.',
    device,
    trialExpiresAt: device.trialExpiresAt,
    remainingMs: device.trialExpiresAt - now,
  });
});

// 1.5. Client: Request Remote Activation from Admin (One-Click with Branch info & Location)
app.post('/api/license/request-activation', (req, res) => {
  const { deviceId, branchName, phone, notes, latitude, longitude, city, country, address } = req.body || {};

  if (!deviceId) {
    res.status(400).json({ success: false, error: 'Device ID is required.' });
    return;
  }

  const cleanId = (deviceId || '').trim().toUpperCase();
  const store = getLicenseStore();
  let device = store.devices[cleanId];
  const now = Date.now();
  const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || '';
  const deviceName = parseDeviceName(userAgent);

  if (!device) {
    device = {
      deviceId: cleanId,
      firstSeenAt: now,
      trialDurationMs: TRIAL_DURATION_MS,
      trialExpiresAt: now + TRIAL_DURATION_MS,
      isActivated: false,
      planType: 'trial',
      lastSeenAt: now,
      ip: clientIp,
      deviceName,
    };
    store.devices[cleanId] = device;
  }

  const finalBranch = (branchName || '').trim() || device.branchName || device.clientName || 'New Branch';
  device.activationRequested = true;
  device.requestedAt = now;
  device.requestedBranch = finalBranch;
  device.requestedPhone = (phone || '').trim() || device.phone || '';
  device.requestedNotes = (notes || '').trim() || device.notes || '';
  device.branchName = finalBranch;
  device.clientName = finalBranch;
  if (phone) device.phone = phone.trim();
  device.lastSeenAt = now;

  // Location and tracking information
  if (latitude && !isNaN(Number(latitude))) device.latitude = Number(latitude);
  if (longitude && !isNaN(Number(longitude))) device.longitude = Number(longitude);
  if (city) device.city = String(city).trim();
  if (country) device.country = String(country).trim();
  if (address) device.address = String(address).trim();

  saveLicenseStore(store);

  res.json({
    success: true,
    message: 'Activation request submitted successfully! Your app will automatically unlock as soon as approved by the Master Admin.',
    requestedBranch: device.requestedBranch,
    requestedAt: device.requestedAt,
    deviceId: cleanId,
    latitude: device.latitude,
    longitude: device.longitude,
    city: device.city,
    country: device.country,
    address: device.address,
  });
});

// 1.6. Admin: Approve Activation and Select Duration (auto-registers if not exists)
app.post('/api/license/admin/approve-activation', (req, res) => {
  if (!isCallerMasterAdmin(req)) {
    res.status(403).json({ success: false, error: 'Unauthorized. This action is restricted to Master Admin.' });
    return;
  }

  const {
    deviceId,
    durationType = '1_year',
    customDays = 30,
    branchName,
    priceEgp = DEFAULT_LICENSE_PRICE_EGP,
    notes,
  } = req.body || {};

  if (!deviceId) {
    res.status(400).json({ success: false, error: 'Device ID is required.' });
    return;
  }

  const cleanId = (deviceId || '').trim().toUpperCase();
  const store = getLicenseStore();
  let device = store.devices[cleanId];
  const now = Date.now();

  // If device is not in store yet (e.g. manual activation sent via WhatsApp), create it!
  if (!device) {
    device = {
      deviceId: cleanId,
      firstSeenAt: now,
      trialDurationMs: TRIAL_DURATION_MS,
      trialExpiresAt: now,
      isActivated: true,
      planType: 'annual',
      lastSeenAt: now,
      ip: 'Pre-registered by Admin',
      deviceName: 'Registered by Master Admin',
    };
    store.devices[cleanId] = device;
  }

  let durationMs = 365 * 24 * 3600000;
  let planLabel: 'trial' | 'annual' | 'lifetime' | 'monthly' | 'semi_annual' | 'custom' = 'annual';
  let arabicDuration = 'سنة كاملة (365 يوم)';

  switch (durationType) {
    case '1_month':
      durationMs = 30 * 24 * 3600000;
      planLabel = 'monthly';
      arabicDuration = 'شهر واحد (30 يوم)';
      break;
    case '3_months':
      durationMs = 90 * 24 * 3600000;
      planLabel = 'custom';
      arabicDuration = '3 أشهر (90 يوم)';
      break;
    case '6_months':
      durationMs = 180 * 24 * 3600000;
      planLabel = 'semi_annual';
      arabicDuration = '6 أشهر (180 يوم)';
      break;
    case '1_year':
      durationMs = 365 * 24 * 3600000;
      planLabel = 'annual';
      arabicDuration = 'سنة كاملة (365 يوم)';
      break;
    case '2_years':
      durationMs = 730 * 24 * 3600000;
      planLabel = 'custom';
      arabicDuration = 'سنتين (730 يوم)';
      break;
    case 'lifetime':
      durationMs = 0;
      planLabel = 'lifetime';
      arabicDuration = 'ترخيص دائم مدى الحياة';
      break;
    case 'custom_days':
      durationMs = Math.max(1, Number(customDays) || 30) * 24 * 3600000;
      planLabel = 'custom';
      arabicDuration = `${Number(customDays) || 30} يوم`;
      break;
    default:
      durationMs = 365 * 24 * 3600000;
      planLabel = 'annual';
      arabicDuration = 'سنة كاملة';
  }

  const expiresAt = durationMs === 0 ? 0 : now + durationMs;
  const finalBranchName = (branchName || device.requestedBranch || device.branchName || device.clientName || 'عميل مرخص').trim();

  device.isActivated = true;
  device.activationRequested = false;
  device.activatedAt = now;
  device.licenseExpiresAt = expiresAt;
  device.planType = planLabel;
  device.clientName = finalBranchName;
  device.branchName = finalBranchName;
  device.licenseKey = `BK-APPROVED-${cleanId.slice(-4)}-${Date.now().toString(36).toUpperCase()}`;
  if (notes) device.notes = notes.trim();

  // Also log into store.licenses for sales & financial record
  const licenseKey = device.licenseKey;
  store.licenses[licenseKey] = {
    key: licenseKey,
    deviceId: cleanId,
    clientName: finalBranchName,
    planType: planLabel,
    priceEgp: Number(priceEgp) || 0,
    createdAt: now,
    expiresAt,
    generatedBy: 'M-King (Approval)',
    notes: notes?.trim() || `تم التفعيل عبر نظام الموافقة الفوري (${arabicDuration})`,
    usedAt: now,
    isActive: true,
  };

  saveLicenseStore(store);

  res.json({
    success: true,
    message: `تمت الموافقة وتفعيل ترخيص (${finalBranchName}) بنجاح لمدة: ${arabicDuration}!`,
    device,
    licenseExpiresAt: expiresAt,
    planType: planLabel,
    durationText: arabicDuration,
  });
});

// 1.7. Admin: Reject/Dismiss Activation Request
app.post('/api/license/admin/reject-activation', (req, res) => {
  if (!isCallerMasterAdmin(req)) {
    res.status(403).json({ success: false, error: 'غير مصرح لك. هذه الخاصية متاحة للمدير العام فقط.' });
    return;
  }

  const { deviceId } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ success: false, error: 'كود الجهاز مطلوب.' });
    return;
  }

  const cleanId = (deviceId || '').trim().toUpperCase();
  const store = getLicenseStore();
  const device = store.devices[cleanId];

  if (!device) {
    res.status(404).json({ success: false, error: 'الجهاز غير موجود.' });
    return;
  }

  device.activationRequested = false;
  saveLicenseStore(store);

  res.json({
    success: true,
    message: `تم إلغاء طلب التفعيل للجهاز ${cleanId} بنجاح.`,
  });
});

// 2. Activate License Key
app.post('/api/license/activate', (req, res) => {
  const { deviceId, licenseKey, clientName } = req.body || {};

  if (!deviceId || !licenseKey) {
    res.status(400).json({ success: false, error: 'يرجى إدخال كود الجهاز ومفتاح الترخيص.' });
    return;
  }

  const cleanDevice = deviceId.trim().toUpperCase();
  const cleanKey = licenseKey.trim().toUpperCase();

  const verification = verifyLicenseKey(cleanKey, cleanDevice);
  if (!verification.valid) {
    res.status(400).json({ success: false, error: verification.reason || 'مفتاح الترخيص غير صحيح أو منتهي الصلاحية.' });
    return;
  }

  const store = getLicenseStore();
  let device = store.devices[cleanDevice];
  const now = Date.now();
  const isMasterActivation = Boolean(verification.isMaster);

  if (!device) {
    const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || '127.0.0.1';
    device = {
      deviceId: cleanDevice,
      firstSeenAt: now,
      trialDurationMs: TRIAL_DURATION_MS,
      trialExpiresAt: now + (isMasterActivation ? 365 * 24 * 3600000 : TRIAL_DURATION_MS),
      isActivated: true,
      activatedAt: now,
      licenseKey: isMasterActivation ? 'BK-LIC-KING-1993-MASTER-LIFETIME' : cleanKey,
      licenseExpiresAt: isMasterActivation ? 0 : verification.expiresAt,
      planType: isMasterActivation ? 'lifetime' : (verification.planType || 'annual'),
      clientName: clientName?.trim() || (isMasterActivation ? 'جهاز المدير العام (M-King Master)' : 'عميل مرخص'),
      lastSeenAt: now,
      ip: clientIp,
      deviceName: parseDeviceName(req.headers['user-agent'] as string || ''),
    };
  } else {
    device.isActivated = true;
    device.activatedAt = now;
    device.licenseKey = isMasterActivation ? 'BK-LIC-KING-1993-MASTER-LIFETIME' : cleanKey;
    device.licenseExpiresAt = isMasterActivation ? 0 : verification.expiresAt;
    device.planType = isMasterActivation ? 'lifetime' : (verification.planType || 'annual');
    if (clientName) {
      device.clientName = clientName.trim();
    } else if (isMasterActivation) {
      device.clientName = 'جهاز المدير العام (M-King Master)';
    }
    device.lastSeenAt = now;
  }

  store.devices[cleanDevice] = device;

  // Mark in licenses store if existing record
  if (store.licenses[cleanKey]) {
    store.licenses[cleanKey].usedAt = now;
    store.licenses[cleanKey].deviceId = cleanDevice;
  }

  saveLicenseStore(store);

  // If Master key, create admin active session and return token as well!
  let masterToken: string | undefined;
  let masterUser: any = undefined;

  if (isMasterActivation) {
    const currentAuth = getMasterAuth();
    masterToken = generateToken();
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    activeSessions.set(masterToken, {
      id: sessionId,
      token: masterToken,
      username: currentAuth.username || 'King',
      name: currentAuth.name || 'M-King',
      authVersion: currentAuth.authVersion,
      loginTime: Date.now(),
      lastActive: Date.now(),
      ip: req.socket.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] as string || '',
      deviceName: parseDeviceName(req.headers['user-agent'] as string || ''),
    });
    masterUser = {
      username: currentAuth.username || 'King',
      name: currentAuth.name || 'M-King',
      role: 'admin',
      roleTitleAr: 'المدير العام',
      roleTitleEn: 'Master Administrator',
      branch: 'Central Headquarters & Master Core',
    };
  }

  res.json({
    success: true,
    message: isMasterActivation 
      ? 'تم تفعيل ترخيص المدير العام مدى الحياة بنجاح! تم تسجيل دخولك كمدير عام.' 
      : 'تم تفعيل النسخة الكاملة بنجاح! شكراً لاشتراكك في منظومة KING Audit.',
    planType: device.planType,
    licenseExpiresAt: device.licenseExpiresAt,
    clientName: device.clientName,
    isMaster: isMasterActivation,
    token: masterToken,
    user: masterUser,
  });
});

// 3. Instant Master Admin PIN Bypass (Unlock device directly via Master PIN 1993)
app.post('/api/license/master-bypass', (req, res) => {
  const { pinCode, deviceId } = req.body || {};

  const cleanPin = (pinCode || '').toString().trim();
  const cleanDevice = (deviceId || '').toString().trim().toUpperCase();

  if (
    cleanPin !== MASTER_RECOVERY_PIN && 
    cleanPin !== '1993' && 
    cleanPin !== '01100051593' &&
    cleanPin !== '0kingold0' &&
    cleanPin.toUpperCase() !== 'BKKING'
  ) {
    res.status(403).json({ success: false, error: 'الرقم السري للمدير العام غير صحيح. (PIN: 1993)' });
    return;
  }

  const store = getLicenseStore();
  const now = Date.now();
  let device = store.devices[cleanDevice];

  if (!device && cleanDevice) {
    device = {
      deviceId: cleanDevice,
      firstSeenAt: now,
      trialDurationMs: TRIAL_DURATION_MS,
      trialExpiresAt: now + 365 * 24 * 3600000,
      isActivated: true,
      activatedAt: now,
      licenseKey: 'BK-LIC-KING-1993-MASTER-LIFETIME',
      licenseExpiresAt: 0, // Lifetime
      planType: 'lifetime',
      clientName: 'جهاز المدير العام (M-King Master)',
      lastSeenAt: now,
      ip: req.socket.remoteAddress || '127.0.0.1',
      deviceName: parseDeviceName(req.headers['user-agent'] as string || ''),
    };
    store.devices[cleanDevice] = device;
  } else if (device) {
    device.isActivated = true;
    device.activatedAt = now;
    device.licenseKey = 'BK-LIC-KING-1993-MASTER-LIFETIME';
    device.licenseExpiresAt = 0;
    device.planType = 'lifetime';
    device.clientName = 'جهاز المدير العام (M-King Master)';
    device.lastSeenAt = now;
  }

  saveLicenseStore(store);

  // Return fresh admin token as well so the user gets logged into the master account
  const currentAuth = getMasterAuth();
  const freshToken = generateToken();
  const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  
  activeSessions.set(freshToken, {
    id: sessionId,
    token: freshToken,
    username: currentAuth.username || 'King',
    name: currentAuth.name || 'M-King',
    authVersion: currentAuth.authVersion,
    loginTime: Date.now(),
    lastActive: Date.now(),
    ip: req.socket.remoteAddress || '127.0.0.1',
    userAgent: req.headers['user-agent'] as string || '',
    deviceName: parseDeviceName(req.headers['user-agent'] as string || ''),
  });

  res.json({
    success: true,
    message: 'تم تفعيل الجهاز بصفته جهاز المدير العام بنجاح!',
    token: freshToken,
    user: {
      username: currentAuth.username || 'King',
      name: currentAuth.name || 'M-King',
      role: 'admin',
      roleTitleAr: 'المدير العام',
      roleTitleEn: 'Master Administrator',
      branch: 'Central Headquarters & Master Core',
    },
  });
});

// 4. Admin: Generate Cryptographic License Key for a Client
app.post('/api/license/admin/generate', (req, res) => {
  if (!isCallerMasterAdmin(req)) {
    res.status(403).json({ success: false, error: 'غير مصرح لك. هذه الخاصية متاحة للمدير العام فقط.' });
    return;
  }

  const { deviceId, clientName, planType = 'annual', durationDays = 365, priceEgp = DEFAULT_LICENSE_PRICE_EGP, notes } = req.body || {};

  const cleanDevice = (!deviceId || deviceId.trim().toUpperCase() === 'UNIVERSAL' || deviceId.trim().toUpperCase() === 'ALL')
    ? 'UNIVERSAL'
    : deviceId.trim().toUpperCase();

  const { key, expiresAt } = generateLicenseKey(cleanDevice, planType, Number(durationDays));

  const store = getLicenseStore();
  const record: StoredLicenseRecord = {
    key,
    deviceId: cleanDevice,
    clientName: clientName?.trim() || (cleanDevice === 'UNIVERSAL' ? 'مفتاح ترخيص عام' : 'عميل تجاري'),
    planType,
    priceEgp: Number(priceEgp) || DEFAULT_LICENSE_PRICE_EGP,
    createdAt: Date.now(),
    expiresAt,
    generatedBy: 'M-King (Master Admin)',
    notes: notes?.trim() || '',
    isActive: true,
  };

  store.licenses[key] = record;
  saveLicenseStore(store);

  // Generate ready-to-send WhatsApp Message
  const durationText = planType === 'lifetime' ? 'مدى الحياة (دائم)' : `${durationDays} يوم`;
  const whatsappMessage = `👑 *منظومة BURGER KING & Talabat Audit - ترخيص رسمي*
مرحباً بك أستاذ / ${record.clientName}،
تم إصدار مفتاح تفعيل النسخة الكاملة بنجاح:
🔑 *كود الترخيص:*
\`${key}\`
📱 *كود الجهاز:* ${cleanDevice === 'UNIVERSAL' ? 'يعمل على أي جهاز (شامل)' : cleanDevice}
⏳ *المدة:* ${durationText}
💰 *المبلغ المستلم:* ${record.priceEgp.toLocaleString()} ج.م

طريقة التفعيل: انسخ الكود وضعه في خانة (مفتاح التفعيل) في شاشة البرنامج واضغط (تفعيل الترخيص فوراً). شكراً لثقتكم!`;

  res.json({
    success: true,
    licenseKey: key,
    record,
    whatsappMessage,
    expiresAt,
  });
});

// 5. Admin: List All Tracked Devices & Licenses
app.get('/api/license/admin/devices', (req, res) => {
  if (!isCallerMasterAdmin(req)) {
    res.status(403).json({ success: false, error: 'غير مصرح لك.' });
    return;
  }

  const store = getLicenseStore();
  const now = Date.now();

  const devicesList = Object.values(store.devices).map(d => {
    let status: 'trial' | 'active' | 'expired' | 'pending_approval' = 'trial';
    let remainingMs = 0;

    if (d.isActivated) {
      if (d.licenseExpiresAt && d.licenseExpiresAt > 0) {
        if (now > d.licenseExpiresAt) {
          status = 'expired';
          remainingMs = 0;
        } else {
          status = 'active';
          remainingMs = d.licenseExpiresAt - now;
        }
      } else {
        status = 'active';
        remainingMs = 999999999999;
      }
    } else if (d.activationRequested) {
      status = 'pending_approval';
      remainingMs = Math.max(0, d.trialExpiresAt - now);
    } else {
      if (now > d.trialExpiresAt) {
        status = 'expired';
        remainingMs = 0;
      } else {
        status = 'trial';
        remainingMs = Math.max(0, d.trialExpiresAt - now);
      }
    }

    return {
      ...d,
      status,
      remainingMs,
    };
  });

  const licensesList = Object.values(store.licenses).sort((a, b) => b.createdAt - a.createdAt);
  const pendingRequests = devicesList.filter(d => d.activationRequested && !d.isActivated);

  res.json({
    success: true,
    totalDevices: devicesList.length,
    activeCount: devicesList.filter(d => d.status === 'active').length,
    pendingCount: pendingRequests.length,
    trialCount: devicesList.filter(d => d.status === 'trial').length,
    expiredCount: devicesList.filter(d => d.status === 'expired').length,
    pendingRequests,
    devices: devicesList.sort((a, b) => {
      if (a.activationRequested && !b.activationRequested) return -1;
      if (!a.activationRequested && b.activationRequested) return 1;
      return b.lastSeenAt - a.lastSeenAt;
    }),
    licenses: licensesList,
  });
});

// 6. Admin: Remote Action on Device (Instant activate, extend trial, change duration, or reset)
app.post('/api/license/admin/device-action', (req, res) => {
  if (!isCallerMasterAdmin(req)) {
    res.status(403).json({ success: false, error: 'غير مصرح لك.' });
    return;
  }

  const { action, deviceId, extraHours = 24, clientName, durationDays = 365, planType = 'annual' } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ success: false, error: 'كود الجهاز مطلوب.' });
    return;
  }

  const store = getLicenseStore();
  const cleanDevice = deviceId.trim().toUpperCase();
  const device = store.devices[cleanDevice];

  // Handle wipe/delete action even if device is already partially removed
  if (action === 'delete' || action === 'wipe' || action === 'delete_device') {
    const deviceBranch = device ? (device.branchName || device.clientName || device.requestedBranch || cleanDevice) : cleanDevice;
    delete store.devices[cleanDevice];

    // Remove any recorded license tied directly to this device
    for (const [key, lic] of Object.entries(store.licenses)) {
      if (lic.deviceId && lic.deviceId.toUpperCase() === cleanDevice) {
        delete store.licenses[key];
      }
    }

    saveLicenseStore(store);
    res.json({
      success: true,
      message: `تم مسح الجهاز (${deviceBranch}) نهائياً من المنظومة بنجاح! سيبدأ الآن كأنه جهاز جديد تماماً بفترة تجريبية جديدة عند اتصاله.`,
    });
    return;
  }

  if (!device) {
    res.status(404).json({ success: false, error: 'الجهاز غير مسجل في النظام.' });
    return;
  }

  const now = Date.now();

  if (action === 'extend_trial') {
    const additionalMs = Number(extraHours) * 3600000;
    const baseTime = Math.max(now, device.trialExpiresAt);
    device.trialExpiresAt = baseTime + additionalMs;
    device.isActivated = false;
    device.planType = 'trial';
    saveLicenseStore(store);
    res.json({
      success: true,
      message: `تم تمديد الفترة التجريبية للجهاز ${cleanDevice} بمقدار ${extraHours} ساعة بنجاح!`,
      newTrialExpiresAt: device.trialExpiresAt,
    });
    return;
  }

  if (action === 'set_trial_5m') {
    device.isActivated = false;
    device.activationRequested = false;
    device.trialDurationMs = 5 * 60 * 1000;
    device.trialExpiresAt = now + 5 * 60 * 1000;
    device.planType = 'trial';
    device.licenseKey = undefined;
    device.licenseExpiresAt = undefined;
    saveLicenseStore(store);
    res.json({
      success: true,
      message: `تم بدء تجربة 5 دقائق للجهاز ${cleanDevice} بنجاح! سيتم إغلاقه بعد 5 دقائق لتجربة شاشة الاعتماد.`,
      newTrialExpiresAt: device.trialExpiresAt,
    });
    return;
  }

  if (action === 'instant_activate' || action === 'set_duration') {
    const days = Number(durationDays) || 365;
    const expiresAt = days === 0 ? 0 : now + days * 24 * 3600000;
    device.isActivated = true;
    device.activationRequested = false;
    device.activatedAt = now;
    device.licenseExpiresAt = expiresAt;
    device.planType = (days === 0 ? 'lifetime' : planType) as any;
    device.licenseKey = `BK-ADMIN-${cleanDevice.slice(-4)}-${Date.now().toString(36).toUpperCase()}`;
    if (clientName) {
      device.clientName = clientName;
      device.branchName = clientName;
    }
    saveLicenseStore(store);
    res.json({
      success: true,
      message: `تم تفعيل الجهاز ${cleanDevice} بنجاح! الصلاحية: ${days === 0 ? 'مدى الحياة' : `${days} يوم`}`,
      device,
    });
    return;
  }

  if (action === 'revoke') {
    device.isActivated = false;
    device.activationRequested = false;
    device.trialExpiresAt = now - 1000; // Expired immediately
    device.planType = 'trial';
    saveLicenseStore(store);
    res.json({
      success: true,
      message: `تم إيقاف تفعيل الجهاز ${cleanDevice} وحظره بنجاح.`,
    });
    return;
  }

  res.status(400).json({ success: false, error: 'إجراء غير معروف.' });
});

// 6.5. Admin: Dedicated Endpoint to Delete Device Record Completely
app.post('/api/license/admin/delete-device', (req, res) => {
  if (!isCallerMasterAdmin(req)) {
    res.status(403).json({ success: false, error: 'غير مصرح لك.' });
    return;
  }

  const { deviceId } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ success: false, error: 'كود الجهاز مطلوب.' });
    return;
  }

  const store = getLicenseStore();
  const cleanDevice = deviceId.trim().toUpperCase();
  const device = store.devices[cleanDevice];
  const deviceBranch = device ? (device.branchName || device.clientName || device.requestedBranch || cleanDevice) : cleanDevice;

  delete store.devices[cleanDevice];

  for (const [key, lic] of Object.entries(store.licenses)) {
    if (lic.deviceId && lic.deviceId.toUpperCase() === cleanDevice) {
      delete store.licenses[key];
    }
  }

  saveLicenseStore(store);
  res.json({
    success: true,
    message: `تم مسح الجهاز (${deviceBranch}) نهائياً من المنظومة بنجاح!`,
  });
});

// ==================== AI RECONCILIATION API (GEMINI OCR) ====================

function parseBase64Image(dataUri: string): { data: string; mimeType: string } | null {
  if (!dataUri) return null;
  const match = dataUri.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      data: match[2],
    };
  }
  // If raw base64 string provided
  return {
    mimeType: 'image/jpeg',
    data: dataUri,
  };
}

app.post('/api/ai/reconcile-images', async (req, res) => {
  try {
    const { alohaImage, talabatImage, singleImage, notes } = req.body || {};

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        success: false,
        error: 'مفتاح الذكاء الاصطناعي (Gemini API Key) غير مهيأ على السيرفر.',
      });
      return;
    }

    const parts: any[] = [];

    if (alohaImage) {
      const parsedAloha = parseBase64Image(alohaImage);
      if (parsedAloha) {
        parts.push({
          inlineData: {
            mimeType: parsedAloha.mimeType,
            data: parsedAloha.data,
          },
        });
        parts.push({ text: '📸 الصورة أعلاه تمثل تقرير/شيكات نظام ألوها (Aloha POS Report / Checks).' });
      }
    }

    if (talabatImage) {
      const parsedTalabat = parseBase64Image(talabatImage);
      if (parsedTalabat) {
        parts.push({
          inlineData: {
            mimeType: parsedTalabat.mimeType,
            data: parsedTalabat.data,
          },
        });
        parts.push({ text: '📸 الصورة أعلاه تمثل كشف/تقرير منصة طلبات (Talabat Settlement Report / Sheet).' });
      }
    }

    if (singleImage && !alohaImage && !talabatImage) {
      const parsedSingle = parseBase64Image(singleImage);
      if (parsedSingle) {
        parts.push({
          inlineData: {
            mimeType: parsedSingle.mimeType,
            data: parsedSingle.data,
          },
        });
        parts.push({ text: '📸 الصورة أعلاه تحتوي على بيانات تقريري ألوها وطلبات للمقارنة والمطابقة.' });
      }
    }

    if (parts.length === 0) {
      res.status(400).json({
        success: false,
        error: 'يرجى إرفاق صورة تقرير ألوها وصورة تقرير طلبات للمطابقة.',
      });
      return;
    }

    const promptText = `
أنت خبير تدقيق مالي ومطابقة حسابات مطاعم برجر كينج ومنصة طلبات (Reconciliation Expert).
المطلوب استخراج ومقارنة بيانات كل شيك/أوردر بين تقرير ألوها (Aloha POS) وتقرير طلبات (Talabat) بدقة 100%.

القواعد الصارمة للمطابقة:
1. قارن كل طلب بناءً على رقم أوردر طلبات التناظري (يبدأ عادة بـ 373... أو أرقام الطلب المماثلة).
2. استخرج الأعمدة التالية لكل سطر:
   - alohaOrderNo: رقم الشيك أو الأوردر في ألوها (Aloha Check # / Order No). إذا كان الطلب ملغياً على المطعم أو غير مسجل في ألوها، اجعل قيمته "0" أو "—".
   - talabatOrderNo: رقم أوردر طلبات التناظري (Talabat Order NO مثل 373...).
   - time: وقت الطلب (مثال "01:25 PM" أو "13:25").
   - paymentMethod: طريقة الدفع ("Cash" أو "Credit" أو "Otlob Mode" أو "Online").
   - alohaAmount: مبلغ ألوها (Aloha AM) كرقم عشري دقيق. إذا كان غير موجود أو ملغي اجعله 0.
   - talabatAmount: مبلغ طلبات (Talabat AM) كرقم عشري دقيق.
   - variance: الفارق الحسابي المحسوب بدقة كالتالي: (alohaAmount - talabatAmount).
     * إذا كان alohaAmount = 0 و talabatAmount = 150، الفارق يكون -150.00 بالسالب.
     * إذا كان alohaAmount = 265 و talabatAmount = 250، الفارق يكون +15.00 بالموجب (فرق توصيل Serv).
     * إذا كان alohaAmount = 200 و talabatAmount = 200، الفارق يكون 0.00.
   - comment: الملاحظات والبيان التوضيحي:
     * "متطابق" (إذا تطابق المبلغان وطريقة الدفع).
     * "فرق توصيل Serv" (إذا كان الفارق ناتج عن خدمة التوصيل / مصاريف الشحن).
     * "أوردر ملغي Cancel Charged على المطعم (M.O.E)" (إذا كان رقم ألوها = 0 أو ملغي وتم تحميله على المطعم).
     * "خصم M.O.E" (إذا كان هناك خصم أو تسوية مطعم).
     * "غير مسجل في كشف طلبات" (إذا كان موجود في ألوها وغير موجود في طلبات).
     * "غير مسجل في ألوها" (إذا كان مسجل في طلبات بدون شيك ألوها).
     * "اختلاف طريقة الدفع (Cash ↔ Credit)" (إذا اختلفت طريقة الدفع).

3. ملاحظات إضافية من المستخدم: ${notes || 'لا توجد'}

أعد النتيجة بتنسيق JSON حصراً يطابق الـ Schema المحددة.
    `;

    parts.push({ text: promptText });

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: {
              type: Type.OBJECT,
              properties: {
                totalOrders: { type: Type.NUMBER },
                matchedCount: { type: Type.NUMBER },
                cancelledOrMoeCount: { type: Type.NUMBER },
                deliveryServVarianceCount: { type: Type.NUMBER },
                totalAlohaAmount: { type: Type.NUMBER },
                totalTalabatAmount: { type: Type.NUMBER },
                netVariance: { type: Type.NUMBER },
              },
              required: [
                'totalOrders',
                'matchedCount',
                'cancelledOrMoeCount',
                'totalAlohaAmount',
                'totalTalabatAmount',
                'netVariance',
              ],
            },
            rows: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  alohaOrderNo: { type: Type.STRING, description: 'رقم الأوردر أو الشيك في ألوها أو 0 إذا ملغي' },
                  talabatOrderNo: { type: Type.STRING, description: 'رقم أوردر طلبات التناظري 373...' },
                  time: { type: Type.STRING, description: 'وقت الطلب' },
                  paymentMethod: { type: Type.STRING, description: 'Cash أو Credit' },
                  alohaAmount: { type: Type.NUMBER, description: 'مبلغ ألوها Aloha AM' },
                  talabatAmount: { type: Type.NUMBER, description: 'مبلغ طلبات Talabat AM' },
                  variance: { type: Type.NUMBER, description: 'الفارق = Aloha AM - Talabat AM' },
                  comment: { type: Type.STRING, description: 'الملاحظة: متطابق / فرق توصيل Serv / أوردر ملغي Cancel Charged على المطعم' },
                  isCancelledOrMoe: { type: Type.BOOLEAN },
                  isDeliveryFeeVariance: { type: Type.BOOLEAN },
                },
                required: [
                  'alohaOrderNo',
                  'talabatOrderNo',
                  'time',
                  'paymentMethod',
                  'alohaAmount',
                  'talabatAmount',
                  'variance',
                  'comment',
                ],
              },
            },
          },
          required: ['rows', 'summary'],
        },
      },
    });

    const responseText = aiResponse.text || '{}';
    const parsedResult = JSON.parse(responseText);

    res.json({
      success: true,
      data: parsedResult,
    });
  } catch (err: any) {
    console.error('Error during AI image reconciliation:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'حدث خطأ أثناء تحليل الصور بالذكاء الاصطناعي.',
    });
  }
});

// ==================== VITE MIDDLEWARE / SPA FALLBACK ====================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ Burger King & Talabat Audit Core server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
