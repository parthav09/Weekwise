import { cva } from "class-variance-authority"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        secondary: "bg-muted text-foreground hover:bg-muted/80",
        outline: "border border-border bg-card shadow-sm hover:bg-muted/70",
        ghost: "hover:bg-muted/80",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 gap-1.5 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-5 text-base",
        icon: "h-9 w-9 shrink-0 rounded-lg p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
