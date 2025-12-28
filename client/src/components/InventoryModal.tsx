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

        <div className="relative z-10 space-y-8">
          <div className="pt-0 -mx-6 px-6">
            <p className="text-white text-5xl mb-6 mt-2 font-bold uppercase tracking-tighter font-sans antialiased" style={{ 
              textRendering: 'optimizeLegibility', 
              WebkitFontSmoothing: 'antialiased',
              letterSpacing: '-0.02em',
              lineHeight: '1.2'
            }}>Crafting</p>
            
            {/* Crafting Grid matching the image style */}
            <div 
              className="grid grid-cols-4 gap-2 p-3 rounded-md shadow-2xl" 
              style={{ 
                backgroundColor: '#7d5c3d', // Outer brown frame color from image
                border: '4px solid #2a1b0e', // Darker thick outer border
                boxShadow: 'inset 0 0 15px rgba(0,0,0,0.4)'
              }}
            >
              {[...Array(16)].map((_, i) => (
                <div 
                  key={i} 
                  className="aspect-square rounded-sm flex items-center justify-center transition-all hover:brightness-110 cursor-pointer"
                  style={{ 
                    backgroundColor: '#e6cc9b', // Light beige/yellow cell color from image
                    border: '2px solid #5d432c', // Inner grid line color
                    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.2)'
                  }}
                >
                  <div className="w-full h-full opacity-0 hover:opacity-100 bg-white/10 transition-opacity" />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 bg-black/40 -mx-6 px-6 pb-8 rounded-t-xl">
            <p className="text-white text-5xl mb-10 mt-2 font-bold uppercase tracking-tighter font-sans antialiased" style={{ 
              textRendering: 'optimizeLegibility', 
              WebkitFontSmoothing: 'antialiased',
              letterSpacing: '-0.02em',
              lineHeight: '1.2'
            }}>Backpack</p>
            <div className="flex flex-wrap gap-12">
              {Object.entries(user.inventory).length > 0 ? (
                Object.entries(user.inventory).map(([item, count]) => (
                  <div key={item} className="flex flex-col items-center gap-4">
                    <ResourceIcon type={item} size={64} />
                    <p className="text-white text-4xl font-bold font-sans antialiased" style={{ 
                      textRendering: 'optimizeLegibility',
                      WebkitFontSmoothing: 'antialiased'
                    }}>{count}</p>
                  </div>
                ))
              ) : (
                <p className="text-white/60 text-3xl font-bold uppercase tracking-widest font-sans antialiased">Empty</p>
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
