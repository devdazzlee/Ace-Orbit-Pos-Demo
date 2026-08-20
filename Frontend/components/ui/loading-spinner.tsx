import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

/**
 * Small standalone spinner. Style matches PageLoader for visual consistency.
 * Use this only when you need a bare spinner without the centered layout
 * (e.g., inline in a Button via LoadingButton). For section/page loaders use <PageLoader />.
 */
export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-8 w-8 border-[3px]",
  }

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-slate-200 border-t-indigo-600",
        sizeClasses[size],
        className,
      )}
    />
  )
}
