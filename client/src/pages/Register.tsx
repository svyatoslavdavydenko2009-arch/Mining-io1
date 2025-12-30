import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { PixelInput } from "@/components/PixelInput";
import { PixelButton } from "@/components/PixelButton";
import { PixelCard } from "@/components/PixelCard";
import { Pickaxe } from "lucide-react";
import { motion } from "framer-motion";
import { GameCanvas } from "@/components/GameCanvas";

export default function Register() {
  const { register, user } = useAuth();
  const [, setLocation] = useLocation();
  if (user) return null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register.mutate({ username, password }, {
      onSuccess: () => {
        setLocation("/");
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 scale-110">
        <GameCanvas isBackgroundOnly={true} isFullscreen={true} />
        <div className="absolute inset-0 bg-black/40" />
      </div>
      
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="z-10 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Pickaxe className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl md:text-4xl">
            <span className="text-yellow-400">MINING</span> <span className="text-red-600">io</span>
          </h1>
        </div>

        <PixelCard title="REGISTER" className="shadow-2xl shadow-primary/20">
          <form onSubmit={handleSubmit} className="space-y-6">
            <PixelInput
              label="Explorer Name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a name..."
              required
            />
            
            <PixelInput
              label="Secret Code"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            {register.error && (
              <div className="p-3 bg-destructive/20 border border-destructive text-destructive text-sm font-pixel text-center">
                {register.error.message}
              </div>
            )}

            <div className="pt-2 opacity-0 hover:opacity-100 transition-opacity duration-300">
              <PixelButton
                type="submit"
                className="w-full"
                isLoading={register.isPending}
              >
                Create Account
              </PixelButton>
            </div>

            <div className="text-center text-sm text-muted-foreground mt-4 font-body opacity-0 hover:opacity-100 transition-opacity duration-300">
              Already have a permit?{" "}
              <Link href="/" className="text-primary hover:text-primary/80 hover:underline">
                Login here
              </Link>
            </div>
          </form>
        </PixelCard>
      </motion.div>
    </div>
  );
}
