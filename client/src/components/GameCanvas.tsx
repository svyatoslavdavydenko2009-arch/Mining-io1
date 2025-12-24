import { useEffect, useRef, useState, useCallback } from "react";
import { RESOURCES, type ResourceType, type User, PICKAXES } from "@shared/schema";
import { useGame } from "@/hooks/use-game";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Pickaxe, Hammer, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const TILE_SIZE = 48; // Size of each grid cell in pixels
const VIEW_RADIUS = 8; // How many tiles to show in each direction
const WORLD_SEED = 12345; // Fixed seed for consistent procedural gen

// Simple PRNG
function pseudoRandom(x: number, y: number) {
  const dot = x * 12.9898 + y * 78.233;
  const sin = Math.sin(dot) * 43758.5453;
  return sin - Math.floor(sin);
}

// Generate world at coordinate
function getTileAt(x: number, y: number): ResourceType | null {
  const val = pseudoRandom(x + WORLD_SEED, y + WORLD_SEED);
  
  // Rarity thresholds
  if (val > 0.98) return "diamond";
  if (val > 0.95) return "gold_ore";
  if (val > 0.90) return "iron_ore";
  if (val > 0.82) return "copper_ore";
  if (val > 0.65) return "stone";
  return null; // Empty ground
}

interface GameCanvasProps {
  user: User;
}

export function GameCanvas({ user }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [localPos, setLocalPos] = useState({ x: user.x, y: user.y });
  const [lastServerUpdate, setLastServerUpdate] = useState(Date.now());
  const { move, mine } = useGame();
  const { toast } = useToast();
  const [miningTarget, setMiningTarget] = useState<{x: number, y: number} | null>(null);
  const [activeMobileButtons, setActiveMobileButtons] = useState<Set<string>>(new Set());
  const mobileInputRef = useRef<NodeJS.Timeout>();

  // Handle mobile D-pad button press
  const handleMobileMove = (dx: number, dy: number) => {
    setLocalPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  // Sync local pos with server user pos when it changes remotely (e.g. login)
  // but don't overwrite local movement immediately to prevent jitter
  useEffect(() => {
    const dist = Math.abs(user.x - localPos.x) + Math.abs(user.y - localPos.y);
    if (dist > 5) { // Only snap if desync is large
      setLocalPos({ x: user.x, y: user.y });
    }
  }, [user.x, user.y]);

  // Handle Input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }

      setLocalPos(prev => {
        let next = { ...prev };
        if (e.key === "ArrowUp" || e.key === "w") next.y -= 1;
        if (e.key === "ArrowDown" || e.key === "s") next.y += 1;
        if (e.key === "ArrowLeft" || e.key === "a") next.x -= 1;
        if (e.key === "ArrowRight" || e.key === "d") next.x += 1;
        
        // Mining interaction
        if (e.key === " ") {
          // Attempt mine closest rock
          // For simplicity, just check the tile we are ON, or adjacent? 
          // Let's say we mine the tile we are attempting to move INTO if it's blocked? 
          // Or just press space to mine current tile? 
          // Standard: Space mines the tile you are standing on? Or nearest?
          // Let's make Space mine the tile UNDER the player if there is one.
          // Actually, usually you walk UP to a rock.
          // Let's implement: "Walk into rock to mine it" style logic for simplicity?
          // OR: click to mine.
        }

        return next;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync to server debounced
  useEffect(() => {
    const now = Date.now();
    if (now - lastServerUpdate > 500 && (localPos.x !== user.x || localPos.y !== user.y)) {
      move.mutate(localPos);
      setLastServerUpdate(now);
    }
    const timeout = setTimeout(() => {
        if (localPos.x !== user.x || localPos.y !== user.y) {
            move.mutate(localPos);
            setLastServerUpdate(Date.now());
        }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [localPos, user.x, user.y, move]);


  // Handle Mining Click
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert screen coords to grid coords relative to player center
    const centerX = canvasRef.current.width / 2;
    const centerY = canvasRef.current.height / 2;
    
    const relX = Math.floor((clickX - centerX + (TILE_SIZE/2)) / TILE_SIZE);
    const relY = Math.floor((clickY - centerY + (TILE_SIZE/2)) / TILE_SIZE);

    const targetX = localPos.x + relX;
    const targetY = localPos.y + relY;

    // Check distance - only adjacent
    const dist = Math.abs(targetX - localPos.x) + Math.abs(targetY - localPos.y);
    if (dist > 1.5) { // 1 diagonal or adjacent
      toast({ title: "Too far away!", variant: "destructive" });
      return;
    }

    const resource = getTileAt(targetX, targetY);
    if (!resource) return;

    // Check requirements
    const resDef = RESOURCES[resource];
    if (user.pickaxeLevel < resDef.minPickaxeLevel) {
      toast({ 
        title: "Pickaxe too weak!", 
        description: `Need level ${resDef.minPickaxeLevel} pickaxe. Upgrade in Crafting menu.`, 
        variant: "destructive" 
      });
      return;
    }

    setMiningTarget({ x: targetX, y: targetY });
    
    // Simulate mining delay visually?
    mine.mutate(resource, {
      onSuccess: (data) => {
        toast({ 
          title: `Mined ${resDef.name}!`, 
          className: "bg-green-900 border-green-500 text-white font-pixel" 
        });
        setMiningTarget(null);
      },
      onError: (err) => {
        toast({ title: "Failed to mine", description: err.message, variant: "destructive" });
        setMiningTarget(null);
      }
    });
  };

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle HiDPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    // Clear
    ctx.fillStyle = "#1a1a1a"; // Dark background
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Camera Center
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    // Draw Grid
    for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        const wx = localPos.x + dx;
        const wy = localPos.y + dy;

        // Screen coords
        const sx = cx + dx * TILE_SIZE - TILE_SIZE/2;
        const sy = cy + dy * TILE_SIZE - TILE_SIZE/2;

        // Draw Floor
        ctx.fillStyle = (wx + wy) % 2 === 0 ? "#262626" : "#2a2a2a"; // Checker pattern floor
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

        // Draw Resource
        // If we mined this recently (in miningTarget), don't draw it? 
        // Actually, we rely on server response/optimistic update. 
        // But since procedural gen is deterministic, it will reappear unless we store 'mined chunks'.
        // For this simple MVP, mined rocks don't disappear permanently in procedural logic because we don't store world state.
        // We just get resources.
        // BUT for visual feedback, we want it to vanish.
        // Let's assume mining just GIVES resource, doesn't destroy the infinite rock.
        // OR: add a 'mined' check if we had world state. 
        // We will make rocks flash when mining.

        const resourceType = getTileAt(wx, wy);
        if (resourceType) {
          const res = RESOURCES[resourceType];
          
          // Draw Rock Base
          ctx.fillStyle = "#444";
          ctx.beginPath();
          ctx.roundRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4);
          ctx.fill();

          // Draw Ore bits
          ctx.fillStyle = res.color;
          // Random ore spots
          ctx.fillRect(sx + 10, sy + 10, 8, 8);
          ctx.fillRect(sx + 24, sy + 16, 6, 6);
          ctx.fillRect(sx + 16, sy + 28, 8, 8);

          // Mining Overlay
          if (miningTarget?.x === wx && miningTarget?.y === wy) {
             ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
             ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // Draw Player
    ctx.fillStyle = "#fbbf24"; // Goldish player
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 10;
    
    // Simple character shape
    const px = cx - TILE_SIZE/2 + 8;
    const py = cy - TILE_SIZE/2 + 8;
    const pSize = TILE_SIZE - 16;
    
    ctx.fillRect(px, py, pSize, pSize);
    
    // Eyes
    ctx.fillStyle = "black";
    ctx.shadowBlur = 0;
    ctx.fillRect(px + 8, py + 10, 6, 6);
    ctx.fillRect(px + 20, py + 10, 6, 6);

    // Pickaxe Level indicator
    ctx.font = "10px 'Press Start 2P'";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(`LVL ${user.pickaxeLevel}`, cx, py - 10);

  }, [localPos, miningTarget, user.pickaxeLevel]); // Re-render when these change

  return (
    <div className="relative w-full h-[60vh] sm:h-[70vh] bg-black border-4 border-secondary rounded-lg overflow-hidden shadow-2xl">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-full cursor-crosshair active:cursor-grabbing"
      />
      
      {/* HUD Overlay */}
      <div className="absolute top-4 left-4 font-pixel text-white text-xs opacity-70">
        X: {localPos.x} Y: {localPos.y}
      </div>
      
      <AnimatePresence>
        {miningTarget && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          >
            <Pickaxe className="w-12 h-12 text-accent drop-shadow-lg" />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Mobile D-Pad Controls */}
      <div className="absolute bottom-24 left-4 md:hidden flex flex-col items-center gap-2">
        <motion.button
          whilePress={{ scale: 0.85 }}
          onMouseDown={() => handleMobileMove(0, -1)}
          onTouchStart={() => handleMobileMove(0, -1)}
          className="p-2 bg-primary/80 text-black rounded-lg hover:bg-primary transition-colors"
          data-testid="button-move-up"
        >
          <ChevronUp className="w-6 h-6" />
        </motion.button>
        <div className="flex gap-2">
          <motion.button
            whilePress={{ scale: 0.85 }}
            onMouseDown={() => handleMobileMove(-1, 0)}
            onTouchStart={() => handleMobileMove(-1, 0)}
            className="p-2 bg-primary/80 text-black rounded-lg hover:bg-primary transition-colors"
            data-testid="button-move-left"
          >
            <ChevronLeft className="w-6 h-6" />
          </motion.button>
          <motion.button
            whilePress={{ scale: 0.85 }}
            onMouseDown={() => handleMobileMove(0, 1)}
            onTouchStart={() => handleMobileMove(0, 1)}
            className="p-2 bg-primary/80 text-black rounded-lg hover:bg-primary transition-colors"
            data-testid="button-move-down"
          >
            <ChevronDown className="w-6 h-6" />
          </motion.button>
          <motion.button
            whilePress={{ scale: 0.85 }}
            onMouseDown={() => handleMobileMove(1, 0)}
            onTouchStart={() => handleMobileMove(1, 0)}
            className="p-2 bg-primary/80 text-black rounded-lg hover:bg-primary transition-colors"
            data-testid="button-move-right"
          >
            <ChevronRight className="w-6 h-6" />
          </motion.button>
        </div>
      </div>

      {/* Mobile Mine Button */}
      <motion.button
        whilePress={{ scale: 0.9 }}
        onClick={handleCanvasClick}
        className="absolute bottom-4 right-4 md:hidden p-3 bg-accent/80 text-white rounded-lg hover:bg-accent transition-colors font-pixel text-sm"
        data-testid="button-mine-mobile"
      >
        <Pickaxe className="w-5 h-5" />
      </motion.button>
      
      <div className="absolute bottom-4 right-4 hidden md:block text-xs font-pixel text-white/50 bg-black/50 p-2 rounded">
        Use WASD to Move • Click Adjacent to Mine
      </div>
    </div>
  );
}
