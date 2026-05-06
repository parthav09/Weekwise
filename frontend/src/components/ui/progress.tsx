import * as React from "react"

import { cn } from "../../lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    const clampedValue = Math.min(Math.max(value, 0), 100)

    return (
      <div
        ref={ref}
        className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedValue}
        {...props}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    )
  },
)

Progress.displayName = "Progress"
