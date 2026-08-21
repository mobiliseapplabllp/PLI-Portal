import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowLeft, HiOutlineArrowRight, HiOutlineMail, HiOutlineShieldCheck,
  HiOutlineChartSquareBar, HiOutlineBriefcase, HiOutlineChatAlt2, HiOutlineCalendar,
} from 'react-icons/hi';
import LakshyaLogo from '../../components/common/LakshyaLogo';
import { requestOtp, verifyOtp, clearError } from '../../store/authSlice';

const OTP_LENGTH = 6;

const MODULES = [
  { icon: HiOutlineChartSquareBar, label: 'KPI & PLI Appraisals', hint: 'Monthly commitments to quarterly payouts' },
  { icon: HiOutlineBriefcase, label: 'Project Management', hint: 'Milestones, tasks and daily status' },
  { icon: HiOutlineChatAlt2, label: 'Client Surveys', hint: 'CSAT dispatches and insights' },
  { icon: HiOutlineCalendar, label: 'Saturday Roster', hint: 'Alternate-Saturday planning' },
];

/** Six auto-advancing digit boxes with paste + backspace handling. */
function OtpInput({ value, onChange, onComplete, disabled }) {
  const refs = useRef([]);

  const setDigit = (index, digit) => {
    const next = [...value];
    next[index] = digit;
    onChange(next);
    return next;
  };

  const handleChange = (index, raw) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    const next = setDigit(index, digit);
    if (index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
    if (next.every((d) => d)) onComplete?.(next.join(''));
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[index]) {
        setDigit(index, '');
      } else if (index > 0) {
        setDigit(index - 1, '');
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!digits) return;
    e.preventDefault();
    const next = Array.from({ length: OTP_LENGTH }, (_, i) => digits[i] || '');
    onChange(next);
    refs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
    if (digits.length === OTP_LENGTH) onComplete?.(digits);
  };

  return (
    <div className="flex justify-between gap-1.5 sm:gap-2" onPaste={handlePaste}>
      {Array.from({ length: OTP_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${i + 1}`}
          className="w-full h-12 sm:h-14 min-w-0 text-center text-lg sm:text-xl font-semibold rounded-xl
                     border border-slate-200 bg-white text-slate-900
                     focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                     outline-none transition disabled:bg-slate-100 disabled:text-slate-400"
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, loading, error } = useSelector((state) => state.auth);

  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const identifierRef = useRef(null);

  // HomeRedirect resolves the right dashboard for every role
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => () => dispatch(clearError()), [dispatch]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === 1) identifierRef.current?.focus();
  }, [step]);

  const resetErrors = useCallback(() => {
    setLocalError('');
    dispatch(clearError());
  }, [dispatch]);

  const sendCode = useCallback(async (id) => {
    setSending(true);
    resetErrors();
    const result = await dispatch(requestOtp(id));
    setSending(false);
    if (result.meta.requestStatus === 'fulfilled') {
      setNotice(`A ${OTP_LENGTH}-digit code was sent to the email registered for ${id}.`);
      setCooldown(result.payload?.resendAfterSeconds || 60);
      setOtp(Array(OTP_LENGTH).fill(''));
      return true;
    }
    setLocalError(result.payload || 'Could not send the code');
    return false;
  }, [dispatch, resetErrors]);

  const handleContinue = async (e) => {
    e.preventDefault();
    const id = identifier.trim();
    if (!id) {
      setLocalError('Enter your email or employee ID');
      return;
    }
    const ok = await sendCode(id);
    if (ok) setStep(2);
  };

  const handleVerify = (code) => {
    const value = code || otp.join('');
    if (value.length !== OTP_LENGTH) {
      setLocalError(`Enter the ${OTP_LENGTH}-digit code`);
      return;
    }
    resetErrors();
    dispatch(verifyOtp({ identifier: identifier.trim(), code: value }));
  };

  const goBack = () => {
    resetErrors();
    setNotice('');
    setStep(1);
    setOtp(Array(OTP_LENGTH).fill(''));
  };

  const message = localError || error;

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* ── Brand panel — half the screen on lg+, compact banner on mobile ── */}
      <aside className="hidden lg:flex lg:w-1/2 relative overflow-hidden
                        bg-gradient-to-br from-slate-900 via-primary-900 to-primary-800 text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative flex flex-col justify-between p-12 xl:p-16 w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <LakshyaLogo className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">Lakshya Portal</p>
              <p className="text-[11px] tracking-[0.18em] text-white/50 uppercase">Mobilise App Lab</p>
            </div>
          </div>

          <div className="py-10">
            <p className="text-[11px] tracking-[0.22em] text-primary-300 uppercase mb-4">
              Go digital by default
            </p>
            <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
              Performance,<br />projects and people.
            </h1>
            <p className="mt-4 text-white/60 max-w-md">
              One workspace for appraisals, delivery tracking, client feedback and Saturday rostering.
            </p>

            <ul className="mt-10 space-y-4">
              {MODULES.map(({ icon: Icon, label, hint }) => (
                <li key={label} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary-200" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-white/40">{hint}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} Mobilise App Lab Limited · Internal use only
          </p>
        </div>
      </aside>

      {/* ── Form panel ────────────────────────────────────────────────────── */}
      <main className="flex-1 lg:w-1/2 flex flex-col">
        {/* Mobile brand banner — stands in for the brand panel below lg */}
        <div className="lg:hidden bg-gradient-to-br from-slate-900 to-primary-800 text-white px-6 pt-10 pb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center shrink-0">
              <LakshyaLogo className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">Lakshya Portal</p>
              <p className="text-[10px] tracking-[0.18em] text-white/50 uppercase">Mobilise App Lab</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-white/60">
            Appraisals, projects, client surveys and Saturday rostering — in one place.
          </p>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/70 p-6 sm:p-8">
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                <span className={`h-1.5 rounded-full transition-all ${step === 1 ? 'w-8 bg-primary-600' : 'w-4 bg-primary-200'}`} />
                <span className={`h-1.5 rounded-full transition-all ${step === 2 ? 'w-8 bg-primary-600' : 'w-4 bg-slate-200'}`} />
                <span className="ml-auto text-xs text-slate-400">Step {step} of 2</span>
              </div>

              {step === 1 ? (
                <>
                  <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
                  <p className="text-sm text-slate-500 mt-1 mb-6">
                    We’ll email you a one-time code — no password needed.
                  </p>

                  <form onSubmit={handleContinue} className="space-y-4">
                    <div>
                      <label className="label-text" htmlFor="identifier">Email or Employee ID</label>
                      <input
                        id="identifier"
                        ref={identifierRef}
                        type="text"
                        value={identifier}
                        onChange={(e) => { setIdentifier(e.target.value); setLocalError(''); }}
                        className="input-field"
                        placeholder="you@mobilise.co.in or MLP001"
                        autoComplete="username"
                        maxLength={255}
                      />
                    </div>

                    {message && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg" role="alert">
                        {message}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={sending}
                      className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                    >
                      {sending ? 'Sending code…' : <>Send sign-in code <HiOutlineArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={goBack}
                    className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-4"
                  >
                    <HiOutlineArrowLeft className="w-4 h-4" /> Use a different account
                  </button>

                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                      <HiOutlineMail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-slate-900 leading-tight">Check your email</h2>
                      <p className="text-sm text-slate-500 truncate">Code sent for {identifier}</p>
                    </div>
                  </div>

                  {notice && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg mb-4">
                      {notice}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="label-text">Enter the {OTP_LENGTH}-digit code</label>
                      <OtpInput
                        value={otp}
                        onChange={(next) => { setOtp(next); setLocalError(''); }}
                        onComplete={handleVerify}
                        disabled={loading || sending}
                      />
                      <p className="text-xs text-slate-400 mt-2">
                        The code expires in 10 minutes and can be used once.
                      </p>
                    </div>

                    {message && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg" role="alert">
                        {message}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleVerify()}
                      disabled={loading || sending || otp.some((d) => !d)}
                      className="btn-primary w-full py-3"
                    >
                      {loading ? 'Verifying…' : 'Verify & Sign In'}
                    </button>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">
                        {sending ? 'Sending code…' : 'Didn’t get the code?'}
                      </span>
                      <button
                        type="button"
                        disabled={cooldown > 0 || sending}
                        onClick={() => sendCode(identifier.trim())}
                        className="text-primary-600 hover:underline disabled:text-slate-300 disabled:no-underline"
                      >
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <p className="text-xs text-slate-400 text-center mt-6 flex items-center justify-center gap-1.5">
              <HiOutlineShieldCheck className="w-4 h-4 shrink-0" />
              Internal use only. Contact your administrator for access.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
