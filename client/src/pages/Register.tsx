import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { PixelInput } from "@/components/PixelInput";
import { PixelButton } from "@/components/PixelButton";
import { PixelCard } from "@/components/PixelCard";
import { Pickaxe } from "lucide-react";
import { motion } from "framer-motion";

export default function Register() {
  const { register, user } = useAuth();
  if (user) return null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register.mutate({ username, password });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[url('https://pixabay.com/get/g7e68689086f867013bf0af1485b26d6b78f64bbd68f579aa0006dae8082c8cfba54cce5f0abdd3c09088f95065712f4b134bcdf06c929a68146d7b771468bd5e_1280.jpg')] bg-cover bg-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="z-10 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Pickaxe className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl md:text-4xl text-primary">JOIN THE GUILD</h1>
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

            <div className="pt-2">
              <PixelButton
                type="submit"
                className="w-full"
                isLoading={register.isPending}
              >
                Create Account
              </PixelButton>
            </div>

            <div className="text-center text-sm text-muted-foreground mt-4 font-body">
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
