import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline";
  isLoading?: boolean;
}

export function PixelButton({ 
  children, 
  className, 
  variant = "primary", 
  isLoading,
  disabled,
  ...props 
}: PixelButtonProps) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 border-b-4 border-r-4 border-primary/50 active:border-b-0 active:border-r-0 active:translate-y-1 active:translate-x-1",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90 border-b-4 border-r-4 border-black/50 active:border-b-0 active:border-r-0 active:translate-y-1 active:translate-x-1",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-b-4 border-r-4 border-destructive/50 active:border-b-0 active:border-r-0 active:translate-y-1 active:translate-x-1",
    outline: "bg-transparent border-2 border-primary text-primary hover:bg-primary/10",
  };

  return (
    <button
      className={clsx(
        "font-pixel text-xs sm:text-sm px-4 py-3 transition-all duration-75 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
        variants[variant],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      <span className="flex items-center justify-center gap-2">
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </span>
    </button>
  );
}
