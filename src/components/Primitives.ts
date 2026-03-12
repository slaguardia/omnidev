import { tv } from 'tailwind-variants';

// ── Shared Chip Styles ─────────────────────────────────────────────────

/** classNames for a colored status chip (use with variant="solid" + a color prop) */
export const statusChipClasses = { base: 'pl-2', content: 'px-2' } as const;

/** classNames for a neutral info chip (workspace, branch, etc.) */
export const infoChipClasses = {
  base: 'bg-default-300 dark:bg-default-200 pl-2',
  content: 'px-2',
} as const;

/** Default size for metadata chips in headers / detail views */
export const chipSize = 'md' as const;

/** Icon size class matching chipSize="md" */
export const chipIconClass = 'w-4 h-4' as const;

// Title
export const title = tv({
  base: 'tracking-tight inline font-semibold',
  variants: {
    color: {
      violet: 'from-[#FF1CF7] to-[#b249f8]',
      yellow: 'from-[#FF705B] to-[#FFB457]',
      blue: 'from-[#5EA2EF] to-[#0072F5]',
      cyan: 'from-[#00b7fa] to-[#01cfea]',
      green: 'from-[#6FEE8D] to-[#17c964]',
      pink: 'from-[#FF72E1] to-[#F54C7A]',
      foreground: 'dark:from-[#FFFFFF] dark:to-[#4B4B4B]',
    },
    size: {
      sm: 'text-3xl lg:text-4xl',
      md: 'text-[2.3rem] lg:text-5xl leading-9',
      lg: 'text-4xl lg:text-6xl',
    },
    fullWidth: {
      true: 'w-full block',
    },
  },
  defaultVariants: {
    size: 'md',
  },
  compoundVariants: [
    {
      color: ['violet', 'yellow', 'blue', 'cyan', 'green', 'pink', 'foreground'],
      class: 'bg-clip-text text-transparent bg-gradient-to-b',
    },
  ],
});

// Subtitle
export const subtitle = tv({
  base: 'w-full md:w-1/2 my-2 text-lg lg:text-xl text-default-600 block max-w-full',
  variants: {
    fullWidth: {
      true: '!w-full',
    },
  },
  defaultVariants: {
    fullWidth: true,
  },
});
