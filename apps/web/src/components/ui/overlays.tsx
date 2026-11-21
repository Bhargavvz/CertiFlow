// Radix-based overlays (dialog, dropdown menu, tooltip) styled with our tokens.
// Radix handles focus trapping, Escape, aria attributes and portal stacking.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/* ---------------- Dialog ---------------- */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  side = 'center',
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 'left' renders a full-height drawer (used for the mobile navigation). */
  side?: 'center' | 'left';
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#0a111c]/50 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 border border-border bg-surface shadow-lg focus:outline-none',
          side === 'center'
            ? 'left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 data-[state=open]:animate-[dialog-in_160ms_ease-out]'
            : 'inset-y-0 left-0 w-72 max-w-[85vw] rounded-r-xl p-0 data-[state=open]:animate-[drawer-in_180ms_ease-out]',
          className,
        )}
      >
        <div className={cn(side === 'left' && 'sr-only')}>
          <DialogPrimitive.Title className="text-section text-fg">{title}</DialogPrimitive.Title>
          {description && <DialogPrimitive.Description className="mt-1 text-body text-muted">{description}</DialogPrimitive.Description>}
        </div>
        {!description && side === 'center' && <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ---------------- Dropdown menu ---------------- */

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;

export const DropdownMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>>(
  ({ className, sideOffset = 6, ...props }, ref) => (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-surface p-1 text-body shadow-lg',
          'data-[state=open]:animate-[pop-in_120ms_ease-out]',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  ),
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <DropdownPrimitive.Item
      ref={ref}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-fg outline-none',
        'data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  ),
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <DropdownPrimitive.Label className="px-2 pb-1 pt-1.5 text-caption font-medium text-muted">{children}</DropdownPrimitive.Label>;
}

export function DropdownMenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-border" />;
}

/* ---------------- Tooltip ---------------- */

export const TooltipProvider = TooltipPrimitive.Provider;

/** Wrap any element. For disabled buttons, wrap them in a <span tabIndex={0}> so the tip is reachable. */
export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-md bg-fg px-2.5 py-1.5 text-caption text-surface shadow-md data-[state=delayed-open]:animate-[pop-in_100ms_ease-out]"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-fg" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
