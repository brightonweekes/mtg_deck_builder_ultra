import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  validateEmail,
  validateHandle,
  validatePassword,
} from '../cloud/validation.js';
import type { CloudUser } from '../types/cloud.js';

export type AuthMode = 'signin' | 'signup' | 'reset';

export interface AuthModalProps {
  open: boolean;
  isConfigured: boolean;
  currentUser: CloudUser | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onClearError: () => void;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onSignUpWithEmail: (email: string, password: string, handle: string) => Promise<void>;
  onSignInWithGoogle: () => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<void>;
  onResendVerification: () => Promise<void>;
  onRefreshVerification: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

const RESEND_COOLDOWN_SECONDS = 60;

const STRENGTH_META: Readonly<
  Record<0 | 1 | 2 | 3, { label: string; textClass: string; bars: number; barClass: string }>
> = {
  0: { label: 'Too weak', textClass: 'text-rose-300', bars: 1, barClass: 'bg-rose-500' },
  1: { label: 'Fair', textClass: 'text-amber-300', bars: 1, barClass: 'bg-amber-400' },
  2: { label: 'Good', textClass: 'text-sky-300', bars: 2, barClass: 'bg-sky-400' },
  3: { label: 'Strong', textClass: 'text-emerald-300', bars: 3, barClass: 'bg-emerald-400' },
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/**
 * Cloud sign-in, account creation, password reset, and email-verification dialog.
 */
export function AuthModal({
  open,
  isConfigured,
  currentUser,
  loading,
  error,
  onClose,
  onClearError,
  onSignInWithEmail,
  onSignUpWithEmail,
  onSignInWithGoogle,
  onSendPasswordReset,
  onResendVerification,
  onRefreshVerification,
  onSignOut,
}: AuthModalProps) {
  const titleId = useId();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [handleInput, setHandleInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationSentNotice, setVerificationSentNotice] = useState(false);

  const onClearErrorRef = useRef(onClearError);
  onClearErrorRef.current = onClearError;
  const prevOpenRef = useRef(open);
  const clearedForCloseRef = useRef(false);

  const handleClose = () => {
    clearedForCloseRef.current = true;
    onClearErrorRef.current();
    onClose();
  };

  useEffect(() => {
    setPasswordInput('');
    setConfirmPasswordInput('');
    setShowPassword(false);
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open) {
      clearedForCloseRef.current = false;
      setLocalError(null);
      setResetSentTo(null);
      setVerificationSentNotice(false);
      if (!wasOpen) {
        onClearErrorRef.current();
      }
    } else if (wasOpen) {
      setLocalError(null);
      setResetSentTo(null);
      setVerificationSentNotice(false);
      if (!clearedForCloseRef.current) {
        onClearErrorRef.current();
      }
      clearedForCloseRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearedForCloseRef.current = true;
        onClearErrorRef.current();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  if (!open) return null;

  const isVerifyView = Boolean(isConfigured && currentUser && !currentUser.emailVerified);
  const handleCheck = validateHandle(handleInput);
  const emailCheck = validateEmail(emailInput);
  const passwordCheck = validatePassword(passwordInput);
  const passwordsMatch = passwordInput === confirmPasswordInput;
  const strengthMeta = STRENGTH_META[passwordCheck.score];
  const activeError = localError || error;

  const clearFeedback = () => {
    if (localError) setLocalError(null);
    if (error) onClearError();
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
    setResetSentTo(null);
    if (error) onClearError();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!emailCheck.valid) {
      setLocalError(emailCheck.error ?? 'Please enter a valid email address.');
      return;
    }

    if (mode === 'reset') {
      try {
        await onSendPasswordReset(emailCheck.normalized);
        setResetSentTo(emailCheck.normalized);
      } catch {
        // Error surfaced via parent `error` prop
      }
      return;
    }

    if (mode === 'signin') {
      if (!passwordInput) {
        setLocalError('Please enter your password.');
        return;
      }
      try {
        await onSignInWithEmail(emailCheck.normalized, passwordInput);
      } catch {
        // Error surfaced via parent `error` prop
      }
      return;
    }

    if (!handleCheck.valid) {
      setLocalError(handleCheck.error ?? 'Please choose a valid handle.');
      return;
    }

    if (!passwordCheck.valid) {
      setLocalError(passwordCheck.error ?? 'Please choose a stronger password.');
      return;
    }

    if (!passwordsMatch) {
      setLocalError('Passwords do not match.');
      return;
    }

    try {
      await onSignUpWithEmail(emailCheck.normalized, passwordInput, handleCheck.normalized);
    } catch {
      // Error surfaced via parent `error` prop
    }
  };

  const handleGoogleClick = async () => {
    clearFeedback();
    try {
      await onSignInWithGoogle();
    } catch {
      // Error surfaced via parent `error` prop
    }
  };

  const handleResendClick = async () => {
    if (resendCooldown > 0 || loading) return;
    clearFeedback();
    setVerificationSentNotice(false);
    try {
      await onResendVerification();
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setVerificationSentNotice(true);
    } catch {
      // Error surfaced via parent `error` prop
    }
  };

  const handleRefreshClick = async () => {
    clearFeedback();
    try {
      await onRefreshVerification();
    } catch {
      // Error surfaced via parent `error` prop
    }
  };

  const handleSignOutClick = async () => {
    clearFeedback();
    try {
      await onSignOut();
    } catch {
      // Error surfaced via parent `error` prop
    }
  };

  const headingText = !isConfigured
    ? 'Cloud Sync Not Configured'
    : isVerifyView
      ? 'Verify Your Email'
      : mode === 'signup'
        ? 'Create Cloud Account'
        : mode === 'reset'
          ? 'Reset Password'
          : 'Sign In to Cloud Sync';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
              {!isConfigured ? (
                <CloudOff className="h-4 w-4" />
              ) : isVerifyView ? (
                <Mail className="h-4 w-4" />
              ) : mode === 'signup' ? (
                <UserPlus className="h-4 w-4" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
            </div>
            <h2 id={titleId} className="text-sm font-bold text-slate-100">
              {headingText}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close authentication modal"
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {!isConfigured ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-slate-200">
                <p className="font-semibold text-amber-200">
                  Cloud accounts aren&apos;t enabled in this build yet.
                </p>
                <p className="mt-1.5 leading-relaxed text-slate-300">
                  The Firebase environment variables (
                  <code className="rounded bg-slate-950 px-1 py-0.5 font-mono text-[11px] text-amber-200">
                    VITE_FIREBASE_*
                  </code>
                  ) are not set for this deployment.
                </p>
                <p className="mt-2 leading-relaxed text-slate-300">
                  If you host this app, follow{' '}
                  <code className="rounded bg-slate-950 px-1 py-0.5 font-mono text-[11px] text-sky-300">
                    CLOUD_SETUP.md
                  </code>{' '}
                  to connect a free Firebase project in a few minutes.
                </p>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-emerald-200">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <p className="leading-relaxed">
                    <strong>Offline mode works 100%:</strong> your decks, commanders, and shared
                    URL links are saved safely right here in your browser.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl bg-amber-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-amber-400"
              >
                Continue Offline
              </button>
            </div>
          ) : isVerifyView ? (
            <div className="space-y-4">
              {activeError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span className="flex-1">{activeError}</span>
                </div>
              )}

              {verificationSentNotice && !activeError && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>Verification email sent! Check your inbox and spam folder.</span>
                </div>
              )}

              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                <p className="text-slate-300">
                  We sent a verification link to{' '}
                  <span className="font-semibold text-slate-100">
                    {currentUser?.email ?? 'your email address'}
                  </span>
                  .
                </p>
                <p className="mt-2 leading-relaxed text-slate-400">
                  Click the link in your email to protect your account and unlock cloud deck sync
                  and friend sharing.
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleRefreshClick()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Checking Status...' : "I've Verified My Email"}
                </button>

                <button
                  type="button"
                  disabled={loading || resendCooldown > 0}
                  onClick={() => void handleResendClick()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-semibold text-slate-200 transition hover:border-sky-400/60 disabled:opacity-50"
                >
                  <Mail className="h-3.5 w-3.5 text-sky-400" />
                  {resendCooldown > 0
                    ? `Resend Email (${resendCooldown}s)`
                    : 'Resend Email'}
                </button>
              </div>

              <div className="border-t border-slate-800 pt-3 text-center">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSignOutClick()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-200 disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out or Use a Different Email
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {mode !== 'reset' && (
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className={`rounded-lg py-1.5 font-semibold transition ${
                      mode === 'signin'
                        ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className={`rounded-lg py-1.5 font-semibold transition ${
                      mode === 'signup'
                        ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              )}

              {activeError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span className="flex-1 leading-relaxed">{activeError}</span>
                </div>
              )}

              {mode === 'reset' && resetSentTo && !activeError && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="leading-relaxed">
                    Password reset email sent to <strong>{resetSentTo}</strong>. Check your inbox
                    to choose a new password.
                  </span>
                </div>
              )}

              {mode !== 'reset' && (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleGoogleClick()}
                    className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-semibold text-slate-100 transition hover:border-sky-400/60 hover:bg-slate-950/90 disabled:opacity-50"
                  >
                    <GoogleMark />
                    Continue with Google
                  </button>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="h-px flex-1 bg-slate-800" />
                    <span>or with email</span>
                    <span className="h-px flex-1 bg-slate-800" />
                  </div>
                </>
              )}

              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5" noValidate>
                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-handle"
                      className="mb-1 block font-semibold text-slate-200"
                    >
                      Public Handle
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-400">
                        @
                      </span>
                      <input
                        id="auth-handle"
                        type="text"
                        autoComplete="username"
                        value={handleInput}
                        onChange={(e) => {
                          setHandleInput(e.target.value);
                          clearFeedback();
                        }}
                        placeholder="urza_builder"
                        aria-invalid={handleInput.length > 0 && !handleCheck.valid}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-7 pr-3 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                      />
                    </div>
                    {handleInput.length > 0 ? (
                      handleCheck.valid ? (
                        <p className="mt-1 text-[11px] text-emerald-300">
                          Available format: @{handleCheck.normalized}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-rose-300">{handleCheck.error}</p>
                      )
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-400">
                        3–24 characters (letters, numbers, _ or -). Your email is never shown.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="mb-1 block font-semibold text-slate-200"
                  >
                    Email Address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      clearFeedback();
                    }}
                    placeholder="you@example.com"
                    aria-invalid={emailInput.length > 0 && !emailCheck.valid}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                  />
                  {emailInput.length > 0 && !emailCheck.valid && (
                    <p className="mt-1 text-[11px] text-rose-300">{emailCheck.error}</p>
                  )}
                </div>

                {mode !== 'reset' && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label htmlFor="auth-password" className="font-semibold text-slate-200">
                        Password
                      </label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => switchMode('reset')}
                          className="text-[11px] font-medium text-sky-300 hover:text-sky-200"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          clearFeedback();
                        }}
                        placeholder={
                          mode === 'signup' ? 'At least 8 characters' : 'Enter your password'
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-3 pr-9 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    {mode === 'signup' && passwordInput.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="grid grid-cols-3 gap-1">
                          {[1, 2, 3].map((step) => (
                            <div
                              key={step}
                              className={`h-1 rounded-full transition ${
                                step <= strengthMeta.bars
                                  ? strengthMeta.barClass
                                  : 'bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>
                        <p className={`text-[11px] ${strengthMeta.textClass}`}>
                          {passwordCheck.valid
                            ? `Password strength: ${strengthMeta.label}`
                            : passwordCheck.error}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-confirm-password"
                      className="mb-1 block font-semibold text-slate-200"
                    >
                      Confirm Password
                    </label>
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPasswordInput}
                      onChange={(e) => {
                        setConfirmPasswordInput(e.target.value);
                        clearFeedback();
                      }}
                      placeholder="Re-enter your password"
                      aria-invalid={confirmPasswordInput.length > 0 && !passwordsMatch}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                    />
                    {confirmPasswordInput.length > 0 && !passwordsMatch && (
                      <p className="mt-1 text-[11px] text-rose-300">Passwords do not match.</p>
                    )}
                  </div>
                )}

                {mode === 'signup' && (
                  <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-[11px] leading-relaxed text-sky-200">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                      <span>
                        We&apos;ll send a quick email verification link to keep your account and
                        cloud decks protected before syncing.
                      </span>
                    </div>
                  </div>
                )}

                {mode === 'reset' && (
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Enter your account email and we&apos;ll send you a link to set a new password.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-amber-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {loading
                    ? 'Please wait...'
                    : mode === 'signup'
                      ? 'Create Account'
                      : mode === 'reset'
                        ? 'Send Reset Link'
                        : 'Sign In'}
                </button>

                {mode === 'reset' && (
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 font-semibold text-slate-300 transition hover:text-white"
                  >
                    Back to Sign In
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
