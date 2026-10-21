'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRef } from 'react';

import { GripVerticalIcon, PlusIcon, XIcon } from 'lucide-react';

import { isLink } from '@/lib/format';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** An address with an id of its own, so its field keeps its place while dragged. */
export type AddressItem = { id: string; value: string };

export function toItems(addresses: string[]): AddressItem[] {
  return addresses.map((value) => ({ id: crypto.randomUUID(), value }));
}

/** Whether a field holds something meant as a link that isn't one. */
function badLink(value: string) {
  return isLink(value.trim()) && !URL.canParse(value.trim());
}

/**
 * A field per address, dragged by its handle to reorder (or with the keyboard:
 * Space on the handle, then the arrow keys). Enter adds a field after the one
 * typed in; pasting several lines makes a field for each.
 */
export function AddressesField({
  id,
  items,
  onChange,
}: {
  id: string;
  items: AddressItem[];
  onChange: (items: AddressItem[]) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /** Puts fields in after `index`, then moves the cursor to the last of them. */
  function insertAfter(index: number, values: string[]) {
    const added = toItems(values);
    onChange([
      ...items.slice(0, index + 1),
      ...added,
      ...items.slice(index + 1),
    ]);
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLInputElement>(
          `[data-address='${added.at(-1)?.id}']`
        )
        ?.focus()
    );
  }

  function update(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? { ...item, value } : item)));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    onChange(arrayMove(items, from, to));
  }

  return (
    <div ref={list} className='flex flex-col gap-2'>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((item, index) => (
            <AddressRow
              key={item.id}
              item={item}
              inputId={index === 0 ? id : undefined}
              onChange={(value) => update(index, value)}
              onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
              onEnter={() => insertAfter(index, [''])}
              onPasteLines={(lines) => {
                update(index, lines[0]);
                insertAfter(index, lines.slice(1));
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type='button'
        variant='outline'
        className='self-start'
        onClick={() => insertAfter(items.length - 1, [''])}
      >
        <PlusIcon />
        Add address
      </Button>
    </div>
  );
}

function AddressRow({
  item,
  inputId,
  onChange,
  onRemove,
  onEnter,
  onPasteLines,
}: {
  item: AddressItem;
  /** The first field takes the label's id, so clicking the label focuses it */
  inputId?: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  onEnter: () => void;
  onPasteLines: (lines: string[]) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-dragging={isDragging}
      className='flex items-center gap-1 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80'
    >
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label='Drag to reorder'
        className='cursor-grab touch-none text-muted-foreground active:cursor-grabbing'
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon />
      </Button>
      <Input
        id={inputId}
        data-address={item.id}
        value={item.value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
        }}
        onPaste={(e) => {
          const lines = e.clipboardData
            .getData('text')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          if (lines.length > 1) {
            e.preventDefault();
            onPasteLines(lines);
          }
        }}
        aria-invalid={badLink(item.value) || undefined}
        placeholder='https://… or host:port'
        className='font-mono'
        spellCheck={false}
      />
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label='Remove'
        className='text-muted-foreground'
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </div>
  );
}
