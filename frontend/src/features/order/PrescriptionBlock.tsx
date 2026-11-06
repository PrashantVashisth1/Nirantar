import { useQuery } from '@tanstack/react-query';
import type { PrescriptionDto } from '@nirantar/shared';
import { Camera, CheckCircle2, ImageUp } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../design-system/Banner';
import { Button } from '../../design-system/Button';
import { Sheet } from '../../design-system/Sheet';
import { Spinner } from '../../design-system/Spinner';
import { api } from '../../lib/api';
import { useAppConfig } from '../../lib/config';
import { errorMessage } from '../../lib/errors';
import { sampleFile, uploadPrescription } from '../../lib/upload';

/** Synthetic samples, one for each thing the AI can do with a photo. */
const SAMPLES = [
  { key: 'typed', file: 'rx-typed' },
  { key: 'handwritten', file: 'rx-handwritten' },
  { key: 'blurry', file: 'rx-blurry' },
  { key: 'notRx', file: 'not-a-prescription' },
] as const;

export interface OnFile {
  id: string;
  label: string;
}

/**
 * The prescription part of C3: on file (reorder), or take/choose a photo,
 * then watch the AI read it. Every outcome has its own message and next step.
 */
export function PrescriptionBlock({
  patientId,
  onFile,
  prescription,
  onUploaded,
  onRead,
  onClear,
  autoSample,
}: {
  patientId: string | null;
  onFile: OnFile | null;
  prescription: PrescriptionDto | null;
  onUploaded: (p: PrescriptionDto) => void;
  onRead: (p: PrescriptionDto) => void;
  onClear: () => void;
  autoSample: boolean;
}) {
  const { t } = useTranslation();
  const { data: config } = useAppConfig();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const sampleTried = useRef(false);

  const reading = prescription?.aiStatus === 'READING';
  const poll = useQuery({
    queryKey: ['prescription', prescription?.id],
    queryFn: () => api.get<PrescriptionDto>(`/prescriptions/${prescription!.id}`),
    enabled: Boolean(prescription && reading),
    refetchInterval: 1500,
  });

  useEffect(() => {
    if (poll.data && poll.data.aiStatus !== 'READING') onRead(poll.data);
  }, [poll.data, onRead]);

  useEffect(() => {
    if (!reading || !startedAt) return;
    const timer = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(timer);
  }, [reading, startedAt]);

  async function send(file: Blob) {
    if (!patientId) return;
    setError(undefined);
    setUploading(true);
    setSlow(false);
    try {
      const result = await uploadPrescription(file, patientId);
      setStartedAt(Date.now());
      onUploaded(result);
      if (result.aiStatus !== 'READING') onRead(result);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (autoSample && patientId && !sampleTried.current && !prescription && !onFile) {
      sampleTried.current = true;
      void sampleFile().then(send);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSample, patientId]);

  function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again still counts as a change.
    event.target.value = '';
    if (file) void send(file);
  }

  const pickers = (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={onPicked}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onPicked}
      />
    </>
  );

  if (onFile && !prescription) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <p className="text-body text-ink">{onFile.label}</p>
      </div>
    );
  }

  if (uploading || reading) {
    return (
      <div className="rounded-md border border-line bg-surface p-4" role="status">
        <div className="flex items-center gap-3">
          <Spinner className="text-pine" />
          <p className="text-body-lg font-medium text-ink">
            {uploading ? t('order.uploading') : t('order.reading')}
          </p>
        </div>
        {!uploading && (
          <p className="mt-2 text-body text-ink-2">
            {slow ? t('order.readingSlow') : t('order.readingNote')}
          </p>
        )}
        {slow && prescription && (
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-4"
            onClick={() => onRead({ ...prescription, aiStatus: 'FAILED' })}
          >
            {t('order.continueAnyway')}
          </Button>
        )}
      </div>
    );
  }

  if (prescription) {
    const status = prescription.aiStatus;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-ink">{t('order.uploaded')}</p>
            <button
              type="button"
              className="mt-1 text-body text-pine hover:underline"
              onClick={onClear}
            >
              {t('order.replace')}
            </button>
          </div>
        </div>
        {status === 'FAILED' && <Banner tone="info">{t('order.aiFailed')}</Banner>}
        {status === 'UNREADABLE' && (
          <Banner
            tone="warning"
            title={
              prescription.draft?.isPrescription === false
                ? t('order.notPrescription')
                : t('order.unreadable')
            }
          >
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                size="lg"
                // The current photo stays until a new one is chosen. Clearing first would
                // unmount this input while the file chooser is open, and the file would be lost.
                onClick={() => camera.current?.click()}
              >
                {t('order.retake')}
              </Button>
            </div>
            <p className="mt-2 text-caption text-ink-2">{t('order.sendAnywayNote')}</p>
          </Banner>
        )}
        {error && <Banner tone="danger" title={error} />}
        {pickers}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-ink-2">{t('order.noneYet')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          size="lg"
          icon={<Camera className="size-5" aria-hidden />}
          disabled={!patientId}
          onClick={() => camera.current?.click()}
        >
          {t('order.takePhoto')}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          icon={<ImageUp className="size-5" aria-hidden />}
          disabled={!patientId}
          onClick={() => gallery.current?.click()}
        >
          {t('order.chooseGallery')}
        </Button>
      </div>
      <details className="text-body text-ink-2">
        <summary className="cursor-pointer py-1 text-pine">{t('order.photoTips')}</summary>
        <p className="mt-1">{t('order.photoTipsBody')}</p>
      </details>
      {config?.testMode && (
        <div className="rounded-md bg-warning-bg p-3 text-caption text-warning">
          {t('order.sampleWarning')}{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setSamplesOpen(true)}
          >
            {t('order.useSample')}
          </button>
        </div>
      )}
      {error && <Banner tone="danger" title={error} />}
      {pickers}
      <Sheet open={samplesOpen} onOpenChange={setSamplesOpen} title={t('order.useSample')}>
        <div className="flex flex-col gap-2">
          {SAMPLES.map((sample) => (
            <Button
              key={sample.file}
              variant="secondary"
              fullWidth
              onClick={() => {
                setSamplesOpen(false);
                void sampleFile(sample.file).then(send);
              }}
            >
              {t(`order.sample.${sample.key}`)}
            </Button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
