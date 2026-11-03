import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RELATIONS, type Locale, type MeDto, type PatientDto, type Relation } from '@nirantar/shared';
import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { Banner } from '../../design-system/Banner';
import { Button } from '../../design-system/Button';
import { Checkbox, SelectField, TextField } from '../../design-system/Field';
import { RadioCard } from '../../design-system/RadioCard';
import { LANGUAGE_OPTIONS, setLocale } from '../../i18n';
import { CustomerLayout } from '../../layouts/CustomerLayout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { meQueryKey, useMe } from '../../lib/session';

/**
 * First sign-in only: name, language, consent to store prescriptions (DPDP;
 * required) and reminders (optional, unticked by default), and who the
 * customer usually orders for.
 */
export function OnboardingPage() {
  const { data: me } = useMe();
  if (!me) return <Navigate to="/signin" replace />;
  if (!me.needsOnboarding) return <Navigate to="/home" replace />;
  return <OnboardingForm me={me} />;
}

function OnboardingForm({ me }: { me: MeDto }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState(me.name);
  const [locale, setLocaleState] = useState<Locale>((i18n.language as Locale) ?? 'en');
  const [consent, setConsent] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [orderFor, setOrderFor] = useState<'self' | 'family'>('self');
  const [familyName, setFamilyName] = useState('');
  const [familyRelation, setFamilyRelation] = useState<Relation>('PARENT');
  const [familyBirthYear, setFamilyBirthYear] = useState('');
  const [errors, setErrors] = useState<{ name?: string; consent?: string; familyName?: string }>({});

  const save = useMutation({
    mutationFn: async () => {
      const updated = await api.patch<MeDto>('/me', {
        name: name.trim(),
        locale,
        consentToStorePrescriptions: true,
        remindersOptIn: reminders,
      });
      // Make sure the customer's own profile exists, then add the family member if given.
      const patients = await api.get<PatientDto[]>('/patients');
      if (!patients.some((p) => p.relation === 'SELF')) {
        await api.post('/patients', { fullName: name.trim(), relation: 'SELF' });
      }
      if (orderFor === 'family') {
        await api.post('/patients', {
          fullName: familyName.trim(),
          relation: familyRelation,
          ...(familyBirthYear ? { birthYear: Number(familyBirthYear) } : {}),
        });
      }
      return updated;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(meQueryKey, updated);
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      navigate('/home', { replace: true });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = t('errors.nameRequired');
    if (!consent) next.consent = t('onboarding.consentRequired');
    if (orderFor === 'family' && !familyName.trim()) next.familyName = t('errors.nameRequired');
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  const relationOptions = RELATIONS.filter((r) => r !== 'SELF').map((r) => ({ value: r, label: t(`relation.${r}`) }));
  const currentYear = new Date().getFullYear();

  return (
    <CustomerLayout>
      <form onSubmit={submit} noValidate className="mx-auto max-w-[440px]">
        <h1 className="font-serif text-title font-semibold text-ink">{t('onboarding.title')}</h1>
        <p className="mt-2 text-body-lg text-ink-2">{t('onboarding.subtitle')}</p>

        <div className="mt-8 flex flex-col gap-5">
          <TextField
            label={t('onboarding.nameLabel')}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
          />

          <fieldset>
            <legend className="mb-2 text-body font-medium text-ink">{t('onboarding.languageLabel')}</legend>
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGE_OPTIONS.map((option) => (
                <div key={option.locale} lang={option.locale}>
                  <RadioCard
                    name="locale"
                    value={option.locale}
                    checked={locale === option.locale}
                    onChange={(value) => {
                      setLocaleState(value as Locale);
                      setLocale(value as Locale);
                    }}
                    title={option.label}
                    compact
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </div>

        <section className="mt-8 rounded-md bg-surface p-5 shadow-raised">
          <div className="flex items-center gap-2 text-pine">
            <ShieldCheck className="size-5" aria-hidden />
            <h2 className="text-heading font-semibold text-ink">{t('onboarding.consentTitle')}</h2>
          </div>
          <p className="mt-2 text-body text-ink-2">{t('onboarding.consentBody')}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Checkbox
              label={t('onboarding.consentCheckbox')}
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              error={errors.consent}
            />
            <Checkbox
              label={t('onboarding.remindersCheckbox')}
              checked={reminders}
              onChange={(event) => setReminders(event.target.checked)}
            />
          </div>
        </section>

        <fieldset className="mt-8">
          <legend className="mb-3 text-heading font-semibold text-ink">{t('onboarding.whoTitle')}</legend>
          <div className="flex flex-col gap-3">
            <RadioCard name="orderFor" value="self" checked={orderFor === 'self'} onChange={() => setOrderFor('self')} title={t('onboarding.forMyself')} />
            <RadioCard name="orderFor" value="family" checked={orderFor === 'family'} onChange={() => setOrderFor('family')} title={t('onboarding.forFamily')} />
          </div>
          {orderFor === 'family' && (
            <div className="mt-5 flex flex-col gap-5 border-l-2 border-pine-line pl-4">
              <TextField
                label={t('onboarding.familyName')}
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                error={errors.familyName}
              />
              <SelectField
                label={t('onboarding.familyRelation')}
                value={familyRelation}
                onChange={(event) => setFamilyRelation(event.target.value as Relation)}
                options={relationOptions}
              />
              <TextField
                label={t('onboarding.birthYear')}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder={String(currentYear - 70)}
                value={familyBirthYear}
                onChange={(event) => setFamilyBirthYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>
          )}
        </fieldset>

        {save.error && <Banner tone="danger" className="mt-6" title={errorMessage(save.error, t)} />}

        <Button type="submit" size="xl" fullWidth className="mt-8" loading={save.isPending}>
          {save.isPending ? t('onboarding.saving') : t('onboarding.finish')}
        </Button>
      </form>
    </CustomerLayout>
  );
}
