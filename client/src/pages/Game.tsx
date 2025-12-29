import { useAuth } from "@/hooks/use-auth";
import { useGame } from "@/hooks/use-game";
import { GameCanvas } from "@/components/GameCanvas";
import { PICKAXES } from "@shared/schema";
import { Settings, LogOut, X, Backpack, Crosshair } from "lucide-react";
import { useState } from "react";
import { PixelButton } from "@/components/PixelButton";
import { InventoryModal } from "@/components/InventoryModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

export default function Game() {
  const { user, logout } = useAuth();
  const { hitboxEnabled, toggleHitbox } = useGame();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      <GameCanvas user={user} isFullscreen={true} onFullscreenChange={() => {}} hitboxEnabled={hitboxEnabled} />
      
      <div className="absolute top-4 right-4 z-[60] flex items-center gap-2">
        <button 
          data-testid="button-inventory"
          onClick={() => setInventoryOpen(true)}
          className="p-2 bg-black/60 hover:bg-black/80 border-2 border-secondary rounded-md text-white transition-all active:scale-95 backdrop-blur-sm shadow-lg animate-in fade-in-50 duration-300"
        >
          <Backpack size={24} />
        </button>

        <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DropdownMenuTrigger asChild>
            <button 
              data-testid="button-settings"
              className="p-2 bg-black/60 hover:bg-black/80 border-2 border-secondary rounded-md text-white transition-all active:scale-95 backdrop-blur-sm shadow-lg"
            >
              <Settings size={24} className={settingsOpen ? "animate-spin-slow" : ""} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="end" 
            className="border-2 border-secondary p-2 min-w-[200px] overflow-hidden"
            style={{
              backgroundColor: '#3f2817',
              background: `
                linear-gradient(135deg, rgba(80, 50, 30, 0.4) 0%, transparent 50%),
                linear-gradient(225deg, rgba(60, 40, 25, 0.3) 0%, transparent 50%),
                #3f2817
              `,
              backgroundAttachment: 'fixed'
            }}
          >
            <div className="px-2 py-1.5 mb-2 border-b border-secondary/30">
              <p className="text-[12px] font-pixel text-white/90 uppercase font-bold">Settings</p>
            </div>
            
            <div className="flex items-center justify-between gap-2 px-2 py-2 mb-2 hover:bg-white/5 rounded-sm transition-colors">
              <div className="flex items-center gap-2">
                <Crosshair size={16} className="text-white/60" />
                <span className="text-xs font-pixel text-white font-bold">HITBOX</span>
              </div>
              <Switch 
                checked={hitboxEnabled} 
                onCheckedChange={toggleHitbox}
                className="scale-75 data-[state=checked]:bg-primary"
              />
            </div>

            <DropdownMenuItem 
              data-testid="button-logout"
              onClick={() => logout.mutate()}
              className="flex items-center gap-2 text-red-400 focus:text-red-300 focus:bg-red-500/20 cursor-pointer font-sans text-sm py-2 font-black tracking-wide"
            >
              <LogOut size={16} />
              EXIT TO MENU
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <InventoryModal open={inventoryOpen} onOpenChange={setInventoryOpen} user={user} />
    </div>
  );
}
