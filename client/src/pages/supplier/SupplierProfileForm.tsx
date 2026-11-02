import { useForm, Controller } from 'react-hook-form';
import type { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { INDIAN_STATES, supplierProfileSchema, type SupplierProfileInput } from '@dhaaga/shared';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { api, errorMessage } from '@/lib/api';
import { useCategories } from '@/lib/categories';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';

export interface SupplierRecord {
  id: string;
  businessName: string;
  businessType: 'WHOLESALER' | 'MANUFACTURER' | 'DISTRIBUTOR';
  contactName: string;
  phone: string;
  whatsapp: string | null;
  gstin: string | null;
  yearEstablished: number | null;
  description: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  categoryPaths: string[];
  minOrderValuePaise: number | null;
  status: 'INCOMPLETE' | 'PENDING_REVIEW' | 'INFO_REQUESTED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  isVerified: boolean;
  rejectionReason: string | null;
  infoRequest: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  documents: { id: string; type: string; fileName: string; status: string; reviewNote: string | null; uploadedAt: string; sizeBytes: number }[];
}

export function SupplierProfileForm({ supplier, onSaved }: { supplier: SupplierRecord; onSaved?: () => void }) {
  const qc = useQueryClient();
  const cats = useCategories();
  const form = useForm<z.input<typeof supplierProfileSchema>, unknown, SupplierProfileInput>({
    resolver: zodResolver(supplierProfileSchema),
    defaultValues: {
      businessName: supplier.businessName,
      businessType: supplier.businessType,
      contactName: supplier.contactName,
      phone: supplier.phone,
      whatsapp: supplier.whatsapp ?? '',
      gstin: supplier.gstin ?? '',
      yearEstablished: supplier.yearEstablished ?? undefined,
      description: supplier.description ?? '',
      addressLine: supplier.addressLine ?? '',
      city: supplier.city ?? '',
      state: (supplier.state ?? undefined) as SupplierProfileInput['state'],
      pincode: supplier.pincode ?? '',
      categoryPaths: supplier.categoryPaths,
      minOrderValue: supplier.minOrderValuePaise ? supplier.minOrderValuePaise / 100 : undefined,
    },
  });
  const save = useMutation({
    mutationFn: (v: SupplierProfileInput) => api.put('/supplier/profile', v),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Business details saved' });
      void qc.invalidateQueries({ queryKey: ['supplier'] });
      onSaved?.();
    },
  });
  const e = form.formState.errors;
  return (
    <form className="space-y-5" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
      {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Registered business name" required error={e.businessName?.message} {...form.register('businessName')} />
        <Select label="Business type" required {...form.register('businessType')}>
          <option value="MANUFACTURER">Manufacturer</option>
          <option value="WHOLESALER">Wholesaler</option>
          <option value="DISTRIBUTOR">Distributor</option>
        </Select>
        <Input label="Contact person" required error={e.contactName?.message} {...form.register('contactName')} />
        <Input label="Business phone" type="tel" required error={e.phone?.message} {...form.register('phone')} />
        <Input label="WhatsApp number (optional)" type="tel" hint="Shared with retailers only after you confirm their order" error={e.whatsapp?.message} {...form.register('whatsapp')} />
        <Input label="GSTIN (if registered)" error={e.gstin?.message} {...form.register('gstin')} />
        <Input label="Year established" inputMode="numeric" error={e.yearEstablished?.message} {...form.register('yearEstablished')} />
        <Input label="Minimum order value (₹, optional)" inputMode="numeric" error={e.minOrderValue?.message} {...form.register('minOrderValue')} />
        <Input label="Business address" required wrapClassName="sm:col-span-2" error={e.addressLine?.message} {...form.register('addressLine')} />
        <Input label="City" required error={e.city?.message} {...form.register('city')} />
        <Select label="State" required error={e.state?.message} {...form.register('state')}>
          <option value="">Select state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Input label="PIN code" inputMode="numeric" required error={e.pincode?.message} {...form.register('pincode')} />
      </div>
      <Textarea label="About your business" hint="What you make or stock, specialities, production capacity." error={e.description?.message} {...form.register('description')} />
      <Controller
        control={form.control}
        name="categoryPaths"
        render={({ field }) => (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              Categories you supply<span className="text-copper-500">*</span>
            </legend>
            <div className="space-y-3">
              {cats.roots.map((r) => (
                <div key={r.path}>
                  <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{r.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {cats.children(r.path).map((c) => {
                      const on = field.value?.includes(c.path);
                      return (
                        <button
                          type="button"
                          key={c.path}
                          aria-pressed={on}
                          onClick={() => field.onChange(on ? field.value.filter((p) => p !== c.path) : [...(field.value ?? []), c.path])}
                          className={cn('rounded-full border px-3 py-1 text-xs font-medium', on ? 'border-copper-500 bg-copper-500 text-white' : 'border-line-strong bg-white hover:border-copper-400')}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {e.categoryPaths && <p className="mt-1.5 text-[0.8125rem] text-danger">{e.categoryPaths.message}</p>}
          </fieldset>
        )}
      />
      <Button type="submit" loading={save.isPending}>
        Save business details
      </Button>
    </form>
  );
}
