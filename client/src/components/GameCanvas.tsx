import { useEffect, useRef, useState, useCallback } from "react";
import { RESOURCES, type ResourceType, type User, PICKAXES } from "@shared/schema";
import { useGame } from "@/hooks/use-game";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Pickaxe, Hammer, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const TILE_SIZE = 48; // Size of each grid cell in pixels
const VIEW_RADIUS = 8; // How many tiles to show in each direction
const WORLD_SEED = 12345; // Fixed seed for consistent procedural gen

// Health values for each resource type
const RESOURCE_HEALTH: Record<ResourceType, number> = {
  stone: 2,
  copper_ore: 3,
  iron_ore: 4,
  gold_ore: 5,
  diamond: 6,
};

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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

// Pickaxe color mapping
const PICKAXE_COLORS: Record<number, string> = {
  1: "#8B4513", // Wood (Brown)
  2: "#808080", // Stone (Gray)
  3: "#D2691E", // Copper (Orange-ish)
  4: "#C0C0C0", // Iron (Silver)
  5: "#FFD700", // Gold (Yellow)
  6: "#00BFFF", // Diamond (Deep Sky Blue)
};

// Mining cooldown mapping (in ms)
const MINING_COOLDOWNS: Record<number, number> = {
  1: 1500,
  2: 1250,
  3: 1000,
  4: 900,
  5: 800,
  6: 750,
};

export function GameCanvas({ user }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [localPos, setLocalPos] = useState({ x: user.x, y: user.y });
  const [displayPos, setDisplayPos] = useState({ x: user.x, y: user.y }); // Smooth camera position
  const [lastServerUpdate, setLastServerUpdate] = useState(Date.now());
  const lastMoveTime = useRef(Date.now());
  const lastMineTime = useRef(Date.now());
  const { move, mine } = useGame();
  const { toast } = useToast();
  const [miningTarget, setMiningTarget] = useState<{x: number, y: number} | null>(null);
  
  // Track tile health: "x,y" -> health value
  const [tileHealth, setTileHealth] = useState<Record<string, number>>({});
  const [minedTiles, setMinedTiles] = useState<Set<string>>(new Set());
  
  // Particle effects
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isMining, setIsMining] = useState(false);
  const [miningRotation, setMiningRotation] = useState(0);
  const [miningNotifications, setMiningNotifications] = useState<{id: number, resource: ResourceType, x: number, y: number}[]>([]);
  const [cooldownProgress, setCooldownProgress] = useState(1); // 0 to 1

  // Check if a tile can be walked through (has collision)
  const hasCollision = (x: number, y: number): boolean => {
    // Can't walk through unmined tiles with resources
    if (isTileMined(x, y)) return false;
    const resource = getTileAt(x, y);
    return resource !== null;
  };

  // Handle mobile D-pad button press
  const handleMobileMove = (dx: number, dy: number) => {
    // Movement debounce - 250ms delay
    const now = Date.now();
    if (now - lastMoveTime.current < 250) return;
    lastMoveTime.current = now;

    setLocalPos(prev => {
      const nextX = prev.x + dx;
      const nextY = prev.y + dy;
      if (!hasCollision(nextX, nextY)) {
        return { x: nextX, y: nextY };
      }
      return prev; // Don't move if there's collision
    });
  };

  // Check if a tile has been mined
  const isTileMined = (x: number, y: number) => minedTiles.has(`${x},${y}`);

  // Get current health of a tile
  const getTileHealth = (x: number, y: number) => {
    return tileHealth[`${x},${y}`] || 0;
  };

  // Sync local pos with server user pos when it changes remotely (e.g. login)
  // but don't overwrite local movement immediately to prevent jitter
  useEffect(() => {
    const dist = Math.abs(user.x - localPos.x) + Math.abs(user.y - localPos.y);
    if (dist > 5) { // Only snap if desync is large
      setLocalPos({ x: user.x, y: user.y });
    }
  }, [user.x, user.y]);

  // Handle Input with movement delay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }

      // Movement debounce - 250ms delay between moves (increased from 200ms)
      const now = Date.now();
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key)) {
        if (now - lastMoveTime.current < 250) return; // Ignore if too soon
        lastMoveTime.current = now;
      }

      setLocalPos(prev => {
        let next = { ...prev };
        
        if (e.key === "ArrowUp" || e.key === "w") {
          const testPos = { x: prev.x, y: prev.y - 1 };
          if (!hasCollision(testPos.x, testPos.y)) next.y -= 1;
        }
        if (e.key === "ArrowDown" || e.key === "s") {
          const testPos = { x: prev.x, y: prev.y + 1 };
          if (!hasCollision(testPos.x, testPos.y)) next.y += 1;
        }
        if (e.key === "ArrowLeft" || e.key === "a") {
          const testPos = { x: prev.x - 1, y: prev.y };
          if (!hasCollision(testPos.x, testPos.y)) next.x -= 1;
        }
        if (e.key === "ArrowRight" || e.key === "d") {
          const testPos = { x: prev.x + 1, y: prev.y };
          if (!hasCollision(testPos.x, testPos.y)) next.x += 1;
        }

        return next;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [minedTiles]); // Include minedTiles in dependency

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


  // Create mining particles
  const createParticles = (x: number, y: number, color: string) => {
    const newParticles: Particle[] = [];
    const particleCount = 6; // Reduced volume
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = 0.5 + Math.random() * 1.5;
      newParticles.push({
        x: x + 0.5, // Center of block
        y: y + 0.5, // Center of block
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed - 1,
        life: 1,
        color: color,
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  // Handle Mining Click
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Get click position in CSS pixels
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert screen coords to grid coords relative to player center
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const relX = Math.round((clickX - centerX) / TILE_SIZE);
    const relY = Math.round((clickY - centerY) / TILE_SIZE);

    const targetX = localPos.x + relX;
    const targetY = localPos.y + relY;

    // Check distance - only adjacent (include diagonals)
    const dist = Math.max(Math.abs(targetX - localPos.x), Math.abs(targetY - localPos.y));
    if (dist > 1) {
      return; // Silent fail - too far away
    }

    // Skip if already fully mined
    if (isTileMined(targetX, targetY)) {
      return;
    }

    const resource = getTileAt(targetX, targetY);
    if (!resource) {
      return; // Silent fail - nothing to mine
    }

    // Mining cooldown based on level
    const cooldown = MINING_COOLDOWNS[user.pickaxeLevel] || 1500;
    const now = Date.now();
    if (isMining || now - lastMineTime.current < cooldown) return;

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

    // Start mining sequence
    setIsMining(true);
    setMiningTarget({ x: targetX, y: targetY });

    const animDuration = 400; // Fixed duration for realistic feel
    let animStartTime = performance.now();
    
    const animateMining = (time: number) => {
      const elapsed = time - animStartTime;
      const progress = Math.min(elapsed / animDuration, 1);
      
      // Real wind-up and strike
      let angle;
      if (progress < 0.6) { // Wind up (60% of time)
        const p = progress / 0.6;
        angle = p * -45; // Swing back further
      } else { // Strike (40% of time)
        const p = (progress - 0.6) / 0.4;
        angle = -45 + (p * 135); // Rapid strike to +90
      }
      
      setMiningRotation(angle);
      
      if (progress < 1) {
        requestAnimationFrame(animateMining);
      } else {
        setIsMining(false);
        setMiningRotation(0);
        
        // --- STRIKE EFFECT ---
        const key = `${targetX},${targetY}`;
        const currentHealth = getTileHealth(targetX, targetY);
        const maxHealth = RESOURCE_HEALTH[resource];
        const newHealth = currentHealth === 0 ? maxHealth - 1 : currentHealth - 1;

        // Update tile health
        setTileHealth(prev => ({ ...prev, [key]: newHealth }));

        if (newHealth === 0) {
          createParticles(targetX, targetY, RESOURCES[resource].color);
          mine.mutate(resource, {
            onSuccess: () => {
              const id = Date.now();
              setMiningNotifications(prev => [...prev, { id, resource, x: targetX, y: targetY }]);
              setTimeout(() => setMiningNotifications(prev => prev.filter(n => n.id !== id)), 2000);
              setMiningTarget(null);
            },
            onError: (err) => {
              toast({ title: "Failed to mine", description: err.message, variant: "destructive" });
              setMiningTarget(null);
              setMinedTiles(prev => {
                const newSet = new Set(prev);
                newSet.delete(key);
                return newSet;
              });
              setTileHealth(prev => {
                const h = { ...prev };
                delete h[key];
                return h;
              });
            }
          });
          setMinedTiles(prev => new Set(Array.from(prev).concat(key)));
        } else {
          setMiningTarget(null);
        }

        // --- START COOLDOWN AFTER STRIKE ---
        lastMineTime.current = Date.now();
        setCooldownProgress(0);
        const cooldownStartTime = Date.now();
        const updateCooldown = () => {
          const elapsed = Date.now() - cooldownStartTime;
          const cp = Math.min(elapsed / cooldown, 1);
          setCooldownProgress(cp);
          if (cp < 1) requestAnimationFrame(updateCooldown);
        };
        requestAnimationFrame(updateCooldown);
      }
    };
    requestAnimationFrame(animateMining);
  };

  // Smooth camera animation & particle updates
  useEffect(() => {
    let lastTime = performance.now();
    const update = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      setDisplayPos(prev => {
        const easing = 0.15;
        const dx = (localPos.x - prev.x) * easing;
        const dy = (localPos.y - prev.y) * easing;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return localPos;
        return { x: prev.x + dx, y: prev.y + dy };
      });

      // Update particles
      setParticles(prev => {
        if (prev.length === 0) return prev;
        return prev
          .map(p => ({
            ...p,
            x: p.x + p.vx * 0.05,
            y: p.y + p.vy * 0.05,
            vy: p.vy + 0.15,
            life: p.life - 0.04,
          }))
          .filter(p => p.life > 0);
      });

      requestAnimationFrame(update);
    };
    
    const frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [localPos]);

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

    // Camera Center (use smooth display position)
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    // Draw Grid
    for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        const wx = Math.floor(displayPos.x) + dx;
        const wy = Math.floor(displayPos.y) + dy;

        // Screen coords - convert world position to screen position
        // Player is always at screen center (cx, cy)
        // So tile at world (wx, wy) appears at screen position relative to camera
        const sx = cx + (wx - displayPos.x) * TILE_SIZE;
        const sy = cy + (wy - displayPos.y) * TILE_SIZE;

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

        // Skip if tile has been fully mined
        if (isTileMined(wx, wy)) {
          continue;
        }

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

          // Draw cracks based on health damage
          const health = getTileHealth(wx, wy);
          const maxHealth = RESOURCE_HEALTH[resourceType];
          const damagePercent = health > 0 ? (maxHealth - health) / maxHealth : 0;
          
          if (damagePercent > 0) {
            // Crack color based on resource color (lighter/softer)
            const resColor = RESOURCES[resourceType].color;
            ctx.strokeStyle = `rgba(0, 0, 0, ${0.4 + damagePercent * 0.5})`; // Intensity links to health
            ctx.lineWidth = 1.5 + damagePercent * 2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            
            // Texture: Sharp, jagged cracks from center
            const crackCount = Math.floor(damagePercent * 12) + 4;
            ctx.beginPath();
            for (let i = 0; i < crackCount; i++) {
              const seed = (wx * 11 + wy * 19 + i * 23) % 100 / 100;
              const angle = (i / crackCount) * Math.PI * 2 + (seed * 0.5);
              const maxLength = TILE_SIZE * 0.55; 
              const length = (10 + seed * 20) * damagePercent * 1.5; // Linked to damage
              
              let curX = sx + TILE_SIZE/2;
              let curY = sy + TILE_SIZE/2;
              
              ctx.moveTo(curX, curY);
              
              // Jagged segments
              const segments = 3;
              for(let j = 0; j < segments; j++) {
                const segAngle = angle + (Math.sin(j * seed * 12) * 0.3);
                const segLen = length / segments;
                curX += Math.cos(segAngle) * segLen;
                curY += Math.sin(segAngle) * segLen;
                ctx.lineTo(curX, curY);
              }
            }
            ctx.stroke();
          }

          // Draw Health Bar
          if (health > 0) {
            const healthPercent = health / maxHealth;
            const barWidth = TILE_SIZE - 8;
            const barHeight = 4;
            
            // Background
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.fillRect(sx + 4, sy + 2, barWidth, barHeight);
            
            // Health
            ctx.fillStyle = healthPercent > 0.5 ? "#22c55e" : healthPercent > 0.25 ? "#eab308" : "#ef4444";
            ctx.fillRect(sx + 4, sy + 2, barWidth * healthPercent, barHeight);
            
            // Border
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 4, sy + 2, barWidth, barHeight);
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

    // Draw Held Pickaxe
    const pickaxeColor = PICKAXE_COLORS[user.pickaxeLevel] || "#8B4513";
    ctx.save();
    ctx.translate(px + pSize, py + pSize / 2);
    // Base angle + smoother animation oscillation
    ctx.rotate((Math.PI / 4) + (miningRotation * Math.PI / 180));
    
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    // Pickaxe Head - Sharp stylized shape (Moved much higher)
    const headY = -24;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 8);
    ctx.quadraticCurveTo(0, headY - 12, 16, headY + 8); // Top curve
    ctx.lineTo(12, headY + 10);
    ctx.quadraticCurveTo(0, headY, -12, headY + 10); // Bottom inner curve
    ctx.closePath();
    
    ctx.fillStyle = pickaxeColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.stroke();
    
    // Pickaxe Handle - Directly connected to the head
    ctx.beginPath();
    ctx.moveTo(0, headY); 
    ctx.lineTo(0, 4);
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Small sleeve connecting the two
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(-3, headY - 2, 6, 6);
    
    ctx.restore();

    // Eyes
    ctx.fillStyle = "black";
    ctx.fillRect(px + 8, py + 10, 6, 6);
    ctx.fillRect(px + 20, py + 10, 6, 6);

    // Pickaxe Level indicator
    ctx.font = "10px 'Press Start 2P'";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(`LVL ${user.pickaxeLevel}`, cx, py - 10);

    // Draw Lighting System (Radial Gradient / Vignette)
    const gradient = ctx.createRadialGradient(cx, cy, TILE_SIZE, cx, cy, TILE_SIZE * 5);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
    
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.globalCompositeOperation = "source-over";

    // Draw Particles
    particles.forEach(p => {
      const screenX = cx + (p.x - displayPos.x) * TILE_SIZE;
      const screenY = cy + (p.y - displayPos.y) * TILE_SIZE;
      
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fillRect(screenX - 2, screenY - 2, 4, 4); // Smaller particles (4x4 instead of 8x8)
      ctx.globalAlpha = 1;
    });

  }, [displayPos, miningTarget, user.pickaxeLevel, tileHealth, minedTiles, particles]); // Re-render when these change

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

      {/* Mining Cooldown Bar */}
      <div className="absolute top-[calc(50%+24px)] left-1/2 -translate-x-1/2 w-12 h-1.5 bg-black/50 border border-secondary rounded-full overflow-hidden pointer-events-none">
        <motion.div 
          className="h-full bg-purple-500"
          initial={{ width: "100%" }}
          animate={{ width: `${cooldownProgress * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Mining Notifications */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence>
          {miningNotifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 50, opacity: 0 }}
              className="flex items-center gap-2 bg-black/70 p-2 border-2 border-primary rounded font-pixel text-xs text-white"
            >
              <span>+1</span>
              <div 
                className="w-4 h-4 rounded-sm" 
                style={{ backgroundColor: RESOURCES[notif.resource].color }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Mobile D-Pad Controls */}
      <div className="absolute bottom-4 left-4 md:hidden flex flex-col items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.85 }}
          onTouchStart={(e) => { e.preventDefault(); handleMobileMove(0, -1); }}
          className="p-2 bg-primary/80 text-black rounded-lg hover:bg-primary transition-colors"
          data-testid="button-move-up"
        >
          <ChevronUp className="w-6 h-6" />
        </motion.button>
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.85 }}
            onTouchStart={(e) => { e.preventDefault(); handleMobileMove(-1, 0); }}
            className="p-2 bg-primary/80 text-black rounded-lg hover:bg-primary transition-colors"
            data-testid="button-move-left"
          >
            <ChevronLeft className="w-6 h-6" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onTouchStart={(e) => { e.preventDefault(); handleMobileMove(0, 1); }}
            className="p-2 bg-primary/80 text-black rounded-lg hover:bg-primary transition-colors"
            data-testid="button-move-down"
          >
            <ChevronDown className="w-6 h-6" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onTouchStart={(e) => { e.preventDefault(); handleMobileMove(1, 0); }}
            className="p-2 bg-primary/80 text-black rounded-lg hover:bg-primary transition-colors"
            data-testid="button-move-right"
          >
            <ChevronRight className="w-6 h-6" />
          </motion.button>
        </div>
      </div>
      
      <div className="absolute bottom-4 right-4 hidden md:block text-xs font-pixel text-white/50 bg-black/50 p-2 rounded">
        Use WASD to Move • Click Adjacent to Mine
      </div>
    </div>
  );
}
