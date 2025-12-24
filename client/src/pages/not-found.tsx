import { Link } from "wouter";
import { PixelCard } from "@/components/PixelCard";
import { PixelButton } from "@/components/PixelButton";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <PixelCard className="max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-4xl mb-4 text-primary">404</h1>
        <p className="text-muted-foreground mb-8">
          You've dug too deep! This cave doesn't exist.
        </p>
        <Link href="/">
          <PixelButton variant="outline">
            Return to Surface
          </PixelButton>
        </Link>
      </PixelCard>
    </div>
  );
}
