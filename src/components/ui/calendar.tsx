import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center w-full',
        caption_label: 'text-sm font-semibold text-white',
        nav: 'flex items-center gap-1',
        button_previous:
          'absolute left-1 h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white inline-flex items-center justify-center',
        button_next:
          'absolute right-1 h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white inline-flex items-center justify-center',
        month_grid: 'w-full border-collapse mt-3',
        weekdays: 'flex',
        weekday: 'text-white/40 rounded-md w-9 font-normal text-[0.75rem] text-center',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day_button: cn(
          'h-9 w-9 rounded-lg font-normal text-white/80 hover:bg-white/10 hover:text-white',
          'aria-selected:bg-[#fa7d22] aria-selected:text-black aria-selected:hover:bg-[#ff9b4e] aria-selected:hover:text-black',
          'disabled:text-white/20 disabled:hover:bg-transparent'
        ),
        selected: '[&>button]:bg-[#fa7d22] [&>button]:text-black [&>button]:hover:bg-[#ff9b4e]',
        today: '[&>button]:border [&>button]:border-[#fa7d22]/40',
        outside: '[&>button]:text-white/25 [&>button]:aria-selected:text-black/70',
        disabled: '[&>button]:text-white/20 [&>button]:opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  );
}
