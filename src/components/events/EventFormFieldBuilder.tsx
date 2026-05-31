import React, { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { EventFormField, FormFieldType } from '@/lib/talent/eventTypes';
import { FORM_FIELD_TYPES } from '@/lib/talent/eventTypes';
import DynamicEventFormRenderer from './DynamicEventFormRenderer';
import {
  adminGhostButtonClass,
  adminInputClass,
  adminMutedClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSubPanelClass,
} from '@/components/admin/adminUi';

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  short_text: 'Short answer',
  long_text: 'Paragraph',
  email: 'Email',
  phone: 'Phone',
  url: 'URL',
  single_select: 'Multiple choice',
  multi_select: 'Checkboxes',
  checkbox: 'Yes / No',
  number: 'Number',
  date: 'Date',
  file_url: 'File link',
};

function newFieldId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function SortableFieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: EventFormField;
  onChange: (field: EventFormField) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${adminSubPanelClass} p-4 space-y-3`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-2 text-gray-500 hover:text-white cursor-grab"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className={adminInputClass}
            value={field.label}
            placeholder="Question label"
            onChange={(e) => onChange({ ...field, label: e.target.value })}
          />
          <select
            className={adminInputClass}
            value={field.type}
            onChange={(e) =>
              onChange({
                ...field,
                type: e.target.value as FormFieldType,
                options: ['single_select', 'multi_select'].includes(e.target.value) ? ['Option 1'] : [],
              })
            }
          >
            {FORM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <input
            className={`${adminInputClass} md:col-span-2`}
            value={field.placeholder || ''}
            placeholder="Placeholder (optional)"
            onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
          />
          <input
            className={`${adminInputClass} md:col-span-2`}
            value={field.helpText || ''}
            placeholder="Help text (optional)"
            onChange={(e) => onChange({ ...field, helpText: e.target.value })}
          />
          {['single_select', 'multi_select'].includes(field.type) ? (
            <textarea
              className={`${adminInputClass} md:col-span-2 min-h-[80px] resize-y`}
              value={(field.options || []).join('\n')}
              placeholder="One option per line"
              onChange={(e) =>
                onChange({
                  ...field,
                  options: e.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
            />
          ) : null}
          <label className={`flex items-center gap-2 ${adminMutedClass} md:col-span-2`}>
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ ...field, required: e.target.checked })}
            />
            Required
          </label>
        </div>
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-300">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function EventFormFieldBuilder({
  fields,
  onChange,
}: {
  fields: EventFormField[];
  onChange: (fields: EventFormField[]) => void;
}) {
  const [previewValues, setPreviewValues] = useState<Record<string, import('@/lib/talent/eventTypes').FormResponseValue>>({});
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sorted = useMemo(() => [...fields].sort((a, b) => a.order - b.order), [fields]);

  const updateField = (id: string, next: EventFormField) => {
    onChange(fields.map((field) => (field.id === id ? next : field)));
  };

  const removeField = (id: string) => {
    onChange(
      fields
        .filter((field) => field.id !== id)
        .map((field, index) => ({ ...field, order: index }))
    );
  };

  const addField = (type: FormFieldType = 'short_text') => {
    const next: EventFormField = {
      id: newFieldId(),
      label: 'Untitled question',
      type,
      required: false,
      order: fields.length,
      options: ['single_select', 'multi_select'].includes(type) ? ['Option 1'] : [],
    };
    onChange([...fields, next]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((field) => field.id === active.id);
    const newIndex = sorted.findIndex((field) => field.id === over.id);
    const reordered = arrayMove(sorted, oldIndex, newIndex).map((field, index) => ({
      ...field,
      order: index,
    }));
    onChange(reordered);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FORM_FIELD_TYPES.slice(0, 6).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addField(type)}
              className={adminSecondaryButtonClass()}
            >
              + {FIELD_TYPE_LABELS[type]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => addField()}
            className={adminPrimaryButtonClass()}
          >
            <Plus className="w-3 h-3 inline mr-1" />
            Add field
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map((field) => field.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sorted.length === 0 ? (
                <p className={`${adminMutedClass} ${adminPanelClass} p-4`}>
                  No custom fields yet. Add questions builders will answer when registering.
                </p>
              ) : (
                sorted.map((field) => (
                  <SortableFieldEditor
                    key={field.id}
                    field={field}
                    onChange={(next) => updateField(field.id, next)}
                    onRemove={() => removeField(field.id)}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className={`${adminPanelClass} p-5`}>
        <h4 className="text-sm font-semibold text-white mb-4">Live preview</h4>
        {sorted.length === 0 ? (
          <p className={adminMutedClass}>Preview will appear here.</p>
        ) : (
          <DynamicEventFormRenderer
            fields={sorted}
            values={previewValues}
            onChange={(fieldId, value) =>
              setPreviewValues((prev) => ({ ...prev, [fieldId]: value }))
            }
          />
        )}
      </div>
    </div>
  );
}
