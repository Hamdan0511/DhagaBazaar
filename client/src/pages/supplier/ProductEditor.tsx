import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { FILTER_SETS, GENERAL_PRODUCT_FIELDS, PRICE_UNITS, formatINR, priceTierProblem, productSchema, type FilterSetKey } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import { useCategories } from '@/lib/categories';
import { PageHeader, Panel } from '@/components/dashboard/DashboardLayout';
import { Alert, ErrorState, PageLoader, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';
import { useAuth } from '@/hooks/useAuth';
import { ProductPhotos } from './ProductPhotos';

type FormValues = z.input<typeof productSchema>;

interface SupplierProduct {
  id: string;
  title: string;
  description: string;
  pricePaise: number;
  priceUnit: 'PIECE' | 'SET' | 'METRE' | 'PAIR';
  piecesPerSet: number | null;
  moq: number;
  orderStep: number;
  leadTimeDays: number | null;
  stockQuantity: number | null;
  attributes: Record<string, string[]>;
  priceTiers: { minQty: number; pricePaise: number }[];
  status: string;
  availability: string;
  rejectionReason: string | null;
  category: { path: string; name: string; filterSet: string };
  variants: { id: string; size: string | null; colour: string | null; sku: string | null; pricePaise: number | null; stockQuantity: number | null; isAvailable: boolean }[];
  images: { id: string; url: string; usageRights: string; attribution: string | null; status: string; width: number | null; height: number | null }[];
}

export function ProductEditor({ supplierApproved, supplierName }: { supplierApproved: boolean; supplierName?: string }) {
  const { user } = useAuth();
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cats = useCategories();
  const q = useQuery({ queryKey: ['supplier', 'product', id], queryFn: () => api.get<{ product: SupplierProduct }>(`/supplier/products/${id}`), enabled: !isNew });
  const product = q.data?.product;

  const form = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { priceUnit: 'PIECE', orderStep: 1, attributes: {}, variants: [], priceTiers: [] },
  });
  const variants = useFieldArray({ control: form.control, name: 'variants' });
  const tiers = useFieldArray({ control: form.control, name: 'priceTiers' });
  const [rootPath, setRootPath] = useState('');
  const [subPath, setSubPath] = useState('');
  const [sizeInput, setSizeInput] = useState('');
  const [colourInput, setColourInput] = useState('');
  const split = (v: string) => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))];
  /** Builds one option per size × colour, skipping combinations that already exist. */
  const generateOptions = () => {
    const sizes = split(sizeInput);
    const colours = split(colourInput);
    const combos = (sizes.length ? sizes : ['']).flatMap((sz) => (colours.length ? colours : ['']).map((c) => ({ size: sz, colour: c })));
    const existing = new Set(form.getValues('variants')?.map((v) => `${v.size ?? ''}|${v.colour ?? ''}`));
    const fresh = combos.filter((c) => (c.size || c.colour) && !existing.has(`${c.size}|${c.colour}`));
    fresh.forEach((c) => variants.append({ size: c.size, colour: c.colour, sku: '', isAvailable: true }));
    if (fresh.length) {
      form.setValue('stockQuantity', undefined);
      setSizeInput('');
      setColourInput('');
    }
  };
  useEffect(() => {
    if (!product) return;
    form.reset({
      title: product.title,
      description: product.description,
      categoryPath: product.category.path,
      price: product.pricePaise / 100,
      priceUnit: product.priceUnit,
      piecesPerSet: product.piecesPerSet ?? undefined,
      moq: product.moq,
      orderStep: product.orderStep,
      leadTimeDays: product.leadTimeDays ?? undefined,
      stockQuantity: product.stockQuantity ?? undefined,
      attributes: product.attributes,
      priceTiers: (product.priceTiers ?? []).map((t) => ({ minQty: t.minQty, price: t.pricePaise / 100 })),
      variants: product.variants.map((v) => ({ id: v.id, size: v.size ?? '', colour: v.colour ?? '', sku: v.sku ?? '', price: v.pricePaise ? v.pricePaise / 100 : undefined, stockQuantity: v.stockQuantity ?? undefined, isAvailable: v.isAvailable })),
    });
    // Category may be a subcategory (depth 1) or a type within one (depth 2).
    const trail = product.category.path.split('/');
    setRootPath(trail[0]);
    setSubPath(trail.length > 1 ? trail.slice(0, 2).join('/') : '');
  }, [product, form]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryPath = form.watch('categoryPath');
  const priceUnit = form.watch('priceUnit');
  const filterSet = cats.get(categoryPath ?? '')?.filterSet as FilterSetKey | undefined;
  const defs = filterSet ? FILTER_SETS[filterSet].filter((d) => d.key !== 'size' && d.key !== 'colour') : [];
  // Basic details the category's own filters don't already cover.
  const generalFields = GENERAL_PRODUCT_FIELDS.filter((f) => !defs.some((d) => d.key === f.key));
  const typeOptions = subPath ? cats.children(subPath) : [];
  const basePrice = Number(form.watch('price')) || 0;
  const moqValue = Number(form.watch('moq')) || 0;

  const save = useMutation({
    mutationFn: (v: FormValues) => (isNew ? api.post<{ product: SupplierProduct }>('/supplier/products', v) : api.put<{ product: SupplierProduct }>(`/supplier/products/${id}`, v)),
    onSuccess: ({ product: p }) => {
      toast({ tone: 'success', title: isNew ? 'Draft created' : 'Listing saved', description: isNew ? 'Now add photos, then submit for review.' : undefined });
      void qc.invalidateQueries({ queryKey: ['supplier'] });
      if (isNew) navigate(`/supplier/products/${p.id}`, { replace: true });
    },
  });
  const submit = useMutation({
    mutationFn: () => api.post(`/supplier/products/${id}/submit`),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Submitted for review', description: 'We will notify you when it is published.' });
      void qc.invalidateQueries({ queryKey: ['supplier'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not submit', description: errorMessage(e) }),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/supplier/products/${id}`),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Draft deleted' });
      void qc.invalidateQueries({ queryKey: ['supplier'] });
      navigate('/supplier/products', { replace: true });
    },
    onError: (err) => toast({ tone: 'error', title: 'Could not delete', description: errorMessage(err) }),
  });
  const archive = useMutation({
    mutationFn: () => api.post(`/supplier/products/${id}/archive`),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Listing archived', description: 'It is no longer visible to retailers. Order history is kept.' });
      void qc.invalidateQueries({ queryKey: ['supplier'] });
    },
  });
  const availability = useMutation({
    mutationFn: (a: string) => api.patch(`/supplier/products/${id}/availability`, { availability: a }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier'] }),
  });

  if (!isNew && q.isLoading) return <PageLoader />;
  if (!isNew && q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const e = form.formState.errors;

  return (
    <>
      <PageHeader
        title={isNew ? 'New product listing' : product!.title}
        description={!isNew && <span className="inline-flex items-center gap-2">Status <StatusBadge status={product!.status} /></span>}
        actions={
          !isNew && ['DRAFT', 'REJECTED'].includes(product!.status) && (
            <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!supplierApproved}>
              Submit for review
            </Button>
          )
        }
      />
      {product?.rejectionReason && product.status === 'REJECTED' && (
        <Alert tone="danger" className="mb-5" title="Changes requested by our review team">{product.rejectionReason}</Alert>
      )}
      {product?.status === 'APPROVED' && <Alert tone="info" className="mb-5">This listing is live. Editing details or photos sends it back for review.</Alert>}
      <div className="space-y-6">
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit(
            (v) => {
              const t = [...((v.priceTiers ?? []) as { minQty: number; price: number }[])].sort((a, b) => a.minQty - b.minQty);
              const problem = priceTierProblem(t, Number(v.price), Number(v.moq));
              if (problem) {
                toast({ tone: 'error', title: 'Check the price tiers', description: problem });
                return;
              }
              save.mutate(v);
            },
            (errs) => {
              const fields = Object.entries(errs).map(([k, v]) => `${k}: ${(v as { message?: string })?.message ?? 'invalid'}`);
              toast({ tone: 'error', title: 'Please check the highlighted fields', description: fields.join(' · ') });
            },
          )}
          noValidate
        >
          {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
          <Panel title="Basic details">
            <div className="grid gap-4">
              <Input label="Product name" required placeholder="e.g. Soft Silk Saree with Zari Border – Assorted Colours" error={e.title?.message} {...form.register('title')} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Main category"
                  required
                  value={rootPath}
                  onChange={(ev) => {
                    setRootPath(ev.target.value);
                    setSubPath('');
                    form.setValue('categoryPath', '', { shouldValidate: false });
                  }}
                >
                  <option value="">Choose a category</option>
                  {cats.roots.map((r) => (
                    <option key={r.path} value={r.path}>{r.name}</option>
                  ))}
                </Select>
                <Select
                  label="Subcategory"
                  required
                  disabled={!rootPath}
                  error={e.categoryPath?.message}
                  value={subPath}
                  onChange={(ev) => {
                    setSubPath(ev.target.value);
                    form.setValue('categoryPath', ev.target.value, { shouldValidate: !!ev.target.value });
                  }}
                >
                  <option value="">{rootPath ? 'Choose a subcategory' : 'Choose a category first'}</option>
                  {cats.children(rootPath).map((c) => (
                    <option key={c.path} value={c.path}>{c.name}</option>
                  ))}
                </Select>
                {typeOptions.length > 0 && (
                  <Select
                    label="Type (optional)"
                    hint="Pick the closest match so retailers find it in the right place."
                    value={categoryPath && categoryPath !== subPath ? categoryPath : ''}
                    onChange={(ev) => form.setValue('categoryPath', ev.target.value || subPath, { shouldValidate: true })}
                    wrapClassName="sm:col-span-2"
                  >
                    <option value="">Any {cats.get(subPath)?.name ?? ''}</option>
                    {typeOptions.map((c) => (
                      <option key={c.path} value={c.path}>{c.name}</option>
                    ))}
                  </Select>
                )}
              </div>
              {generalFields.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {generalFields.map((f) =>
                    'options' in f ? (
                      <Controller
                        key={f.key}
                        control={form.control}
                        name={`attributes.${f.key}` as const}
                        render={({ field }) => (
                          <Select label={f.label} value={(Array.isArray(field.value) ? field.value[0] : field.value) ?? ''} onChange={(ev) => field.onChange(ev.target.value ? [ev.target.value] : [])}>
                            <option value="">Not specified</option>
                            {f.options.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </Select>
                        )}
                      />
                    ) : (
                      <Controller
                        key={f.key}
                        control={form.control}
                        name={`attributes.${f.key}` as const}
                        render={({ field }) => (
                          <Input label={f.label} placeholder={f.placeholder} maxLength={60} value={(Array.isArray(field.value) ? field.value[0] : field.value) ?? ''} onChange={(ev) => field.onChange(ev.target.value ? [ev.target.value] : [])} />
                        )}
                      />
                    ),
                  )}
                </div>
              )}
              <Textarea label="Product description" required hint="Fabric, work, care, packing (e.g. 1 piece per polybag), what's included." error={e.description?.message} {...form.register('description')} />
            </div>
          </Panel>
          <Panel title="Wholesale pricing & MOQ">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Wholesale price (₹)" required inputMode="decimal" error={e.price?.message} {...form.register('price')} />
              <Select label="Priced" {...form.register('priceUnit')}>
                {PRICE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </Select>
              {priceUnit === 'SET' ? <Input label="Pieces per set" inputMode="numeric" error={e.piecesPerSet?.message} {...form.register('piecesPerSet')} /> : <div className="hidden sm:block" />}
              <Input label="Minimum order quantity (MOQ)" required inputMode="numeric" hint="Applies to the total across sizes & colours" error={e.moq?.message} {...form.register('moq')} />
              <Input label="Order in multiples of" inputMode="numeric" hint="1 = any quantity above MOQ" error={e.orderStep?.message} {...form.register('orderStep')} />
              <Input label="Dispatch time (days)" inputMode="numeric" error={e.leadTimeDays?.message} {...form.register('leadTimeDays')} />
              {variants.fields.length === 0 ? (
                <Input label="Available quantity (units)" inputMode="numeric" hint="Leave empty if made to order / not tracked" error={e.stockQuantity?.message} {...form.register('stockQuantity')} />
              ) : (
                <p className="text-sm text-muted sm:col-span-2 sm:self-end">Stock is set per size/colour option below.</p>
              )}
            </div>
          </Panel>
          <Panel
            title="Volume pricing (optional)"
            actions={
              tiers.fields.length < 5 && (
                <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={() => tiers.append({ minQty: undefined as unknown as number, price: undefined as unknown as number })}>
                  Add price tier
                </Button>
              )
            }
          >
            {tiers.fields.length === 0 ? (
              <p className="text-sm text-muted">Offer a lower price for bigger orders, e.g. ₹450 per piece from 50 pieces. Tiers apply to the total quantity across sizes and colours, and are charged at checkout.</p>
            ) : (
              <div className="space-y-3">
                {tiers.fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                    <Input label={i === 0 ? 'From quantity' : undefined} aria-label={`Tier ${i + 1} minimum quantity`} inputMode="numeric" placeholder={moqValue ? `More than ${moqValue}` : 'e.g. 50'} {...form.register(`priceTiers.${i}.minQty`)} />
                    <Input label={i === 0 ? 'Price per unit (₹)' : undefined} aria-label={`Tier ${i + 1} price`} inputMode="decimal" placeholder={basePrice ? `Less than ${basePrice}` : 'e.g. 450'} {...form.register(`priceTiers.${i}.price`)} />
                    <button type="button" onClick={() => tiers.remove(i)} className="mb-1 rounded p-2 text-muted hover:text-danger" aria-label={`Remove tier ${i + 1}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-muted">Each tier needs a higher quantity and a lower price than the one before{basePrice ? ` (base price ${formatINR(Math.round(basePrice * 100))})` : ''}.</p>
              </div>
            )}
          </Panel>
          {defs.length > 0 && (
            <Panel title="Product attributes">
              <p className="mb-4 text-sm text-muted">These power the category filters retailers use. Choose all that apply.</p>
              <div className="space-y-4">
                {defs.map((d) => (
                  <Controller
                    key={d.key}
                    control={form.control}
                    name={`attributes.${d.key}` as const}
                    render={({ field }) => {
                      const val = (Array.isArray(field.value) ? field.value : field.value ? [field.value] : []) as string[];
                      return (
                        <fieldset>
                          <legend className="mb-1.5 text-sm font-medium">{d.label}</legend>
                          <div className="flex flex-wrap gap-1.5">
                            {d.options.map((o) => {
                              const on = val.includes(o);
                              return (
                                <button type="button" key={o} aria-pressed={on} onClick={() => field.onChange(on ? val.filter((x) => x !== o) : [...val, o])} className={cn('rounded-full border px-3 py-1 text-xs font-medium', on ? 'border-copper-500 bg-copper-500 text-white' : 'border-line-strong bg-white hover:border-copper-400')}>
                                  {o}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      );
                    }}
                  />
                ))}
              </div>
            </Panel>
          )}
          <Panel title="Sizes & colours" actions={<Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={() => variants.append({ size: '', colour: '', sku: '', isAvailable: true })}>Add option</Button>}>
            <div className="mb-4 grid gap-3 rounded-lg bg-brand-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Input label="Available sizes" placeholder="e.g. S, M, L, XL" value={sizeInput} onChange={(ev) => setSizeInput(ev.target.value)} hint="Comma separated" />
              <Input label="Available colours" placeholder="e.g. Maroon, Navy" value={colourInput} onChange={(ev) => setColourInput(ev.target.value)} hint="Comma separated" />
              <Button variant="subtle" onClick={generateOptions} disabled={!sizeInput.trim() && !colourInput.trim()}>
                Add combinations
              </Button>
            </div>
            {variants.fields.length === 0 ? (
              <p className="text-sm text-muted">No options — the listing is sold as a single item. Add sizes/colours if buyers should choose them.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="pb-2 font-medium">Size</th>
                      <th className="pb-2 font-medium">Colour</th>
                      <th className="pb-2 font-medium">SKU</th>
                      <th className="pb-2 font-medium">Price override (₹)</th>
                      <th className="pb-2 font-medium">Stock</th>
                      <th className="pb-2 font-medium">Available</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {variants.fields.map((f, i) => (
                      <tr key={f.id}>
                        {(['size', 'colour', 'sku'] as const).map((k) => (
                          <td key={k} className="pr-2 pb-2">
                            <input className="h-9 w-full rounded-md border border-line-strong px-2" aria-label={k} {...form.register(`variants.${i}.${k}`)} />
                          </td>
                        ))}
                        <td className="pr-2 pb-2">
                          <input className="h-9 w-full rounded-md border border-line-strong px-2" inputMode="decimal" aria-label="Price override" {...form.register(`variants.${i}.price`, { setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)) })} />
                        </td>
                        <td className="pr-2 pb-2">
                          <input className="h-9 w-full rounded-md border border-line-strong px-2" inputMode="numeric" placeholder="Not tracked" aria-label="Stock" {...form.register(`variants.${i}.stockQuantity`, { setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)) })} />
                        </td>
                        <td className="pr-2 pb-2 text-center">
                          <input type="checkbox" className="size-4 accent-copper-500" aria-label="Available" {...form.register(`variants.${i}.isAvailable`)} />
                        </td>
                        <td className="pb-2">
                          <button type="button" onClick={() => variants.remove(i)} className="rounded p-1.5 text-muted hover:text-danger" aria-label="Remove option">
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Business information">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Supplier</dt>
                <dd className="font-medium">{supplierName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Supplier account</dt>
                <dd className="break-all">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Listing status</dt>
                <dd>{isNew ? <StatusBadge status="DRAFT" label="New draft" /> : <StatusBadge status={product!.status} />}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">Listings always belong to your own supplier account. They go live only after our team approves them.</p>
          </Panel>
          {isNew && <Alert tone="info">Create the draft first — you can then take or upload photos and submit it for review.</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={save.isPending}>{isNew ? 'Create draft' : 'Save changes'}</Button>
            <Link to="/supplier/products" className="inline-flex h-11 items-center px-3 text-sm text-muted hover:text-charcoal">Cancel</Link>
          </div>
        </form>
        {!isNew && product && (
          <>
            <ProductPhotos productId={product.id} photos={product.images} canSubmit={supplierApproved} />
            <Panel title="Listing actions">
              <div className="flex flex-wrap gap-2">
                {['DRAFT', 'REJECTED'].includes(product.status) && (
                  <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                    Delete draft
                  </Button>
                )}
                {product.status !== 'ARCHIVED' && (
                  <Button size="sm" variant="subtle" loading={archive.isPending} onClick={() => archive.mutate()}>
                    Archive listing
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">Drafts that were never ordered can be deleted. Published listings are archived so order history stays intact.</p>
            </Panel>
            <Panel title="Stock status">
              <div className="flex flex-wrap gap-2">
                {['AVAILABLE', 'MADE_TO_ORDER', 'OUT_OF_STOCK'].map((a) => (
                  <Button key={a} size="sm" variant={product.availability === a ? 'primary' : 'subtle'} onClick={() => availability.mutate(a)}>
                    {a === 'AVAILABLE' ? 'Available' : a === 'MADE_TO_ORDER' ? 'Made to order' : 'Out of stock'}
                  </Button>
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
