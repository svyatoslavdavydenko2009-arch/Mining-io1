import { clsx } from "clsx";

interface PixelCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function PixelCard({ children, className, title }: PixelCardProps) {
  return (
    <div className={clsx("relative bg-secondary/80 border-4 border-secondary p-1", className)}>
      {/* Pixel corners decoration */}
      <div className="absolute -top-1 -left-1 w-2 h-2 bg-background z-10" />
      <div className="absolute -top-1 -right-1 w-2 h-2 bg-background z-10" />
      <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-background z-10" />
      <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-background z-10" />
      
      <div className="border-2 border-primary/20 h-full w-full p-4 sm:p-6 bg-background/50">
        {title && (
          <h3 className="text-xl text-primary font-pixel mb-6 text-center border-b-2 border-dashed border-primary/30 pb-4">
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}
