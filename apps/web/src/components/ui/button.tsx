import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none',
  {
    variants: {
      variant: {
        // Inset top highlight reads as a pressed-ink surface rather than a flat block.
        primary: 'bg-primary text-primary-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(19_26_51/0.25)] hover:bg-primary-hover',
        secondary: 'border border-border-strong bg-surface text-fg shadow-sm hover:border-fg/30 hover:bg-surface-2',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        success: 'bg-status-green-fg text-white shadow-sm hover:brightness-110 dark:bg-status-green-dot dark:text-[#04210f]',
        danger: 'bg-status-red-fg text-white shadow-sm hover:brightness-110 dark:bg-status-red-dot dark:text-[#2a0707]',
        'danger-outline': 'border border-status-red-dot/45 bg-surface text-status-red-fg hover:bg-status-red-bg',
        link: 'h-auto px-0 font-medium text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-caption',
        md: 'h-9 px-4 text-body',
        lg: 'h-11 px-5 text-[0.9375rem] rounded-lg',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
