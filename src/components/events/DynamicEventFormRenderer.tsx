import React from 'react';
import type { EventFormField, FormResponseValue } from '@/lib/talent/eventTypes';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none transition focus:border-orange-400/50 focus:ring-2 focus:ring-orange-400/20';

function FieldShell({
  field,
  error,
  children,
}: {
  field: EventFormField;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
        {field.label}
        {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
      </span>
      {field.helpText ? <span className="block text-xs text-white/35 -mt-1">{field.helpText}</span> : null}
      {children}
      {error ? <span className="block text-xs text-red-400">{error}</span> : null}
    </label>
  );
}

export default function DynamicEventFormRenderer({
  fields,
  values,
  errors,
  onChange,
  readOnly = false,
}: {
  fields: EventFormField[];
  values: Record<string, FormResponseValue>;
  errors?: Record<string, string>;
  onChange?: (fieldId: string, value: FormResponseValue) => void;
  readOnly?: boolean;
}) {
  const sorted = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-5">
      {sorted.map((field) => {
        const value = values[field.id];
        const error = errors?.[field.id];
        const disabled = readOnly || !onChange;

        switch (field.type) {
          case 'long_text':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <textarea
                  className={`${inputClass} min-h-[120px] resize-y`}
                  placeholder={field.placeholder || ''}
                  value={typeof value === 'string' ? value : ''}
                  disabled={disabled}
                  onChange={(e) => onChange?.(field.id, e.target.value)}
                />
              </FieldShell>
            );
          case 'single_select':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <select
                  className={inputClass}
                  value={typeof value === 'string' ? value : ''}
                  disabled={disabled}
                  onChange={(e) => onChange?.(field.id, e.target.value)}
                >
                  <option value="">Select an option</option>
                  {(field.options || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FieldShell>
            );
          case 'multi_select':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <div className="space-y-2">
                  {(field.options || []).map((option) => {
                    const selected = Array.isArray(value) ? value.includes(option) : false;
                    return (
                      <label key={option} className="flex items-center gap-3 text-sm text-white/80">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={(e) => {
                            const current = Array.isArray(value) ? value : [];
                            const next = e.target.checked
                              ? [...current, option]
                              : current.filter((item) => item !== option);
                            onChange?.(field.id, next);
                          }}
                          className="rounded border-white/20 bg-white/5 text-orange-500"
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              </FieldShell>
            );
          case 'checkbox':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <label className="flex items-center gap-3 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    disabled={disabled}
                    onChange={(e) => onChange?.(field.id, e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-orange-500"
                  />
                  {field.placeholder || 'Yes'}
                </label>
              </FieldShell>
            );
          case 'number':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <input
                  type="number"
                  className={inputClass}
                  placeholder={field.placeholder || ''}
                  value={typeof value === 'number' ? value : ''}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange?.(field.id, e.target.value === '' ? '' : Number(e.target.value))
                  }
                />
              </FieldShell>
            );
          case 'date':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <input
                  type="date"
                  className={inputClass}
                  value={typeof value === 'string' ? value : ''}
                  disabled={disabled}
                  onChange={(e) => onChange?.(field.id, e.target.value)}
                />
              </FieldShell>
            );
          case 'email':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <input
                  type="email"
                  className={inputClass}
                  placeholder={field.placeholder || ''}
                  value={typeof value === 'string' ? value : ''}
                  disabled={disabled}
                  onChange={(e) => onChange?.(field.id, e.target.value)}
                />
              </FieldShell>
            );
          case 'url':
          case 'file_url':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <input
                  type="url"
                  className={inputClass}
                  placeholder={field.placeholder || 'https://'}
                  value={typeof value === 'string' ? value : ''}
                  disabled={disabled}
                  onChange={(e) => onChange?.(field.id, e.target.value)}
                />
              </FieldShell>
            );
          case 'phone':
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <input
                  type="tel"
                  className={inputClass}
                  placeholder={field.placeholder || ''}
                  value={typeof value === 'string' ? value : ''}
                  disabled={disabled}
                  onChange={(e) => onChange?.(field.id, e.target.value)}
                />
              </FieldShell>
            );
          default:
            return (
              <FieldShell key={field.id} field={field} error={error}>
                <input
                  type="text"
                  className={inputClass}
                  placeholder={field.placeholder || ''}
                  value={typeof value === 'string' ? value : ''}
                  disabled={disabled}
                  onChange={(e) => onChange?.(field.id, e.target.value)}
                />
              </FieldShell>
            );
        }
      })}
    </div>
  );
}
