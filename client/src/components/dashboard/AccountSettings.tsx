import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { LogOut } from 'lucide-react';
import { changePasswordSchema } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader, Panel } from './DashboardLayout';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { toast } from '@/stores/ui';

/** Account settings shared by retailer, supplier and admin portals. */
export function AccountSettings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.fullName ?? '');
  const saveName = useMutation({
    mutationFn: () => api.put('/auth/account', { fullName: name }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Name updated' });
      void qc.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not save', description: errorMessage(e) }),
  });
  const pw = useForm<z.infer<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema) });
  const changePw = useMutation({
    mutationFn: (v: z.infer<typeof changePasswordSchema>) => api.post('/auth/change-password', v),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Password changed', description: 'Other devices have been signed out.' });
      pw.reset();
    },
  });
  return (
    <>
      <PageHeader title="Account Settings" />
      <div className="space-y-6">
        <Panel title="Your details">
          <form
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              saveName.mutate();
            }}
          >
            <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} wrapClassName="flex-1" />
            <Input label="Email" value={user?.email ?? ''} disabled wrapClassName="flex-1" hint="Contact support to change your email." />
            <Button type="submit" loading={saveName.isPending} disabled={name.trim().length < 2}>
              Save
            </Button>
          </form>
        </Panel>
        <Panel title="Change password">
          <form className="max-w-md space-y-4" onSubmit={pw.handleSubmit((v) => changePw.mutate(v))} noValidate>
            {changePw.error && <Alert tone="danger">{errorMessage(changePw.error)}</Alert>}
            <Input label="Current password" type="password" autoComplete="current-password" error={pw.formState.errors.currentPassword?.message} {...pw.register('currentPassword')} />
            <Input label="New password" type="password" autoComplete="new-password" hint="8+ characters with a letter and a number" error={pw.formState.errors.newPassword?.message} {...pw.register('newPassword')} />
            <Button type="submit" loading={changePw.isPending}>
              Update password
            </Button>
          </form>
        </Panel>
        <Panel title="Sign out">
          <p className="mb-3 text-sm text-muted">Sign out of Dhaaga Bazaar on this device.</p>
          <Button variant="subtle" icon={<LogOut className="size-4" />} loading={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}>
            Sign out
          </Button>
        </Panel>
      </div>
    </>
  );
}
