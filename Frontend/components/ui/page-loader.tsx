import { cn } from "@/lib/utils"

type LoaderSize = "sm" | "md" | "lg"

interface PageLoaderProps {
  message?: string
  size?: LoaderSize
  className?: string
}

const SIZE_MAP: Record<LoaderSize, { ring: string; layout: string; text: string }> = {
  /* Inline / panel: fixed minimum height */
  sm: { ring: "h-7 w-7 border-2", layout: "min-h-[120px] py-8", text: "text-xs" },
  /* Full tab: grow to fill parent (Dashboard <main> must be flex flex-col) */
  md: { ring: "h-10 w-10 border-2", layout: "flex-1 min-h-0 w-full py-12", text: "text-sm" },
  lg: { ring: "h-12 w-12 border-[2.5px]", layout: "flex-1 min-h-0 w-full py-16", text: "text-base" },
}

/**
 * Full-page or section loading state. Keeps visuals quiet: thin ring + muted caption.
 * For buttons and inline UI, use Loader2 instead.
 */
export function PageLoader({ message = "Loading…", size = "md", className }: PageLoaderProps) {
  const s = SIZE_MAP[size]
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex w-full flex-col items-center justify-center",
        /* No own background — avoids white strip on gray-50 shell */
        s.layout,
        className
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className={cn(
            "shrink-0 rounded-full border-muted-foreground/20 border-t-primary animate-spin",
            s.ring
          )}
          aria-hidden
        />
        {message ? (
          <p className={cn("max-w-xs text-center font-normal text-muted-foreground", s.text)}>
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
