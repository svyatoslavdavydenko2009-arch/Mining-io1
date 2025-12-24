import { clsx } from "clsx";
import React from "react";

interface PixelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const PixelInput = React.forwardRef<HTMLInputElement, PixelInputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="w-full space-y-2">
        {label && (
          <label className="block text-primary/80 font-pixel text-xs uppercase tracking-widest">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(
            "w-full bg-black/40 border-2 border-secondary p-3 text-lg font-body text-white placeholder:text-gray-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors",
            error ? "border-destructive" : "border-secondary",
            className
          )}
          {...props}
        />
        {error && <p className="text-destructive text-sm font-pixel text-xs">{error}</p>}
      </div>
    );
  }
);

PixelInput.displayName = "PixelInput";
