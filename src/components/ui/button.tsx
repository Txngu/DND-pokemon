import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// "volt" (kept as the variant key for backward compatibility with every
// existing call site) is the Primary button: regional color, soft glow,
// pill shape. "outline" is Secondary: frosted glass, thin border. "default"
// is Danger: crimson gradient, reserved for destructive actions.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-screen-ink disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-rotom-red-light to-rotom-red text-white shadow-[0_2px_12px_rgba(228,54,43,0.45)] hover:brightness-110 active:scale-[0.98]",
        volt: "bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow-[0_2px_16px_-2px_var(--theme-primary)] hover:brightness-110 active:scale-[0.98] font-semibold",
        outline:
          "glass border border-white/15 bg-white/5 text-mist hover:bg-white/10 active:scale-[0.98]",
        ghost: "bg-transparent text-mist hover:bg-white/5 rounded-xl",
        link: "text-[var(--theme-primary-light)] underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "volt",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
