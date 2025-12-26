import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { User } from "@shared/schema";
import { StoneIcon } from "@/components/StoneIcon";

interface InventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

export function InventoryModal({ open, onOpenChange, user }: InventoryModalProps) {
  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center animate-in fade-in-50 duration-300"
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="bg-amber-900 border-2 border-secondary rounded-md p-6 max-w-md w-full mx-4 animate-in slide-in-from-bottom-50 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-primary font-pixel text-lg uppercase">Inventory</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-secondary/20 rounded transition-colors"
            data-testid="button-close-inventory"
          >
            <X size={20} className="text-secondary" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="border-t border-secondary/50 pt-4">
            <p className="text-muted-foreground text-xs font-pixel mb-2 uppercase">Explorer</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Username</p>
                <p className="text-foreground font-pixel">{user.username}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pickaxe Level</p>
                <p className="text-foreground font-pixel">{user.pickaxeLevel}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-secondary/50 pt-4">
            <p className="text-muted-foreground text-xs font-pixel mb-3 uppercase">Inventory</p>
            <div className="space-y-2">
              {Object.entries(user.inventory).length > 0 ? (
                Object.entries(user.inventory).map(([item, count]) => (
                  <div key={item} className="flex items-center gap-2">
                    <StoneIcon size={16} />
                    <p className="text-foreground text-xs">{item}: <span className="text-primary font-pixel">{count}</span></p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-xs">Empty</p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onOpenChange(false)}
          className="w-full mt-6 p-2 bg-black/60 hover:bg-black/80 border-2 border-secondary rounded-md text-white transition-all active:scale-95 font-pixel text-xs uppercase"
        >
          Close
        </button>
      </div>
    </div>
  );
}
