import { useEffect } from 'react';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFoundPage({ title = 'Page not found', message = "We couldn't find the page you were looking for." }: { title?: string; message?: string }) {
  useEffect(() => {
    document.title = `${title} · Dhaaga Bazaar`;
  }, [title]);
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={<Compass className="size-7" />}
        title={title}
        description={message}
        actions={
          <>
            <ButtonLink to="/">Go to homepage</ButtonLink>
            <ButtonLink to="/categories" variant="subtle">
              Browse categories
            </ButtonLink>
          </>
        }
      />
    </div>
  );
}
