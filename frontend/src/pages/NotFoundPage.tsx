import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../design-system/Button';
import { EmptyState } from '../design-system/States';
import { CustomerLayout } from '../layouts/CustomerLayout';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <CustomerLayout>
      <EmptyState
        title={t('common.notFoundTitle')}
        action={
          <ButtonLink to="/" variant="secondary" size="lg" fullWidth>
            {t('common.notFoundAction')}
          </ButtonLink>
        }
      />
    </CustomerLayout>
  );
}
