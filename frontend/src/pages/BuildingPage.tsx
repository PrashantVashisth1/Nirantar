import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../design-system/Button';
import { EmptyState } from '../design-system/States';
import { CustomerLayout } from '../layouts/CustomerLayout';

/**
 * Temporary stand-in for customer screens that are scheduled later in the
 * build (cart & checkout on Day 4, order tracking on Day 5). Replaced, not
 * shipped.
 */
export function BuildingPage() {
  const { t } = useTranslation();
  return (
    <CustomerLayout>
      <EmptyState
        title={t('common.comingSoon')}
        action={
          <ButtonLink to="/home" variant="secondary" size="lg" fullWidth icon={<ArrowLeft className="size-5" aria-hidden />}>
            {t('common.back')}
          </ButtonLink>
        }
      />
    </CustomerLayout>
  );
}

export function NotFoundPage() {
  return (
    <CustomerLayout>
      <EmptyState
        title="We couldn't find that page."
        action={
          <ButtonLink to="/" variant="secondary" size="lg" fullWidth>
            Go to the start
          </ButtonLink>
        }
      />
    </CustomerLayout>
  );
}
