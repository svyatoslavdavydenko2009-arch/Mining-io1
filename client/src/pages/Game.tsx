import { useAuth } from "@/hooks/use-auth";
import { useGame } from "@/hooks/use-game";
import { GameCanvas } from "@/components/GameCanvas";
import { PICKAXES } from "@shared/schema";
import { Settings, LogOut, X } from "lucide-react";
import { useState } from "react";
import { PixelButton } from "@/components/PixelButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Game() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      <GameCanvas user={user} isFullscreen={true} onFullscreenChange={() => {}} />
      
      <div className="absolute top-4 right-4 z-[60]">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button 
              data-testid="button-settings"
              className="p-2 bg-black/60 hover:bg-black/80 border-2 border-secondary rounded-md text-white transition-all active:scale-95 backdrop-blur-sm shadow-lg"
            >
              <Settings size={24} className={open ? "animate-spin-slow" : ""} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-black/90 border-2 border-secondary p-2 min-w-[160px] backdrop-blur-md">
            <div className="px-2 py-1.5 mb-2 border-b border-secondary/50">
              <p className="text-[10px] font-pixel text-muted-foreground uppercase">Settings</p>
            </div>
            <DropdownMenuItem 
              data-testid="button-logout"
              onClick={() => logout.mutate()}
              className="flex items-center gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer font-pixel text-xs py-2"
            >
              <LogOut size={16} />
              EXIT TO MENU
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
