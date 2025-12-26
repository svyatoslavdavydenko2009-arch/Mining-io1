import { useAuth } from "@/hooks/use-auth";
import { useGame } from "@/hooks/use-game";
import { GameCanvas } from "@/components/GameCanvas";
import { PixelButton } from "@/components/PixelButton";
import { PixelCard } from "@/components/PixelCard";
import { RESOURCES, PICKAXES, type ResourceType } from "@shared/schema";
import { LogOut, Hammer, Backpack } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { clsx } from "clsx";

export default function Game() {
  const { user, logout } = useAuth();
  const { craft } = useGame();
  const [showCrafting, setShowCrafting] = useState(false);
  const [isGameFullscreen, setIsGameFullscreen] = useState(false);

  if (!user) return null;

  const currentPickaxe = PICKAXES.find(p => p.level === user.pickaxeLevel) || PICKAXES[0];
  const nextPickaxe = PICKAXES.find(p => p.level === user.pickaxeLevel + 1);

  const canAffordUpgrade = nextPickaxe ? Object.entries(nextPickaxe.cost).every(([res, amount]) => {
    return (user.inventory[res] || 0) >= amount;
  }) : false;

  return (
    <div className="w-screen h-screen overflow-hidden bg-black">
      <GameCanvas user={user} isFullscreen={true} onFullscreenChange={() => {}} />
    </div>
  );
}
