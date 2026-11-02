import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { INDIAN_STATES, addressSchema, type AddressInput } from '@dhaaga/shared';
import { Input, Select, Checkbox } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { api, errorMessage } from '@/lib/api';
import type { Address } from '@/lib/types';

export function AddressForm({ address, onDone, onCancel }: { address?: Address; onDone: (a: Address) => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const form = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: address
      ? { ...address, line2: address.line2 ?? '', state: address.state as AddressInput['state'] }
      : { label: 'Shop', state: 'Karnataka', city: 'Bengaluru' },
  });
  const save = useMutation({
    mutationFn: (v: AddressInput) =>
      address ? api.put<{ address: Address }>(`/retailer/addresses/${address.id}`, v) : api.post<{ address: Address }>('/retailer/addresses', v),
    onSuccess: ({ address: a }) => {
      void qc.invalidateQueries({ queryKey: ['retailer', 'profile'] });
      onDone(a);
    },
  });
  const e = form.formState.errors;
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Address label" placeholder="Shop, Warehouse…" required error={e.label?.message} {...form.register('label')} />
        <Input label="Contact person" required error={e.contactName?.message} {...form.register('contactName')} />
        <Input label="Contact phone" type="tel" required error={e.phone?.message} {...form.register('phone')} />
        <Input label="PIN code" inputMode="numeric" required error={e.pincode?.message} {...form.register('pincode')} />
        <Input label="Address line 1" required wrapClassName="sm:col-span-2" error={e.line1?.message} {...form.register('line1')} />
        <Input label="Address line 2" wrapClassName="sm:col-span-2" error={e.line2?.message} {...form.register('line2')} />
        <Input label="City" required error={e.city?.message} {...form.register('city')} />
        <Select label="State" required error={e.state?.message} {...form.register('state')}>
          {INDIAN_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      <Checkbox label="Use as default delivery address" {...form.register('isDefault')} />
      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending}>
          {address ? 'Save address' : 'Add address'}
        </Button>
        {onCancel && (
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
