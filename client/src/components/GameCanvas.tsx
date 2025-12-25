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
  1: "#5D4037", // Wooden Pickaxe - matching the handle color for a primitive look
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
  const [lookDir, setLookDir] = useState({ dx: 0, dy: 0 }); // Direction player is looking
  const smoothLookDir = useRef({ dx: 0, dy: 0 }); // Smoothly interpolated look direction
  const displayPlayerPos = useRef({ x: user.x, y: user.y });
  const smoothedPos = useRef({ x: user.x, y: user.y }); // Smooth camera position
  const [lastServerUpdate, setLastServerUpdate] = useState(Date.now());
  const lastMoveTime = useRef(Date.now());
  const lastMineTime = useRef(Date.now());
  const lastMoveTimeForInterp = useRef(Date.now()); // Track move time for interpolation
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
        lastMoveTimeForInterp.current = now;
        setLookDir({ dx, dy });
        
        // Cancel mining immediately
        setIsMining(false);
        setMiningTarget(null);
        setMiningRotation(0);
        
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
        
        // Update looking direction
        if (e.key === "ArrowUp" || e.key === "w") setLookDir({ dx: 0, dy: -1 });
        if (e.key === "ArrowDown" || e.key === "s") setLookDir({ dx: 0, dy: 1 });
        if (e.key === "ArrowLeft" || e.key === "a") setLookDir({ dx: -1, dy: 0 });
        if (e.key === "ArrowRight" || e.key === "d") setLookDir({ dx: 1, dy: 0 });
      }

      setLocalPos(prev => {
        let next = { ...prev };
        
        let dx = 0;
        let dy = 0;

        if (e.key === "ArrowUp" || e.key === "w") {
          const testPos = { x: prev.x, y: prev.y - 1 };
          if (!hasCollision(testPos.x, testPos.y)) {
            next.y -= 1;
            dy = -1;
          }
        }
        if (e.key === "ArrowDown" || e.key === "s") {
          const testPos = { x: prev.x, y: prev.y + 1 };
          if (!hasCollision(testPos.x, testPos.y)) {
            next.y += 1;
            dy = 1;
          }
        }
        if (e.key === "ArrowLeft" || e.key === "a") {
          const testPos = { x: prev.x - 1, y: prev.y };
          if (!hasCollision(testPos.x, testPos.y)) {
            next.x -= 1;
            dx = -1;
          }
        }
        if (e.key === "ArrowRight" || e.key === "d") {
          const testPos = { x: prev.x + 1, y: prev.y };
          if (!hasCollision(testPos.x, testPos.y)) {
            next.x += 1;
            dx = 1;
          }
        }

        // Update looking direction and cancel mining if moved
        if (next.x !== prev.x || next.y !== prev.y) {
          setLookDir({ dx, dy });
          lastMoveTimeForInterp.current = Date.now();
          
          // Cancel mining immediately on logical move
          setIsMining(false);
          setMiningTarget(null);
          setMiningRotation(0);
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

    const animDuration = 1000; // Wind-up + strike duration (slower for realistic feel)
    const returnDuration = 400; // Return animation duration
    let animStartTime = performance.now();
    
    const animateMining = (time: number) => {
      const elapsed = time - animStartTime;
      const progress = Math.min(elapsed / animDuration, 1);
      
      // Smooth wind-up and strike animation with easing
      let angle;
      if (progress < 0.75) { // Wind-up phase (75% of time) - slower, smooth pull back
        const p = progress / 0.75;
        // Ease-in-out for smooth wind-up
        const eased = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
        angle = eased * -55; // Pull pickaxe back 55 degrees smoothly
      } else { // Strike phase (25% of time) - much faster swing forward
        const p = (progress - 0.75) / 0.25;
        // Ease-out cubic for a snappier strike
        const eased = 1 - Math.pow(1 - p, 3);
        angle = -55 + (eased * 120); // Strike forward 120 degrees total swing
      }
      
      setMiningRotation(angle);
      lastMoveTimeForInterp.current = time;
      
      if (progress < 1) {
        requestAnimationFrame(animateMining);
      } else {
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

        // --- START RETURN ANIMATION ---
        const strikeEndAngle = 65; // The angle at the end of strike phase
        const returnStartTime = performance.now();
        
        const animateReturn = (returnTime: number) => {
          const returnElapsed = returnTime - returnStartTime;
          const returnProgress = Math.min(returnElapsed / returnDuration, 1);
          
          // Ease-out cubic for smooth return
          const eased = 1 - Math.pow(1 - returnProgress, 3);
          const returnAngle = strikeEndAngle - (eased * strikeEndAngle); // Return to 0
          
          setMiningRotation(returnAngle);
          
          if (returnProgress < 1) {
            requestAnimationFrame(animateReturn);
          } else {
            setIsMining(false);
            setMiningRotation(0);
            
            // --- START COOLDOWN AFTER RETURN COMPLETES ---
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
        
        requestAnimationFrame(animateReturn);
      }
    };
    requestAnimationFrame(animateMining);
  };

  // Particle updates
  useEffect(() => {
    let lastTime = performance.now();
    const update = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

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
  }, []);

  // Render loop using requestAnimationFrame for maximum smoothness
  useEffect(() => {
    let frameId: number;
    
    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        frameId = requestAnimationFrame(render);
        return;
      }
      
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        frameId = requestAnimationFrame(render);
        return;
      }

      // Handle HiDPI
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      // Update positions EVERY frame
      const lerpFactor = 0.1;
      const lookLerpFactor = 0.15;

      // Smooth look direction
      smoothLookDir.current.dx += (lookDir.dx - smoothLookDir.current.dx) * lookLerpFactor;
      smoothLookDir.current.dy += (lookDir.dy - smoothLookDir.current.dy) * lookLerpFactor;

      // Smooth camera follows logical position
      smoothedPos.current.x += (localPos.x - smoothedPos.current.x) * lerpFactor;
      smoothedPos.current.y += (localPos.y - smoothedPos.current.y) * lerpFactor;
      
      // Smooth player follows logical position (independent of camera)
      displayPlayerPos.current.x += (localPos.x - displayPlayerPos.current.x) * lerpFactor;
      displayPlayerPos.current.y += (localPos.y - displayPlayerPos.current.y) * lerpFactor;
      
      const displayPos = smoothedPos.current;
      const playerPos = displayPlayerPos.current;

      // Clear
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, rect.width, rect.height);

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      // Draw Grid
      const drawRadius = VIEW_RADIUS + 2;
      for (let dy = -drawRadius; dy <= drawRadius; dy++) {
        for (let dx = -drawRadius; dx <= drawRadius; dx++) {
          const wx = Math.round(localPos.x) + dx;
          const wy = Math.round(localPos.y) + dy;

          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;

          ctx.fillStyle = (wx + wy) % 2 === 0 ? "#262626" : "#2a2a2a";
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

          if (!isTileMined(wx, wy)) {
            const resourceType = getTileAt(wx, wy);
            if (resourceType) {
              const res = RESOURCES[resourceType];
              ctx.fillStyle = "#444";
              ctx.beginPath();
              ctx.roundRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4);
              ctx.fill();

              ctx.fillStyle = res.color;
              ctx.fillRect(sx + 10, sy + 10, 8, 8);
              ctx.fillRect(sx + 24, sy + 16, 6, 6);
              ctx.fillRect(sx + 16, sy + 28, 8, 8);

              const health = getTileHealth(wx, wy);
              const maxHealth = RESOURCE_HEALTH[resourceType];
              if (health > 0 && health < maxHealth) {
                const healthPercent = health / maxHealth;
                const barWidth = TILE_SIZE - 8;
                const barHeight = 5;
                const bx = sx + 4;
                const by = sy + TILE_SIZE - 8;
                ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                ctx.beginPath();
                ctx.roundRect(bx, by, barWidth, barHeight, 2);
                ctx.fill();
                const fillColor = healthPercent > 0.5 ? "#22c55e" : healthPercent > 0.25 ? "#eab308" : "#ef4444";
                ctx.fillStyle = fillColor;
                ctx.beginPath();
                ctx.roundRect(bx, by, barWidth * healthPercent, barHeight, 2);
                ctx.fill();
              }
            }
          }
        }
      }

      // Draw Player
      ctx.fillStyle = "#fbbf24";
      const px = cx + (playerPos.x - displayPos.x) * TILE_SIZE - TILE_SIZE / 2 + 8;
      const py = cy + (playerPos.y - displayPos.y) * TILE_SIZE - TILE_SIZE / 2 + 8;
      const pSize = TILE_SIZE - 16;
      
      // Rounded corners for the player
      ctx.beginPath();
      ctx.roundRect(px, py, pSize, pSize, 8);
      ctx.fill();

      // Draw Held Pickaxe
      const pickaxeColor = PICKAXE_COLORS[user.pickaxeLevel] || "#8B4513";
      const isLookingLeft = lookDir.dx < 0;
      
      ctx.save();
      // Position pickaxe based on looking direction
      if (isLookingLeft) {
        ctx.translate(px, py + pSize / 2); // Left hand
        ctx.scale(-1, 1); // Flip horizontally
      } else {
        ctx.translate(px + pSize, py + pSize / 2); // Right hand
      }
      
      ctx.rotate((Math.PI / 4) + (miningRotation * Math.PI / 180));
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // Pickaxe Head - Sharper, thinner stylized shape
      const headY = -24;
      ctx.beginPath();
      ctx.moveTo(-14, headY + 4); // Thinner width
      ctx.quadraticCurveTo(0, headY - 8, 14, headY + 4); // Thinner top curve
      ctx.lineTo(10, headY + 6); // Sharper point
      ctx.quadraticCurveTo(0, headY - 2, -10, headY + 6); // Thinner bottom curve
      ctx.closePath();
      ctx.fillStyle = pickaxeColor;
      ctx.fill();
      // Pickaxe Handle - Slightly shorter to avoid overlapping with the head
      ctx.beginPath();
      ctx.moveTo(0, headY); 
      ctx.lineTo(0, 0); 
      ctx.strokeStyle = "#5D4037";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // Eyes - Circles
      ctx.fillStyle = "black";
      
      // Look direction from smoothLookDir ref for smooth animation
      const lookX = smoothLookDir.current.dx;
      const lookY = smoothLookDir.current.dy;
      
      // Calculate eye offset based on look direction
      const eyeOffsetX = lookX * 4; // Slightly more pronounced
      const eyeOffsetY = lookY * 4;
      
      ctx.beginPath();
      ctx.arc(px + 10 + eyeOffsetX, py + 13 + eyeOffsetY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 22 + eyeOffsetX, py + 13 + eyeOffsetY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Vignette
      const gradient = ctx.createRadialGradient(cx, cy, TILE_SIZE, cx, cy, TILE_SIZE * 5);
      gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.globalCompositeOperation = "source-over";

      // Particles
      particles.forEach(p => {
        const screenX = cx + (p.x - displayPos.x) * TILE_SIZE;
        const screenY = cy + (p.y - displayPos.y) * TILE_SIZE;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(screenX - 2, screenY - 2, 4, 4);
        ctx.globalAlpha = 1;
      });

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [localPos, user.pickaxeLevel, tileHealth, minedTiles, particles, miningRotation]);

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
      <AnimatePresence>
        {cooldownProgress < 1 && (
          <motion.div 
            initial={ { opacity: 0, scale: 0.8 } }
            animate={ { opacity: 1, scale: 1 } }
            exit={ { 
              opacity: 0, 
              scale: 1.1, 
              filter: "blur(10px)",
              transition: { duration: 0.8, ease: "easeOut" } 
            } }
            className="absolute top-[calc(50%+28px)] left-1/2 -translate-x-[60%] w-12 h-1.5 bg-black/50 border border-secondary rounded-full overflow-hidden pointer-events-none shadow-[0_0_10px_rgba(0,0,0,0.5)]"
          >
            <motion.div 
              className="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"
              initial={ { width: "0%" } }
              animate={ { width: `${cooldownProgress * 100}%` } }
              transition={ { duration: 0.1 } }
            />
          </motion.div>
        )}
      </AnimatePresence>

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
