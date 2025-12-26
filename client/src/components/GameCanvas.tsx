import { Joystick } from "./Joystick";
import { useEffect, useRef, useState, useCallback } from "react";
import { RESOURCES, type ResourceType, type User, PICKAXES } from "@shared/schema";
import { useGame } from "@/hooks/use-game";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Pickaxe, Hammer, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";

const TILE_SIZE = 48; 
const VIEW_RADIUS = 8; 
const WORLD_SEED = 12345;
const PLAYER_SIZE = 32; // Player is 32px circle
const ROCK_SIZE = 32; // Rock is 32px hexagon
const COLLISION_DISTANCE_SQ = 0.40; // Distance squared for collision detection 

const RESOURCE_HEALTH: Record<ResourceType, number> = {
  stone: 2,
  copper_ore: 3,
  iron_ore: 4,
  gold_ore: 5,
  diamond: 6,
};

function pseudoRandom(x: number, y: number) {
  const dot = x * 12.9898 + y * 78.233;
  const sin = Math.sin(dot) * 43758.5453;
  return sin - Math.floor(sin);
}

// Organic noise using value noise approach
function getNoise(x: number, y: number, scale: number) {
  const x0 = Math.floor(x * scale);
  const y0 = Math.floor(y * scale);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  
  const sx = (x * scale) - x0;
  const sy = (y * scale) - y0;
  
  const n00 = pseudoRandom(x0 + WORLD_SEED, y0 + WORLD_SEED);
  const n10 = pseudoRandom(x1 + WORLD_SEED, y0 + WORLD_SEED);
  const n01 = pseudoRandom(x0 + WORLD_SEED, y1 + WORLD_SEED);
  const n11 = pseudoRandom(x1 + WORLD_SEED, y1 + WORLD_SEED);
  
  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  
  return nx0 * (1 - sy) + nx1 * sy;
}

// Organic floor noise for biomes with realistic blending
function getFloorColor(x: number, y: number): string {
  // Use multi-scale noise for more organic "cloud-like" patches
  const noise = getNoise(x, y, 0.05) * 0.7 + getNoise(x, y, 0.15) * 0.3;
  
  // Forest biome (dark green patches)
  const forestNoise = getNoise(x + 3000, y + 3000, 0.08);
  
  // rarity check for grey biome (smaller patches)
  const greyNoise = getNoise(x + 5000, y + 5000, 0.08);

  // Grass/Plains biome (main biome - grassland)
  const grassNoise = getNoise(x + 1000, y + 1000, 0.06);

  // Blend colors based on noise values for smoother transitions
  let r = 30, g = 21, b = 15; // Default deep brown

  // Less smooth blending - use step-like transitions
  const stepBlend = (val: number, threshold: number) => {
    if (val < threshold) return 0;
    if (val > threshold + 0.15) return 1;
    return (val - threshold) / 0.15;
  };

  if (forestNoise > 0.75) {
    const t = stepBlend(forestNoise, 0.75);
    // Blend with forest colors
    const targetR = forestNoise > 0.88 ? 26 : (forestNoise > 0.82 ? 45 : 58);
    const targetG = forestNoise > 0.88 ? 77 : (forestNoise > 0.82 ? 90 : 107);
    const targetB = forestNoise > 0.88 ? 46 : (forestNoise > 0.82 ? 61 : 74);
    r = r * (1 - t) + targetR * t;
    g = g * (1 - t) + targetG * t;
    b = b * (1 - t) + targetB * t;
  }
  
  if (greyNoise > 0.80) {
    const t = stepBlend(greyNoise, 0.80);
    const targetR = greyNoise > 0.96 ? 74 : (greyNoise > 0.90 ? 92 : 110);
    const targetG = targetR;
    const targetB = targetR;
    r = r * (1 - t) + targetR * t;
    g = g * (1 - t) + targetG * t;
    b = b * (1 - t) + targetB * t;
  }

  if (grassNoise > 0.50) {
    const t = stepBlend(grassNoise, 0.50);
    const targetR = grassNoise > 0.8 ? 54 : (grassNoise > 0.7 ? 68 : 86);
    const targetG = grassNoise > 0.8 ? 115 : (grassNoise > 0.7 ? 145 : 172);
    const targetB = grassNoise > 0.8 ? 70 : (grassNoise > 0.7 ? 84 : 102);
    r = r * (1 - t) + targetR * t;
    g = g * (1 - t) + targetG * t;
    b = b * (1 - t) + targetB * t;
  }

  // Base ground noise blending
  if (noise > 0.2) {
    const t = stepBlend(noise, 0.2);
    const targetR = noise > 0.75 ? 61 : (noise > 0.5 ? 50 : 43);
    const targetG = noise > 0.75 ? 43 : (noise > 0.5 ? 35 : 30);
    const targetB = noise > 0.75 ? 31 : (noise > 0.5 ? 25 : 21);
    r = r * (1 - t) + targetR * t;
    g = g * (1 - t) + targetG * t;
    b = b * (1 - t) + targetB * t;
  }

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function isBiomeBorder(x: number, y: number): boolean {
  const myColor = getFloorColor(x, y);
  const neighbors = [
    getFloorColor(x + 1, y),
    getFloorColor(x - 1, y),
    getFloorColor(x, y + 1),
    getFloorColor(x, y - 1)
  ];
  return neighbors.some(n => n !== myColor);
}

function getTileAt(x: number, y: number): ResourceType | null {
  // Stone appears roughly every 15-20 tiles uniformly distributed
  // Using pseudoRandom for deterministic but uniform distribution
  const stoneSeed = pseudoRandom(x + 2000, y + 2000);
  if (stoneSeed > 0.99) return "stone";
  return null;
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

const PICKAXE_COLORS: Record<number, string> = {
  1: "#5D4037", 
  2: "#808080", 
  3: "#D2691E", 
  4: "#C0C0C0", 
  5: "#FFD700", 
  6: "#00BFFF", 
};

const MINING_COOLDOWNS: Record<number, number> = {
  1: 1500,
  2: 1250,
  3: 1000,
  4: 900,
  5: 800,
  6: 750,
};

interface GameCanvasProps {
  user: User;
  isFullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

export function GameCanvas({ user, isFullscreen = false, onFullscreenChange }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localPos, setLocalPos] = useState({ x: user.x, y: user.y });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [lookDir, setLookDir] = useState({ dx: 0, dy: 0 }); 
  const smoothBodyRotation = useRef(0);
  const smoothLookDir = useRef({ dx: 0, dy: 0 }); 
  const smoothPickaxeSide = useRef(0); 
  const lastPickaxeSide = useRef(0);
  const dashScale = useRef({ x: 1, y: 1 });
  const displayPlayerPos = useRef({ x: user.x, y: user.y });
  const smoothedPos = useRef({ x: user.x, y: user.y }); 
  const [lastServerUpdate, setLastServerUpdate] = useState(Date.now());
  const lastMoveTime = useRef(Date.now());
  const lastMineTime = useRef(Date.now());
  const lastMoveTimeForInterp = useRef(Date.now()); 
  const { move, mine } = useGame();
  const { toast } = useToast();
  const [miningTarget, setMiningTarget] = useState<{x: number, y: number} | null>(null);
  const [tileHealth, setTileHealth] = useState<Record<string, number>>({});
  const [minedTiles, setMinedTiles] = useState<Set<string>>(new Set());
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isMining, setIsMining] = useState(false);
  const [miningRotation, setMiningRotation] = useState(0);
  const [miningNotifications, setMiningNotifications] = useState<{id: number, resource: ResourceType, x: number, y: number}[]>([]);
  const [cooldownProgress, setCooldownProgress] = useState(1);
  const [lastMineTimeState, setLastMineTimeState] = useState(0);
  const [, setButtonUpdateTrigger] = useState(0); // Force re-renders for button

  const joystickDirRef = useRef({ dx: 0, dy: 0 });
  
  // Update button state every 50ms so cooldown is responsive
  useEffect(() => {
    const interval = setInterval(() => {
      setButtonUpdateTrigger(t => t + 1);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = useCallback(() => {
    onFullscreenChange?.(!isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  const isTileMined = (x: number, y: number) => minedTiles.has(`${x},${y}`);
  const getTileHealth = (x: number, y: number) => tileHealth[`${x},${y}`] || 0;

  const hasCollision = (x: number, y: number): boolean => {
    // Hexagon rock collision in grey biome + Stone resource collision
    // We check a 3x3 grid around the precise position
    const tx = Math.round(x);
    const ty = Math.round(y);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ntx = tx + dx;
        const nty = ty + dy;
        
        // Check hexagon rocks in grey biome
        const greyNoise = getNoise(ntx + 5000, nty + 5000, 0.08);
        if (greyNoise > 0.83) {
          const rockSeed = pseudoRandom(ntx + 777, nty + 777);
          if (rockSeed > 0.95) {
            let hasNeighbor = false;
            for (let ny = -1; ny <= 1; ny++) {
              for (let nx = -1; nx <= 1; nx++) {
                if (nx === 0 && ny === 0) continue;
                if (pseudoRandom(ntx + nx + 777, nty + ny + 777) > 0.95) {
                  hasNeighbor = true;
                  break;
                }
              }
              if (hasNeighbor) break;
            }
            if (hasNeighbor) continue;

            const centerX = ntx;
            const centerY = nty;
            const distDx = x - centerX;
            const distDy = y - centerY;
            const distSq = distDx * distDx + distDy * distDy;
            
            if (distSq < COLLISION_DISTANCE_SQ) return true;
          }
        }
        
        // Check stone resource tiles
        const resource = getTileAt(ntx, nty);
        if (resource === "stone" && !isTileMined(ntx, nty)) {
          const centerX = ntx;
          const centerY = nty;
          const distDx = x - centerX;
          const distDy = y - centerY;
          const distSq = distDx * distDx + distDy * distDy;
          
          if (distSq < COLLISION_DISTANCE_SQ) return true;
        }
      }
    }
    return false;
  };

  const triggerDash = (dx: number, dy: number) => {
    if (dx !== 0) dashScale.current = { x: 1.3, y: 0.8 };
    else if (dy !== 0) dashScale.current = { x: 0.8, y: 1.3 };
  };

  const handleMobileMove = (dx: number, dy: number) => {
    const now = Date.now();
    if (now - lastMoveTime.current < 250) return;
    lastMoveTime.current = now;

    setLocalPos(prev => {
      const nextX = prev.x + dx;
      const nextY = prev.y + dy;
      if (!hasCollision(nextX, nextY)) {
        lastMoveTimeForInterp.current = now;
        setLookDir({ dx, dy });
        triggerDash(dx, dy);
        setIsMining(false); setMiningTarget(null); setMiningRotation(0);
        return { x: nextX, y: nextY };
      }
      return prev;
    });
  };

  useEffect(() => {
    const dist = Math.abs(user.x - localPos.x) + Math.abs(user.y - localPos.y);
    if (dist > 5) setLocalPos({ x: user.x, y: user.y });
  }, [user.x, user.y]);

  useEffect(() => {
    const keys: Record<string, boolean> = {};
    const handleKeyDown = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let frameId: number;
    const moveSpeed = 0.04;
    
    const updateMovement = () => {
      let dx = 0;
      let dy = 0;

      if (keys["w"] || keys["arrowup"]) dy -= 1;
      if (keys["s"] || keys["arrowdown"]) dy += 1;
      if (keys["a"] || keys["arrowleft"]) dx -= 1;
      if (keys["d"] || keys["arrowright"]) dx += 1;

      const joyX = joystickDirRef.current.dx;
      const joyY = joystickDirRef.current.dy;

      // Combine keyboard and joystick, prioritizing joystick if active
      let moveX = Math.abs(joyX) > 0.01 ? joyX : dx;
      let moveY = Math.abs(joyY) > 0.01 ? joyY : dy;

      // Normalize diagonal keyboard movement
      if (dx !== 0 && dy !== 0 && Math.abs(joyX) <= 0.01 && Math.abs(joyY) <= 0.01) {
        const mag = Math.sqrt(dx * dx + dy * dy);
        moveX = dx / mag;
        moveY = dy / mag;
      }

      if (Math.abs(moveX) > 0.001 || Math.abs(moveY) > 0.001) {
        setLocalPos(prev => {
          const nextX = prev.x + (moveX * moveSpeed);
          const nextY = prev.y + (moveY * moveSpeed);
          
          const canMoveX = !hasCollision(nextX, prev.y);
          const canMoveY = !hasCollision(prev.x, nextY);
          
          let updatedX = prev.x;
          let updatedY = prev.y;

          if (canMoveX) updatedX = nextX;
          if (canMoveY) updatedY = nextY;
          
          if (updatedX !== prev.x || updatedY !== prev.y) {
            setLookDir({ dx: moveX, dy: moveY });
            return { x: updatedX, y: updatedY };
          }
          return prev;
        });
      }
      frameId = requestAnimationFrame(updateMovement);
    };
    frameId = requestAnimationFrame(updateMovement);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      cancelAnimationFrame(frameId);
    };
  }, [minedTiles]);

  useEffect(() => {
    const now = Date.now();
    // Increase frequency of server updates and reduce distance threshold for sync
    if (now - lastServerUpdate > 200 && (Math.abs(localPos.x - user.x) > 0.1 || Math.abs(localPos.y - user.y) > 0.1)) {
      move.mutate({ x: Math.round(localPos.x), y: Math.round(localPos.y) });
      setLastServerUpdate(now);
    }
  }, [localPos, user.x, user.y, move]);

  const createParticles = (x: number, y: number, color: string) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 6; i++) {
      const speed = 0.5 + Math.random() * 1.5;
      newParticles.push({
        x: x + 0.5, y: y + 0.5,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed - 1,
        life: 1, color: color,
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  const performMining = (targetX: number, targetY: number) => {
    const cooldown = MINING_COOLDOWNS[user.pickaxeLevel] || 1500;
    if (isMining || Date.now() - lastMineTime.current < cooldown) return;
    
    // Use rounded player position for all calculations
    const playerTileX = Math.round(localPos.x);
    const playerTileY = Math.round(localPos.y);
    
    // Find all resources in radius
    const targets: {x: number, y: number, resource: ResourceType}[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = playerTileX + dx;
        const ty = playerTileY + dy;
        const resource = getTileAt(tx, ty);
        if (resource && !isTileMined(tx, ty)) {
          targets.push({ x: tx, y: ty, resource });
        }
      }
    }

    if (targets.length === 0) {
      // If no resource, don't change lookDir, just swing
      setIsMining(true);
      setMiningTarget(null);
    } else {
      // Don't change lookDir when mining, stay in movement direction
      // If we want to swing at something specific, we could, but let's prioritize movement direction as requested
      setIsMining(true);
      // We can still set the target for visual particles, but we don't need to rotate to it
      const mainTarget = targets.find(t => t.x === targetX && t.y === targetY) || targets[0];
      setMiningTarget({ x: mainTarget.x, y: mainTarget.y });
    }

    let animStartTime = performance.now();
    const animateMining = (time: number) => {
      const elapsed = time - animStartTime;
      const progress = Math.min(elapsed / 1000, 1);
      setMiningRotation(progress < 0.75 ? (progress / 0.75) * -55 : -55 + (((progress - 0.75) / 0.25) * 120));
      
      if (progress < 1) requestAnimationFrame(animateMining);
      else {
        // Process all targets in radius at the end of swing
        targets.forEach(t => {
          const key = `${t.x},${t.y}`;
          const newHealth = (getTileHealth(t.x, t.y) || RESOURCE_HEALTH[t.resource]) - 1;
          setTileHealth(prev => ({ ...prev, [key]: newHealth }));
          
          if (newHealth <= 0) {
            const resDef = RESOURCES[t.resource];
            if (user.pickaxeLevel >= resDef.minPickaxeLevel) {
              createParticles(t.x, t.y, resDef.color);
              mine.mutate(t.resource, { onSuccess: () => {
                const id = Date.now() + Math.random();
                setMiningNotifications(prev => [...prev, { id, resource: t.resource, x: t.x, y: t.y }]);
                setTimeout(() => setMiningNotifications(prev => prev.filter(n => n.id !== id)), 2000);
              }});
              setMinedTiles(prev => new Set(prev).add(key));
            } else {
              toast({ title: `Pickaxe too weak for ${resDef.name}!`, variant: "destructive" });
            }
          }
        });
        setMiningTarget(null);

        let returnStartTime = performance.now();
        const animateReturn = (t: number) => {
          const p = Math.min((t - returnStartTime) / 400, 1);
          setMiningRotation(65 * (1 - p));
          if (p < 1) requestAnimationFrame(animateReturn);
          else { 
            const now = Date.now();
            setIsMining(false);
            setMiningRotation(0);
            lastMineTime.current = now;
            setLastMineTimeState(now);
            setCooldownProgress(0);
            const cs = now;
            const uc = () => {
              const el = Date.now() - cs;
              const cp = Math.min(el/cooldown, 1);
              setCooldownProgress(cp);
              if (cp < 1) requestAnimationFrame(uc);
            };
            requestAnimationFrame(uc);
          }
        };
        requestAnimationFrame(animateReturn);
      }
    };
    requestAnimationFrame(animateMining);
  };

  const handleMineButtonClick = () => {
    // Get current look direction
    let dirX = lookDir.dx;
    let dirY = lookDir.dy;
    
    // Default to down if no direction set
    if (dirX === 0 && dirY === 0) {
      dirX = 0;
      dirY = 1;
    }
    
    // Normalize direction vector
    const mag = Math.sqrt(dirX * dirX + dirY * dirY);
    if (mag > 0) {
      dirX /= mag;
      dirY /= mag;
    }
    
    // Get current player tile position (rounded)
    const playerTileX = Math.round(localPos.x);
    const playerTileY = Math.round(localPos.y);
    
    // Target tile using rounded direction (allows 8 directions + diagonals)
    const targetX = playerTileX + Math.round(dirX);
    const targetY = playerTileY + Math.round(dirY);
    
    // Always swing even if no resource directly in front, as long as SOMETHING is in radius
    performMining(targetX, targetY);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const relX = Math.round((clickX - centerX) / TILE_SIZE);
    const relY = Math.round((clickY - centerY) / TILE_SIZE);
    const targetX = Math.round(localPos.x + relX);
    const targetY = Math.round(localPos.y + relY);
    
    // For manual clicks, we still want to look at what we click
    const dx = targetX - localPos.x;
    const dy = targetY - localPos.y;
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      setLookDir({ dx, dy });
    }
    
    performMining(targetX, targetY);
  };

  useEffect(() => {
    let lastTime = performance.now();
    const update = (time: number) => {
      setParticles(prev => prev.map(p => ({ ...p, x: p.x + p.vx * 0.05, y: p.y + p.vy * 0.05, vy: p.vy + 0.15, life: p.life - 0.04 })).filter(p => p.life > 0));
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    let frameId: number;
    const render = () => {
      const canvas = canvasRef.current; if (!canvas) { frameId = requestAnimationFrame(render); return; }
      const ctx = canvas.getContext("2d"); if (!ctx) { frameId = requestAnimationFrame(render); return; }
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
      smoothedPos.current.x += (localPos.x - smoothedPos.current.x) * 0.1;
      smoothedPos.current.y += (localPos.y - smoothedPos.current.y) * 0.1;
      displayPlayerPos.current.x += (localPos.x - displayPlayerPos.current.x) * 0.1;
      displayPlayerPos.current.y += (localPos.y - displayPlayerPos.current.y) * 0.1;
      smoothLookDir.current.dx += (lookDir.dx - smoothLookDir.current.dx) * 0.15;
      smoothLookDir.current.dy += (lookDir.dy - smoothLookDir.current.dy) * 0.15;
      
      let targetSide = lookDir.dx < 0 ? 1 : 0;
      if (Math.abs(lookDir.dy) > Math.abs(lookDir.dx) && lookDir.dy < 0) {
        targetSide = 1 - targetSide;
      }
      smoothPickaxeSide.current += (targetSide - smoothPickaxeSide.current) * 0.05;
      
      const distanceFromCenter = Math.abs(smoothPickaxeSide.current - 0.5);
      const isNearCenter = distanceFromCenter < 0.3; 

      dashScale.current.x += (1 - dashScale.current.x) * 0.15;
      dashScale.current.y += (1 - dashScale.current.y) * 0.15;

      const displayPos = smoothedPos.current; const playerPos = displayPlayerPos.current;
      const cx = rect.width / 2; const cy = rect.height / 2;
      
      ctx.fillStyle = "#1e150f"; ctx.fillRect(0, 0, rect.width, rect.height);

      // Render Biome Floors
      const drawRadius = 12; // Increased radius to ensure large rocks don't clip at edges
      
      // Draw a solid dark brown layer first to ensure no gaps at all
      ctx.fillStyle = "#1e150f";
      ctx.fillRect(cx - (drawRadius + 1) * TILE_SIZE, cy - (drawRadius + 1) * TILE_SIZE, (drawRadius + 1) * 2 * TILE_SIZE, (drawRadius + 1) * 2 * TILE_SIZE);

      for (let dy = -drawRadius; dy <= drawRadius; dy++) {
        for (let dx = -drawRadius; dx <= drawRadius; dx++) {
          const wx = Math.round(localPos.x) + dx; const wy = Math.round(localPos.y) + dy;
          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
          
          ctx.fillStyle = getFloorColor(wx, wy); 
          
          if (isBiomeBorder(wx, wy)) {
            // Draw a rounded rectangle that is slightly larger but uses the same color
            // This creates a "blobby" border effect without gaps because it overlays the base grid
            const sizeBonus = TILE_SIZE * 0.4; // Significantly more bonus for overlap
            ctx.beginPath();
            ctx.roundRect(sx - sizeBonus / 2, sy - sizeBonus / 2, TILE_SIZE + sizeBonus, TILE_SIZE + sizeBonus, 16);
            ctx.fill();
          } else {
            // Standard tile fill, slightly oversized to overlap
            ctx.fillRect(sx - 0.5, sy - 0.5, TILE_SIZE + 1, TILE_SIZE + 1);
          }
        }
      }

      // Render Resources and Rocks in a separate pass to ensure proper layering and prevent clipping
      for (let dy = -drawRadius; dy <= drawRadius; dy++) {
        for (let dx = -drawRadius; dx <= drawRadius; dx++) {
          const wx = Math.round(localPos.x) + dx; const wy = Math.round(localPos.y) + dy;
          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;

          if (!isTileMined(wx, wy)) {
            const resType = getTileAt(wx, wy);
            if (resType) {
              const res = RESOURCES[resType]; 
              
              // Draw outline
              ctx.strokeStyle = "rgba(0,0,0,0.4)";
              ctx.lineWidth = 2;
              
              if (resType === "stone") {
                ctx.fillStyle = "#444";
                // Draw pentagon for stone with random rotation
                ctx.beginPath();
                const centerX = sx + TILE_SIZE / 2;
                const centerY = sy + TILE_SIZE / 2;
                const radius = (TILE_SIZE - 8) / 2;
                // Deterministic random rotation based on tile position
                const randomRotation = pseudoRandom(wx + 4000, wy + 4000) * Math.PI * 2;
                for (let i = 0; i < 5; i++) {
                  const angle = (i * 2 * Math.PI / 5) - Math.PI / 2 + randomRotation;
                  const x = centerX + radius * Math.cos(angle);
                  const y = centerY + radius * Math.sin(angle);
                  if (i === 0) ctx.moveTo(x, y);
                  else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
              } else {
                ctx.fillStyle = "#444";
                ctx.beginPath(); ctx.roundRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4); ctx.fill();
                ctx.stroke();
              }
              
              if (resType !== "stone") {
                ctx.fillStyle = res.color; ctx.fillRect(sx + 10, sy + 10, 8, 8); ctx.fillRect(sx + 24, sy + 16, 6, 6); ctx.fillRect(sx + 16, sy + 28, 8, 8);
              }
              
              const h = tileHealth[`${wx},${wy}`] || RESOURCE_HEALTH[resType]; const mh = RESOURCE_HEALTH[resType];
              if (h < mh) {
                const hp = h / mh; ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.roundRect(sx + 4, sy + TILE_SIZE - 8, TILE_SIZE - 8, 5, 2); ctx.fill();
                ctx.fillStyle = hp > 0.5 ? "#22c55e" : hp > 0.25 ? "#eab308" : "#ef4444"; ctx.beginPath(); ctx.roundRect(sx + 4, sy + TILE_SIZE - 8, (TILE_SIZE - 8) * hp, 5, 2); ctx.fill();
              }
            } else {
              // Draw hexagon rocks in grey biome
              const greyNoise = getNoise(wx + 5000, wy + 5000, 0.08);
              if (greyNoise > 0.83) {
                const rockSeed = pseudoRandom(wx + 777, wy + 777);
                if (rockSeed > 0.95) {
                  let hasNeighbor = false;
                  for (let ny = -1; ny <= 1; ny++) {
                    for (let nx = -1; nx <= 1; nx++) {
                      if (nx === 0 && ny === 0) continue;
                      if (pseudoRandom(wx + nx + 777, wy + ny + 777) > 0.95) {
                        hasNeighbor = true;
                        break;
                      }
                    }
                    if (hasNeighbor) break;
                  }
                  
                  if (!hasNeighbor) {
                    ctx.fillStyle = "#333";
                    ctx.strokeStyle = "rgba(0,0,0,0.4)";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    const rockSize = 32;
                    // Visual offset to center the hexagon on the tile center (sx + TILE_SIZE/2, sy + TILE_SIZE/2)
                    const renderCenterX = sx + TILE_SIZE / 2;
                    const renderCenterY = sy + TILE_SIZE / 2;
                    for (let i = 0; i < 6; i++) {
                      const angle = (Math.PI / 3) * i;
                      const hx = renderCenterX + Math.cos(angle) * rockSize;
                      const hy = renderCenterY + Math.sin(angle) * rockSize;
                      if (i === 0) ctx.moveTo(hx, hy);
                      else ctx.lineTo(hx, hy);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                  }
                }
              }
            }
          }
        }
      }

      const px = cx + (playerPos.x - displayPos.x) * TILE_SIZE - TILE_SIZE / 2 + 8;
      const py = cy + (playerPos.y - displayPos.y) * TILE_SIZE - TILE_SIZE / 2 + 8;
      const pSize = TILE_SIZE - 16;
      ctx.save(); ctx.translate(px + pSize / 2, py + pSize / 2); ctx.scale(dashScale.current.x, dashScale.current.y);

      // Determine rotation based on look direction
      let targetRotation = Math.atan2(smoothLookDir.current.dy, smoothLookDir.current.dx) + Math.PI / 2;
      
      // Smoothly interpolate rotation for both body and pickaxe base
      let diff = targetRotation - smoothBodyRotation.current;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      smoothBodyRotation.current += diff * 0.15;
      const bodyRotation = smoothBodyRotation.current;
      
      // Draw Body
      ctx.save();
      ctx.rotate(bodyRotation);
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(0, 0, pSize / 2, 0, Math.PI * 2); ctx.fill();
      
      // Draw Eyes (relative to body rotation)
      ctx.fillStyle = "black";
      ctx.beginPath(); ctx.arc(-pSize / 4, -pSize / 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pSize / 4, -pSize / 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      const pickaxeColor = PICKAXE_COLORS[user.pickaxeLevel] || "#8B4513";
      
      ctx.save(); 
      // Pickaxe rotation follows the same smooth body rotation
      ctx.rotate(bodyRotation);
      
      // Pickaxe is always on the "left" relative to the front-facing direction (mirrored)
      ctx.translate(-pSize / 2, 0); 
      
      // Swing rotation
      ctx.rotate(-(Math.PI / 4) + (miningRotation * Math.PI / 180));
      const headY = -24; ctx.beginPath(); ctx.moveTo(-14, headY + 4); ctx.quadraticCurveTo(0, headY - 8, 14, headY + 4); ctx.lineTo(10, headY + 6); ctx.quadraticCurveTo(0, headY - 2, -10, headY + 6); ctx.closePath();
      ctx.fillStyle = pickaxeColor; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, headY); ctx.lineTo(0, 0); ctx.strokeStyle = "#5D4037"; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();

      ctx.restore(); // Restore main player transform

      const grad = ctx.createRadialGradient(cx, cy, TILE_SIZE, cx, cy, TILE_SIZE * 5);
      particles.forEach(p => { const sx = cx + (p.x - displayPos.x) * TILE_SIZE; const sy = cy + (p.y - displayPos.y) * TILE_SIZE; ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(sx - 2, sy - 2, 4, 4); ctx.globalAlpha = 1; });
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [localPos, user.pickaxeLevel, tileHealth, minedTiles, particles, miningRotation, lookDir]);

  return (
    <div ref={containerRef} className={`relative bg-black overflow-hidden shadow-2xl transition-all ${isFullscreen ? 'fixed inset-0 w-screen h-screen border-0 rounded-none z-50' : 'w-full h-[60vh] sm:h-[70vh] border-4 border-secondary rounded-lg'}`}>
      <canvas ref={canvasRef} onClick={handleCanvasClick} className="w-full h-full cursor-crosshair active:cursor-grabbing" />
      <AnimatePresence>{cooldownProgress < 1 && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }} className="absolute top-[calc(50%+28px)] left-1/2 -translate-x-1/2 w-12 h-1.5 bg-black/50 border border-secondary rounded-full overflow-hidden shadow-[0_0_10px_rgba(0,0,0,0.5)]">
          <motion.div className="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" initial={{ width: "0%" }} animate={{ width: `${cooldownProgress * 100}%` }} transition={{ duration: 0.1 }} />
        </motion.div>
      )}</AnimatePresence>
      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none">
        <button 
          onClick={toggleFullscreen} 
          data-testid="button-fullscreen-toggle"
          className="pointer-events-auto p-2 bg-black/80 hover:bg-black/95 border border-secondary rounded-md text-white transition-colors"
        >
          {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
        <AnimatePresence>{miningNotifications.map((n) => (
          <motion.div key={n.id} initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} className="bg-black/80 border border-secondary px-3 py-1.5 rounded-md flex items-center gap-2 shadow-lg">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RESOURCES[n.resource].color }} />
            <span className="text-white text-xs font-pixel uppercase tracking-wider">Mined {RESOURCES[n.resource].name}</span>
          </motion.div>
        ))}</AnimatePresence>
      </div>
      {/* Joystick on left */}
      <div className="absolute bottom-12 left-12 z-50 pointer-events-auto">
        <Joystick 
          onMove={(dx, dy) => { 
            joystickDirRef.current = { dx, dy }; 
          }} 
          onEnd={() => { 
            joystickDirRef.current = { dx: 0, dy: 0 }; 
          }} 
        />
      </div>
      {/* Mine button on right */}
      <div className="absolute bottom-12 right-12 z-50 pointer-events-auto">
        {(() => {
          const cooldown = MINING_COOLDOWNS[user.pickaxeLevel] || 1500;
          const timeSinceLastMine = Date.now() - lastMineTimeState;
          const isOnCooldown = timeSinceLastMine < cooldown;
          return (
            <button
              onClick={handleMineButtonClick}
              disabled={isMining || isOnCooldown}
              data-testid="button-mine"
              className="relative w-16 h-16 bg-gradient-to-br from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 border-2 border-yellow-800 disabled:border-gray-700 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-lg disabled:shadow-none font-pixel text-sm font-bold text-white"
            >
              <Pickaxe size={28} className="drop-shadow-lg" />
              {isOnCooldown && (
                <div className="absolute inset-1 rounded-md border-2 border-yellow-500 opacity-60" style={{
                  clipPath: `inset(0 ${(1 - (Math.min(timeSinceLastMine, cooldown) / cooldown)) * 100}% 0 0)`
                }} />
              )}
            </button>
          );
        })()}
      </div>
      {/* Mini-map */}
      <div className="absolute top-4 left-4 w-32 h-32 bg-black/60 border-2 border-secondary rounded-lg overflow-hidden pointer-events-none shadow-xl">
        <canvas 
          id="minimap-canvas"
          width={128}
          height={128}
          className="w-full h-full opacity-80"
          ref={(el) => {
            if (!el) return;
            const mctx = el.getContext("2d");
            if (!mctx) return;
            mctx.clearRect(0, 0, 128, 128);
            const range = 20; // Tiles to show
            const mTileSize = 128 / (range * 2);
            for (let my = -range; my <= range; my++) {
              for (let mx = -range; mx <= range; mx++) {
                const wx = Math.round(localPos.x) + mx;
                const wy = Math.round(localPos.y) + my;
                mctx.fillStyle = getFloorColor(wx, wy);
                mctx.fillRect(64 + mx * mTileSize, 64 + my * mTileSize, mTileSize, mTileSize);
              }
            }
            // Draw player
            mctx.fillStyle = "#fbbf24";
            mctx.beginPath();
            mctx.arc(64, 64, 3, 0, Math.PI * 2);
            mctx.fill();
          }}
        />
      </div>
    </div>
  );
}
