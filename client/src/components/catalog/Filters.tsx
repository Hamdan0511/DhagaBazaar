import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Info, X } from 'lucide-react';
import { FILTER_SETS, MOQ_RANGES, ORDER_QUANTITY_PRESETS, formatINR, type FilterSetKey } from '@dhaaga/shared';
import type { Facets } from '@/lib/types';
import { Checkbox } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import type { ListingParams } from './useListingParams';

function Group({ title, children, defaultOpen = true, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-4 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-semibold text-charcoal" aria-expanded={open}>
        <span className="flex items-center gap-2">
          {title}
          {!!badge && <span className="rounded-full bg-copper-500 px-1.5 text-[0.6875rem] text-white">{badge}</span>}
        </span>
        <ChevronDown className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function OptionList({ options, selected, counts, onToggle, disabled }: { options: readonly string[]; selected: string[]; counts: Record<string, number>; onToggle: (v: string) => void; disabled: boolean }) {
  const [showAll, setShowAll] = useState(false);
  // With live data, show options that have results (or are selected) first.
  const sorted = disabled ? [...options] : [...options].filter((o) => (counts[o] ?? 0) > 0 || selected.includes(o));
  const hidden = disabled ? [] : options.filter((o) => !sorted.includes(o));
  const visible = showAll ? sorted : sorted.slice(0, 6);
  return (
    <div className="space-y-2">
      {visible.map((o) => (
        <Checkbox
          key={o}
          disabled={disabled}
          checked={selected.includes(o)}
          onChange={() => onToggle(o)}
          label={
            <span className="flex w-full justify-between gap-2">
              <span>{o}</span>
              {!disabled && <span className="text-xs text-muted tabular-nums">{counts[o] ?? 0}</span>}
            </span>
          }
          className="w-full [&>span]:flex-1"
        />
      ))}
      {sorted.length > 6 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="text-[0.8125rem] font-medium text-copper-600 hover:underline">
          {showAll ? 'Show less' : `Show ${sorted.length - 6} more`}
        </button>
      )}
      {!disabled && sorted.length === 0 && <p className="text-xs text-muted">No listings carry this attribute yet.</p>}
      {!disabled && hidden.length > 0 && sorted.length > 0 && <p className="text-[0.6875rem] text-muted">{hidden.length} other options have no current listings.</p>}
    </div>
  );
}

function RangeInputs({ minKey, maxKey, lp, disabled, prefix, placeholderMin, placeholderMax }: { minKey: string; maxKey: string; lp: ListingParams; disabled: boolean; prefix?: string; placeholderMin: string; placeholderMax: string }) {
  const [min, setMin] = useState(lp.params.get(minKey) ?? '');
  const [max, setMax] = useState(lp.params.get(maxKey) ?? '');
  useEffect(() => {
    setMin(lp.params.get(minKey) ?? '');
    setMax(lp.params.get(maxKey) ?? '');
  }, [lp.params, minKey, maxKey]);
  const apply = () =>
    lp.update((p) => {
      const clean = (v: string) => v.replace(/\D/g, '');
      clean(min) ? p.set(minKey, clean(min)) : p.delete(minKey);
      clean(max) ? p.set(maxKey, clean(max)) : p.delete(maxKey);
    });
  const input = 'h-9 w-full rounded-md border border-line-strong bg-white px-2.5 text-sm focus:border-copper-500 focus:outline-none disabled:bg-brand-50';
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label className="relative flex-1">
        <span className="sr-only">Minimum</span>
        {prefix && <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted">{prefix}</span>}
        <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} disabled={disabled} placeholder={placeholderMin} className={cn(input, prefix && 'pl-6')} />
      </label>
      <span className="text-muted">–</span>
      <label className="relative flex-1">
        <span className="sr-only">Maximum</span>
        {prefix && <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted">{prefix}</span>}
        <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} disabled={disabled} placeholder={placeholderMax} className={cn(input, prefix && 'pl-6')} />
      </label>
      <button type="submit" disabled={disabled} className="h-9 shrink-0 rounded-md bg-brand-900 px-3 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-40">
        Go
      </button>
    </form>
  );
}

function OrderQuantity({ lp, disabled }: { lp: ListingParams; disabled: boolean }) {
  const current = lp.params.get('qty');
  const [custom, setCustom] = useState(current && !ORDER_QUANTITY_PRESETS.includes(Number(current) as never) ? current : '');
  return (
    <div>
      <p className="mb-2.5 text-xs leading-relaxed text-muted">How many pieces do you want? We&apos;ll show listings whose MOQ allows that quantity.</p>
      <div className="flex flex-wrap gap-1.5">
        {ORDER_QUANTITY_PRESETS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => lp.set('qty', current === String(q) ? null : String(q))}
            aria-pressed={current === String(q)}
            className={cn(
              'rounded-full border px-3 py-1 text-[0.8125rem] font-medium transition-colors disabled:opacity-45',
              current === String(q) ? 'border-copper-500 bg-copper-500 text-white' : 'border-line-strong bg-white text-charcoal hover:border-copper-400',
            )}
          >
            {q} pcs
          </button>
        ))}
      </div>
      <form
        className="mt-2.5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = custom.replace(/\D/g, '');
          lp.set('qty', v && Number(v) > 0 ? v : null);
        }}
      >
        <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} disabled={disabled} placeholder="Custom quantity" className="h-9 w-full rounded-md border border-line-strong bg-white px-2.5 text-sm focus:border-copper-500 focus:outline-none disabled:bg-brand-50" aria-label="Custom order quantity" />
        <button type="submit" disabled={disabled} className="h-9 shrink-0 rounded-md bg-brand-900 px-3 text-xs font-semibold text-white disabled:opacity-40">
          Apply
        </button>
      </form>
    </div>
  );
}

export function FilterPanel({ filterSet, facets, lp }: { filterSet: FilterSetKey | null; facets: Facets | undefined; lp: ListingParams }) {
  const hasData = (facets?.scopeTotal ?? 0) > 0;
  const disabled = !hasData;
  const defs = filterSet ? FILTER_SETS[filterSet] : [];
  const cities = Object.keys(facets?.cities ?? {}).sort();
  const units = Object.keys(facets?.priceUnits ?? {});
  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <h2 className="font-serif text-lg font-semibold text-brand-900 max-lg:sr-only">Filters</h2>
        {lp.activeCount > 0 && (
          <button onClick={lp.clearAll} className="text-[0.8125rem] font-medium text-copper-600 hover:underline">
            Clear all
          </button>
        )}
      </div>
      {!hasData && (
        <div className="my-2 flex gap-2 rounded-lg bg-brand-50 p-3 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-copper-500" aria-hidden />
          These bulk-buying filters switch on automatically once supplier listings are published here. Counts always reflect real listings.
        </div>
      )}

      <Group title="Order quantity" badge={lp.params.get('qty') ? 1 : 0}>
        <OrderQuantity lp={lp} disabled={disabled} />
      </Group>

      <Group title="Minimum order quantity (MOQ)" badge={lp.list('moq').length + (lp.params.get('moqMin') || lp.params.get('moqMax') ? 1 : 0)}>
        <div className="space-y-2">
          {MOQ_RANGES.map((r) => (
            <Checkbox
              key={r.key}
              disabled={disabled}
              checked={lp.list('moq').includes(r.key)}
              onChange={() => lp.toggle('moq', r.key)}
              label={
                <span className="flex w-full justify-between gap-2">
                  <span>{r.label}</span>
                  {hasData && <span className="text-xs text-muted tabular-nums">{facets?.moq[r.key] ?? 0}</span>}
                </span>
              }
              className="w-full [&>span]:flex-1"
            />
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-medium text-muted">Custom MOQ range (pieces)</div>
          <RangeInputs minKey="moqMin" maxKey="moqMax" lp={lp} disabled={disabled} placeholderMin="Min" placeholderMax="Max" />
        </div>
      </Group>

      {/* Price filters only appear when real priced listings exist. */}
      {hasData && facets?.price && (
        <Group title="Wholesale price" badge={lp.params.get('priceMin') || lp.params.get('priceMax') ? 1 : 0}>
          <p className="mb-2 text-xs text-muted">
            Listings range from {formatINR(facets.price.min)} to {formatINR(facets.price.max)}.
          </p>
          <RangeInputs minKey="priceMin" maxKey="priceMax" lp={lp} disabled={false} prefix="₹" placeholderMin="Min" placeholderMax="Max" />
          {units.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {units.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => lp.set('priceUnit', lp.params.get('priceUnit') === u ? null : u)}
                  aria-pressed={lp.params.get('priceUnit') === u}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium', lp.params.get('priceUnit') === u ? 'border-copper-500 bg-copper-500 text-white' : 'border-line-strong bg-white')}
                >
                  Price per {u.toLowerCase()} ({facets.priceUnits[u]})
                </button>
              ))}
            </div>
          )}
        </Group>
      )}

      {defs.map((def, i) => (
        <Group key={def.key} title={def.label} defaultOpen={i < 3} badge={lp.list(`attr.${def.key}`).length}>
          <OptionList options={def.options} selected={lp.list(`attr.${def.key}`)} counts={facets?.attributes[def.key] ?? {}} onToggle={(v) => lp.toggle(`attr.${def.key}`, v)} disabled={disabled} />
        </Group>
      ))}

      {hasData && Object.keys(facets?.suppliers ?? {}).length > 0 && (
        <Group title="Supplier" defaultOpen={false} badge={lp.list('supplier').length}>
          <div className="space-y-2">
            {Object.entries(facets!.suppliers)
              .sort((a, b) => a[1].name.localeCompare(b[1].name))
              .map(([id, info]) => (
                <Checkbox
                  key={id}
                  checked={lp.list('supplier').includes(id)}
                  onChange={() => lp.toggle('supplier', id)}
                  label={
                    <span className="flex w-full justify-between gap-2">
                      <span>{info.name}</span>
                      <span className="text-xs text-muted tabular-nums">{info.count}</span>
                    </span>
                  }
                  className="w-full [&>span]:flex-1"
                />
              ))}
          </div>
        </Group>
      )}

      <Group title="Supplier location" defaultOpen={false} badge={lp.list('city').length}>
        {cities.length ? (
          <OptionList options={cities} selected={lp.list('city')} counts={facets?.cities ?? {}} onToggle={(v) => lp.toggle('city', v)} disabled={false} />
        ) : (
          <p className="text-xs text-muted">Supplier locations appear once listings are live.</p>
        )}
      </Group>
    </div>
  );
}

const LABELS: Record<string, string> = Object.fromEntries(MOQ_RANGES.map((r) => [r.key, `MOQ ${r.label}`]));

export function ActiveFilterChips({ lp, filterSet, facets }: { lp: ListingParams; filterSet: FilterSetKey | null; facets?: Facets }) {
  const defs = filterSet ? FILTER_SETS[filterSet] : [];
  const chips: { label: string; onRemove: () => void }[] = [];
  for (const v of lp.list('moq')) chips.push({ label: LABELS[v] ?? v, onRemove: () => lp.toggle('moq', v) });
  if (lp.params.get('moqMin') || lp.params.get('moqMax'))
    chips.push({ label: `MOQ ${lp.params.get('moqMin') ?? '0'}–${lp.params.get('moqMax') ?? '∞'} pcs`, onRemove: () => lp.update((p) => { p.delete('moqMin'); p.delete('moqMax'); }) });
  if (lp.params.get('qty')) chips.push({ label: `Ordering ${lp.params.get('qty')} pcs`, onRemove: () => lp.set('qty', null) });
  if (lp.params.get('priceMin') || lp.params.get('priceMax'))
    chips.push({ label: `₹${lp.params.get('priceMin') ?? '0'} – ₹${lp.params.get('priceMax') ?? '∞'}`, onRemove: () => lp.update((p) => { p.delete('priceMin'); p.delete('priceMax'); }) });
  if (lp.params.get('priceUnit')) chips.push({ label: `Per ${lp.params.get('priceUnit')!.toLowerCase()}`, onRemove: () => lp.set('priceUnit', null) });
  for (const v of lp.list('city')) chips.push({ label: v, onRemove: () => lp.toggle('city', v) });
  for (const v of lp.list('supplier')) chips.push({ label: `Supplier: ${facets?.suppliers?.[v]?.name ?? 'selected'}`, onRemove: () => lp.toggle('supplier', v) });
  for (const [k] of [...lp.params.entries()].filter(([k]) => k.startsWith('attr.'))) {
    const key = k.slice(5);
    const label = defs.find((d) => d.key === key)?.label ?? key;
    for (const v of lp.list(k)) chips.push({ label: `${label}: ${v}`, onRemove: () => lp.toggle(k, v) });
  }
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={c.label} onClick={c.onRemove} className="inline-flex items-center gap-1.5 rounded-full border border-copper-400/50 bg-copper-50 py-1 pr-2 pl-3 text-[0.8125rem] text-copper-700 hover:bg-copper-100" aria-label={`Remove filter ${c.label}`}>
          {c.label}
          <X className="size-3.5" aria-hidden />
        </button>
      ))}
      <button onClick={lp.clearAll} className="px-1 text-[0.8125rem] font-medium text-muted underline-offset-2 hover:text-charcoal hover:underline">
        Clear all
      </button>
    </div>
  );
}
