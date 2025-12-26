import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { User } from "@shared/schema";
import { StoneIcon } from "@/components/StoneIcon";

interface InventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

function calculatePlaytime(createdAt: string | Date): string {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
  return `${diffMins}m`;
}

export function InventoryModal({ open, onOpenChange, user }: InventoryModalProps) {
  if (!open) return null;

  const playtime = calculatePlaytime(user.createdAt);

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center animate-in fade-in-50 duration-300"
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="relative border-2 border-secondary rounded-md p-6 max-w-md w-full mx-4 animate-in slide-in-from-bottom-50 duration-300 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: `
            linear-gradient(135deg, rgba(180, 83, 9, 0.3) 0%, transparent 50%),
            linear-gradient(225deg, rgba(140, 65, 10, 0.2) 0%, transparent 50%),
            #3f2817
          `,
          backgroundAttachment: 'fixed'
        }}
      >
        {/* Texture overlay */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px),
              repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)
            `
          }}
        />

        <div className="relative z-10 flex items-center justify-between mb-8">
          <h2 className="text-primary text-4xl font-black uppercase tracking-widest">Inventory</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-secondary/20 rounded transition-colors"
            data-testid="button-close-inventory"
          >
            <X size={24} className="text-secondary" />
          </button>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="border-t border-secondary/50 pt-6">
            <p className="text-secondary text-2xl mb-5 font-black uppercase tracking-widest">Explorer</p>
            <div className="grid grid-cols-2 gap-6 text-2xl">
              <div>
                <p className="text-muted-foreground text-lg mb-2 uppercase font-bold">Username</p>
                <p className="text-foreground font-black antialiased text-2xl">{user.username}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-lg mb-2 uppercase font-bold">Playtime</p>
                <p className="text-foreground font-black antialiased text-2xl">{playtime}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-secondary/50 pt-6">
            <p className="text-secondary text-2xl mb-5 font-black uppercase tracking-widest">Inventory</p>
            <div className="flex flex-wrap gap-10">
              {Object.entries(user.inventory).length > 0 ? (
                Object.entries(user.inventory).map(([item, count]) => (
                  <div key={item} className="flex flex-col items-center gap-3">
                    <StoneIcon size={56} />
                    <p className="text-foreground text-3xl font-black antialiased">{count}</p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-2xl">Empty</p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onOpenChange(false)}
          className="relative z-10 w-full mt-10 p-4 bg-black/60 hover:bg-black/80 border-2 border-secondary rounded-md text-white transition-all active:scale-95 text-xl font-black uppercase tracking-widest"
        >
          Close
        </button>
      </div>
    </div>
  );
}
