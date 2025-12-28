import { X, Trees } from "lucide-react";
import { Button } from "@/components/ui/button";
import { User, RESOURCES, ResourceType } from "@shared/schema";
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

function ResourceIcon({ type, size = 56 }: { type: string, size?: number }) {
  const resource = RESOURCES[type as ResourceType];
  const color = resource?.color || "#78716c";

  if (type === "wood") {
    const iconSize = size * 0.85;
    return (
      <div 
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <div 
          style={{ 
            width: iconSize, 
            height: iconSize, 
            backgroundColor: color,
            borderRadius: '8px',
            boxShadow: '0 0 0 3px rgba(0, 0, 0, 0.4)',
            border: '1.5px solid rgba(0, 0, 0, 0.5)'
          }} 
        />
      </div>
    );
  }

  const iconSize = size * 0.95; // Increased by 10% from 0.85
  return (
    <div 
      className="flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <StoneIcon size={iconSize} color="#57534e" />
    </div>
  );
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
          backgroundColor: '#3f2817',
          background: `
            linear-gradient(135deg, rgba(80, 50, 30, 0.4) 0%, transparent 50%),
            linear-gradient(225deg, rgba(60, 40, 25, 0.3) 0%, transparent 50%),
            #3f2817
          `,
          backgroundAttachment: 'fixed'
        }}
      >
        {/* Texture overlay */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
        />

        <div className="relative z-10 flex items-center justify-between mb-8">
          <h2 className="text-primary text-3xl font-bold uppercase tracking-widest font-sans antialiased" style={{ textRendering: 'optimizeLegibility', WebkitFontSmoothing: 'subpixel-antialiased' }}>INVENTORY</h2>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="border-t border-secondary/50 pt-6">
            <p className="text-white/90 text-2xl mb-5 font-bold uppercase tracking-widest font-sans antialiased" style={{ textRendering: 'optimizeLegibility' }}>Player</p>
            <div className="grid grid-cols-2 gap-6 text-2xl">
              <div>
                <p className="text-white/70 text-lg mb-2 uppercase font-medium tracking-widest font-sans antialiased" style={{ textRendering: 'optimizeLegibility' }}>Username</p>
                <p className="text-white font-bold text-2xl font-sans antialiased" style={{ textRendering: 'optimizeLegibility' }}>{user.username}</p>
              </div>
              <div>
                <p className="text-white/70 text-lg mb-2 uppercase font-medium tracking-widest font-sans antialiased" style={{ textRendering: 'optimizeLegibility' }}>Playtime</p>
                <p className="text-white font-bold text-2xl font-sans antialiased" style={{ textRendering: 'optimizeLegibility' }}>{playtime}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-secondary/50 pt-0 bg-black/30 -mx-6 px-6 pb-6">
            <p className="text-white/90 text-4xl mb-8 mt-4 font-bold uppercase tracking-widest font-sans antialiased" style={{ textRendering: 'optimizeLegibility', WebkitFontSmoothing: 'subpixel-antialiased' }}>Backpack</p>
            <div className="flex flex-wrap gap-10">
              {Object.entries(user.inventory).length > 0 ? (
                Object.entries(user.inventory).map(([item, count]) => (
                  <div key={item} className="flex flex-col items-center gap-3">
                    <ResourceIcon type={item} size={56} />
                    <p className="text-white/90 text-3xl font-bold font-sans antialiased" style={{ textRendering: 'optimizeLegibility' }}>{count}</p>
                  </div>
                ))
              ) : (
                <p className="text-white/60 text-2xl font-bold uppercase tracking-widest font-sans antialiased" style={{ textRendering: 'optimizeLegibility' }}>Empty</p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onOpenChange(false)}
          className="relative z-10 w-full mt-10 p-4 bg-black/60 hover:bg-black/80 border-2 border-secondary rounded-md text-slate-800 dark:text-slate-700 transition-all active:scale-95 text-xl font-black uppercase tracking-widest"
        >
          Close
        </button>
      </div>
    </div>
  );
}
