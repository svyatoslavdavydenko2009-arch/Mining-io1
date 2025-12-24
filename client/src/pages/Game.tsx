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

  if (!user) return null;

  const currentPickaxe = PICKAXES.find(p => p.level === user.pickaxeLevel) || PICKAXES[0];
  const nextPickaxe = PICKAXES.find(p => p.level === user.pickaxeLevel + 1);

  const canAffordUpgrade = nextPickaxe ? Object.entries(nextPickaxe.cost).every(([res, amount]) => {
    return (user.inventory[res] || 0) >= amount;
  }) : false;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden">
      
      {/* SIDEBAR - Stats & Inventory */}
      <aside className="w-full md:w-80 bg-black/40 border-r-4 border-secondary p-4 flex flex-col gap-6 z-10">
        <div className="flex items-center gap-3 border-b-2 border-secondary pb-4">
          <div className="w-12 h-12 bg-primary rounded-none flex items-center justify-center text-black font-pixel text-xl">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl leading-none">{user.username}</h2>
            <p className="text-muted-foreground text-sm">Level {user.pickaxeLevel} Miner</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <h3 className="flex items-center gap-2 font-pixel text-sm text-primary mb-4">
            <Backpack className="w-4 h-4" /> INVENTORY
          </h3>
          
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(RESOURCES).map(([key, def]) => (
              <div 
                key={key} 
                className="bg-secondary/30 border-2 border-secondary p-2 flex flex-col items-center justify-center gap-1 hover:bg-secondary/50 transition-colors"
              >
                <div 
                  className="w-8 h-8 mb-1"
                  style={{ backgroundColor: def.color, boxShadow: 'inset -2px -2px 0 rgba(0,0,0,0.5)' }} 
                />
                <span className="text-xs font-pixel uppercase opacity-70">{def.name}</span>
                <span className="text-xl font-bold text-primary">
                  {user.inventory[key] || 0}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-2">
          <PixelButton 
            className="w-full" 
            variant="secondary"
            onClick={() => setShowCrafting(!showCrafting)}
          >
            <Hammer className="w-4 h-4" /> {showCrafting ? "Close Crafting" : "Crafting"}
          </PixelButton>

          <PixelButton 
            className="w-full" 
            variant="danger"
            onClick={() => logout.mutate()}
          >
            <LogOut className="w-4 h-4" /> Logout
          </PixelButton>
        </div>
      </aside>

      {/* MAIN GAME AREA */}
      <main className="flex-1 p-4 md:p-8 flex flex-col items-center justify-center relative bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
        
        {/* Game Title Overlay */}
        <div className="absolute top-4 font-pixel text-primary/20 text-4xl select-none pointer-events-none">
          SECTOR {Math.floor(user.x / 10)},{Math.floor(user.y / 10)}
        </div>

        <div className="w-full max-w-4xl relative">
          <GameCanvas user={user} />
          
          {/* Crafting Modal Overlay */}
          {showCrafting && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-black/90 flex items-center justify-center p-4 z-20"
            >
              <PixelCard title="BLACKSMITH" className="w-full max-w-lg bg-background border-primary">
                <div className="space-y-6">
                  <div className="text-center p-4 bg-secondary/20 border-2 border-secondary">
                    <p className="text-muted-foreground text-sm uppercase mb-2">Current Tool</p>
                    <h4 className="text-xl text-primary">{currentPickaxe.name}</h4>
                  </div>

                  {nextPickaxe ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-muted-foreground">Next Upgrade:</span>
                        <span className="text-accent text-lg">{nextPickaxe.name}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 bg-black/30 p-4 border-2 border-dashed border-secondary">
                        {Object.entries(nextPickaxe.cost).map(([res, amount]) => {
                          const has = user.inventory[res] || 0;
                          const ok = has >= amount;
                          return (
                            <div key={res} className="flex justify-between items-center text-sm">
                              <span className="capitalize text-muted-foreground">{res.replace('_', ' ')}:</span>
                              <span className={clsx(ok ? "text-green-500" : "text-destructive")}>
                                {has}/{amount}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <PixelButton 
                        className="w-full" 
                        variant="primary" 
                        disabled={!canAffordUpgrade || craft.isPending}
                        onClick={() => craft.mutate()}
                      >
                        {craft.isPending ? "Forging..." : canAffordUpgrade ? "UPGRADE PICKAXE" : "NOT ENOUGH RESOURCES"}
                      </PixelButton>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-primary font-pixel">
                      MAXIMUM LEVEL REACHED!
                    </div>
                  )}

                  <div className="text-center">
                    <button 
                      onClick={() => setShowCrafting(false)}
                      className="text-muted-foreground hover:text-white underline text-sm"
                    >
                      Return to Mining
                    </button>
                  </div>
                </div>
              </PixelCard>
            </motion.div>
          )}
        </div>

      </main>
    </div>
  );
}
