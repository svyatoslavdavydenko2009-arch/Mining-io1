import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { PixelInput } from "@/components/PixelInput";
import { PixelButton } from "@/components/PixelButton";
import { PixelCard } from "@/components/PixelCard";
import { Loader2, Pickaxe } from "lucide-react";
import { motion } from "framer-motion";
import { GameCanvas } from "@/components/GameCanvas";

export default function Login() {
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  if (user) return null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password }, {
      onSuccess: () => {
        setLocation("/");
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 blur-md scale-105">
        <GameCanvas isBackgroundOnly={true} />
        <div className="absolute inset-0 bg-black/40" />
      </div>
      
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="z-10 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
            className="inline-block mb-4"
          >
            <Pickaxe className="w-16 h-16 text-primary" />
          </motion.div>
          <h1 className="text-4xl md:text-5xl mb-2">
            <span className="text-yellow-400">MINING</span> <span className="text-red-600">io</span>
          </h1>
        </div>

        <PixelCard title="LOGIN" className="shadow-2xl shadow-primary/20">
          <form onSubmit={handleSubmit} className="space-y-6">
            <PixelInput
              label="Explorer Name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username..."
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

            {login.error && (
              <div className="p-3 bg-destructive/20 border border-destructive text-destructive text-sm font-pixel text-center">
                {login.error.message}
              </div>
            )}

            <div className="pt-2">
              <PixelButton
                type="submit"
                className="w-full"
                isLoading={login.isPending}
              >
                Start Expedition
              </PixelButton>
            </div>

            <div className="text-center text-sm text-muted-foreground mt-4 font-body">
              New to the caves?{" "}
              <Link href="/register" className="text-primary hover:text-primary/80 hover:underline">
                Register here
              </Link>
            </div>
          </form>
        </PixelCard>
      </motion.div>
    </div>
  );
}
