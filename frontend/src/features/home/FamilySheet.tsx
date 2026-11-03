import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RELATIONS, type PatientDto, type Relation } from '@nirantar/shared';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../design-system/Banner';
import { Button } from '../../design-system/Button';
import { SelectField, TextField } from '../../design-system/Field';
import { RadioCard } from '../../design-system/RadioCard';
import { Sheet } from '../../design-system/Sheet';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';

export const ALL_PATIENTS = 'all';

/** Pick who you're ordering for, or add a family member. */
export function FamilySheet({
  open,
  onOpenChange,
  patients,
  selected,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: PatientDto[];
  selected: string;
  onSelect: (patientId: string) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setAdding(false);
      }}
      title={adding ? t('family.addTitle') : t('family.title')}
    >
      {adding ? (
        <AddPatientForm
          onDone={(patient) => {
            setAdding(false);
            onSelect(patient.id);
            onOpenChange(false);
          }}
        />
      ) : (
        <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('family.title')}>
          <RadioCard
            name="patient"
            value={ALL_PATIENTS}
            checked={selected === ALL_PATIENTS}
            onChange={(value) => {
              onSelect(value);
              onOpenChange(false);
            }}
            title={t('home.everyone')}
          />
          {patients.map((patient) => (
            <RadioCard
              key={patient.id}
              name="patient"
              value={patient.id}
              checked={selected === patient.id}
              onChange={(value) => {
                onSelect(value);
                onOpenChange(false);
              }}
              title={patient.fullName}
              description={[
                t(`relation.${patient.relation}`),
                patient.birthYear ? t('family.age', { age: currentYear - patient.birthYear }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
          <Button variant="secondary" fullWidth className="mt-2" icon={<Plus className="size-5" aria-hidden />} onClick={() => setAdding(true)}>
            {t('family.add')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function AddPatientForm({ onDone }: { onDone: (patient: PatientDto) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [relation, setRelation] = useState<Relation>('PARENT');
  const [birthYear, setBirthYear] = useState('');
  const [nameError, setNameError] = useState<string>();

  const add = useMutation({
    mutationFn: () =>
      api.post<PatientDto>('/patients', {
        fullName: fullName.trim(),
        relation,
        ...(birthYear ? { birthYear: Number(birthYear) } : {}),
      }),
    onSuccess: (patient) => {
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      onDone(patient);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!fullName.trim()) {
      setNameError(t('errors.nameRequired'));
      return;
    }
    setNameError(undefined);
    add.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <TextField label={t('family.nameLabel')} value={fullName} onChange={(e) => setFullName(e.target.value)} error={nameError} autoFocus />
      <SelectField
        label={t('family.relationLabel')}
        value={relation}
        onChange={(e) => setRelation(e.target.value as Relation)}
        options={RELATIONS.filter((r) => r !== 'SELF').map((r) => ({ value: r, label: t(`relation.${r}`) }))}
      />
      <TextField
        label={t('family.birthYearLabel')}
        inputMode="numeric"
        maxLength={4}
        value={birthYear}
        onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
      {add.error && <Banner tone="danger" title={errorMessage(add.error, t)} />}
      <Button type="submit" size="xl" fullWidth loading={add.isPending}>
        {t('family.save')}
      </Button>
    </form>
  );
}
