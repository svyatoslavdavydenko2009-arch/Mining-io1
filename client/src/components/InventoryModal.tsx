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
        className="relative border-2 border-secondary rounded-md p-4 max-w-sm w-full mx-4 animate-in slide-in-from-bottom-50 duration-300 overflow-hidden"
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

        <div className="relative z-10 space-y-4">
          <div className="pt-0 -mx-4 px-4">
            <p className="text-white text-3xl mb-3 mt-1 font-bold uppercase tracking-tighter font-sans antialiased" style={{ 
              textRendering: 'optimizeLegibility', 
              WebkitFontSmoothing: 'antialiased',
              letterSpacing: '-0.01em',
              lineHeight: '1.1'
            }}>Crafting</p>
            
            {/* Crafting Grid matching the image style - 4x2 size */}
            <div 
              className="grid grid-cols-4 gap-1.5 p-2 rounded-md shadow-xl" 
              style={{ 
                backgroundColor: '#7d5c3d', 
                border: '3px solid #2a1b0e', 
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.4)'
              }}
            >
              {[...Array(8)].map((_, i) => (
                <div 
                  key={i} 
                  className="aspect-square rounded-sm flex items-center justify-center transition-all hover:brightness-110 cursor-pointer"
                  style={{ 
                    backgroundColor: '#e6cc9b', 
                    border: '1.5px solid #5d432c', 
                    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.1)'
                  }}
                >
                  <div className="w-full h-full opacity-0 hover:opacity-100 bg-white/10 transition-opacity" />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 bg-black/40 -mx-4 px-4 pb-6 rounded-t-lg">
            <p className="text-white text-3xl mb-6 mt-1 font-bold uppercase tracking-tighter font-sans antialiased" style={{ 
              textRendering: 'optimizeLegibility', 
              WebkitFontSmoothing: 'antialiased',
              letterSpacing: '-0.01em',
              lineHeight: '1.1'
            }}>Backpack</p>
            <div className="flex flex-wrap gap-6">
              {Object.entries(user.inventory).length > 0 ? (
                Object.entries(user.inventory).map(([item, count]) => (
                  <div key={item} className="flex flex-col items-center gap-2">
                    <ResourceIcon type={item} size={48} />
                    <p className="text-white text-2xl font-bold font-sans antialiased" style={{ 
                      textRendering: 'optimizeLegibility',
                      WebkitFontSmoothing: 'antialiased'
                    }}>{count}</p>
                  </div>
                ))
              ) : (
                <p className="text-white/60 text-xl font-bold uppercase tracking-widest font-sans antialiased">Empty</p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onOpenChange(false)}
          className="relative z-10 w-full mt-4 p-3 bg-black/60 hover:bg-black/80 border-2 border-secondary rounded-md text-white transition-all active:scale-95 text-lg font-black uppercase tracking-widest"
        >
          Close
        </button>
      </div>
    </div>
  );
}
