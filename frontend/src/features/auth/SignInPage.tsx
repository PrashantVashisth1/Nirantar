import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  normalizeIndianMobile,
  maskPhone,
  type MeDto,
  type OtpRequestResult,
} from '@nirantar/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { Banner } from '../../design-system/Banner';
import { Button } from '../../design-system/Button';
import { TextField } from '../../design-system/Field';
import { Skeleton } from '../../design-system/States';
import { CustomerLayout } from '../../layouts/CustomerLayout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { homePathFor, meQueryKey, useMe } from '../../lib/session';
import { DemoPanel } from './DemoPanel';

/** C1: customers sign in with a phone OTP; staff use email + password on the same screen. */
export function SignInPage() {
  const { data: me, isLoading } = useMe();
  const [mode, setMode] = useState<'customer' | 'staff'>('customer');
  const { t } = useTranslation();
  const onSignedIn = useSignedIn();

  if (isLoading) {
    return (
      <CustomerLayout>
        <Skeleton className="mt-8 h-10 w-3/4" />
        <Skeleton className="mt-8 h-14 w-full" />
      </CustomerLayout>
    );
  }
  if (me) return <Navigate to={homePathFor(me)} replace />;

  return (
    <CustomerLayout>
      <div className="mx-auto max-w-[440px] pt-6 sm:pt-12">
        {mode === 'customer' ? <CustomerSignIn /> : <StaffSignIn />}
        <div className="mt-10 border-t border-line pt-5 text-center">
          <button
            type="button"
            className="h-11 px-3 text-body font-medium text-pine hover:underline"
            onClick={() => setMode(mode === 'customer' ? 'staff' : 'customer')}
          >
            {mode === 'customer' ? t('signIn.staffLink') : t('signIn.customerLink')}
          </button>
        </div>
        <DemoPanel onSignedIn={onSignedIn} />
      </div>
    </CustomerLayout>
  );
}

function useSignedIn() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return (user: MeDto) => {
    queryClient.setQueryData(meQueryKey, user);
    navigate(homePathFor(user), { replace: true });
  };
}

function CustomerSignIn() {
  const { t } = useTranslation();
  const onSignedIn = useSignedIn();
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string>();
  const [sent, setSent] = useState<(OtpRequestResult & { phone: string }) | null>(null);
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  const requestCode = useMutation({
    mutationFn: (normalized: string) =>
      api.post<OtpRequestResult>('/auth/otp/request', { phone: normalized }),
    onSuccess: (result, normalized) => {
      setSent({ ...result, phone: normalized });
      setSecondsLeft(result.resendAfterSeconds);
      setCode('');
    },
  });

  const verify = useMutation({
    mutationFn: (input: { phone: string; code: string }) =>
      api.post<{ user: MeDto; isNew: boolean }>('/auth/otp/verify', input),
    onSuccess: ({ user }) => onSignedIn(user),
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function submitPhone(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeIndianMobile(phone);
    if (!normalized) {
      setPhoneError(t('errors.invalidPhone'));
      return;
    }
    setPhoneError(undefined);
    requestCode.mutate(normalized);
  }

  function submitCode(value: string) {
    if (!sent || !/^\d{6}$/.test(value) || verify.isPending) return;
    verify.mutate({ phone: sent.phone, code: value });
  }

  if (!sent) {
    return (
      <form onSubmit={submitPhone} noValidate>
        <h1 className="font-serif text-title font-semibold text-ink">{t('signIn.title')}</h1>
        <div className="mt-8">
          <TextField
            label={t('signIn.phoneLabel')}
            hint={t('signIn.phoneHint')}
            error={
              phoneError ?? (requestCode.error ? errorMessage(requestCode.error, t) : undefined)
            }
            prefix="+91"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={14}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoFocus
          />
        </div>
        <Button type="submit" size="xl" fullWidth className="mt-6" loading={requestCode.isPending}>
          {requestCode.isPending ? t('signIn.sending') : t('signIn.sendCode')}
        </Button>
        <p className="mt-6 text-center text-caption text-ink-3">{t('common.pharmacistFooter')}</p>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitCode(code);
      }}
      noValidate
    >
      <h1 className="font-serif text-title font-semibold text-ink">{t('signIn.codeTitle')}</h1>
      <p className="mt-2 text-body-lg text-ink-2">
        {t('signIn.codeSentTo', { phone: maskPhone(sent.phone) })}
      </p>

      {sent.demoCode && (
        <Banner tone="warning" className="mt-6" title={`${t('signIn.demoCode')} ${sent.demoCode}`}>
          <span className="text-caption text-ink-2">{t('signIn.demoCodeNote')}</span>
        </Banner>
      )}

      <div className="mt-6">
        <TextField
          label={t('signIn.codeLabel')}
          error={verify.error ? errorMessage(verify.error, t) : undefined}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          className="tracking-[0.4em] tabular-nums"
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(digits);
            if (digits.length === 6) submitCode(digits);
          }}
          autoFocus
        />
      </div>
      <Button
        type="submit"
        size="xl"
        fullWidth
        className="mt-6"
        loading={verify.isPending}
        disabled={code.length !== 6}
      >
        {verify.isPending ? t('signIn.verifying') : t('signIn.verify')}
      </Button>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          className="h-11 px-1 text-body text-pine hover:underline"
          onClick={() => setSent(null)}
        >
          {t('signIn.changeNumber')}
        </button>
        {secondsLeft > 0 ? (
          <span className="text-body text-ink-3 tabular-nums">
            {t('signIn.resendIn', { seconds: secondsLeft })}
          </span>
        ) : (
          <button
            type="button"
            className="h-11 px-1 text-body font-medium text-pine hover:underline disabled:text-ink-disabled"
            disabled={requestCode.isPending}
            onClick={() => requestCode.mutate(sent.phone)}
          >
            {t('signIn.resend')}
          </button>
        )}
      </div>
      {requestCode.error && (
        <p className="mt-2 text-caption text-danger">{errorMessage(requestCode.error, t)}</p>
      )}
    </form>
  );
}

function StaffSignIn() {
  const { t } = useTranslation();
  const onSignedIn = useSignedIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => api.post<{ user: MeDto }>('/auth/staff/login', { email, password }),
    onSuccess: ({ user }) => onSignedIn(user),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        login.mutate();
      }}
    >
      <h1 className="font-serif text-title font-semibold text-ink">{t('signIn.staffTitle')}</h1>
      <p className="mt-2 text-body-lg text-ink-2">{t('signIn.staffSubtitle')}</p>
      <div className="mt-8 flex flex-col gap-5">
        <TextField
          label={t('signIn.emailLabel')}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
        <TextField
          label={t('signIn.passwordLabel')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      {login.error && (
        <Banner tone="danger" className="mt-5" title={errorMessage(login.error, t)} />
      )}
      <Button
        type="submit"
        size="xl"
        fullWidth
        className="mt-6"
        loading={login.isPending}
        disabled={!email || !password}
      >
        {login.isPending ? t('signIn.signingIn') : t('signIn.signInButton')}
      </Button>
    </form>
  );
}
