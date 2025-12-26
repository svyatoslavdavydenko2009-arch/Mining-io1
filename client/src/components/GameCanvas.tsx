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
  
  // Rarity check for grey biome (smaller patches)
  const greyNoise = getNoise(x + 5000, y + 5000, 0.08); 
  if (greyNoise > 0.83) {
    if (greyNoise > 0.96) return "#4a4a4a"; // Dark grey
    if (greyNoise > 0.90) return "#5c5c5c"; // Medium grey
    return "#6e6e6e"; // Light grey
  }

  if (noise > 0.75) return "#3d2b1f"; // Lighter brown patch
  if (noise > 0.5) return "#322319";  // Medium brown patch
  if (noise > 0.25) return "#2b1e15"; // Default dark brown
  return "#1e150f"; // Deep brown patch
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

  const joystickDirRef = useRef({ dx: 0, dy: 0 });

  const toggleFullscreen = useCallback(() => {
    onFullscreenChange?.(!isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  const isTileMined = (x: number, y: number) => minedTiles.has(`${x},${y}`);
  const getTileHealth = (x: number, y: number) => tileHealth[`${x},${y}`] || 0;

  const hasCollision = (x: number, y: number): boolean => {
    // Hexagon rock collision in grey biome + Stone resource collision
    // We check a 3x3 grid around the precise position
    const tx = Math.floor(x);
    const ty = Math.floor(y);

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
    
    const resource = getTileAt(targetX, targetY);
    const hasResource = resource && !isTileMined(targetX, targetY);
    
    const dx = targetX - localPos.x;
    const dy = targetY - localPos.y;
    const normalizedDx = dx !== 0 ? Math.sign(dx) : 0;
    const normalizedDy = dy !== 0 ? Math.sign(dy) : 0;
    
    if (normalizedDx !== 0) {
      setLookDir({ dx: normalizedDx, dy: 0 });
    } else if (normalizedDy !== 0) {
      setLookDir({ dx: 0, dy: normalizedDy });
    }

    if (Math.max(Math.abs(dx), Math.abs(dy)) > 1) return;

    setIsMining(true);
    setMiningTarget(hasResource ? { x: targetX, y: targetY } : null);
    let animStartTime = performance.now();
    const animateMining = (time: number) => {
      const elapsed = time - animStartTime;
      const progress = Math.min(elapsed / 1000, 1);
      setMiningRotation(progress < 0.75 ? (progress / 0.75) * -55 : -55 + (((progress - 0.75) / 0.25) * 120));
      if (progress < 1) requestAnimationFrame(animateMining);
      else {
        if (hasResource && resource) {
          const key = `${targetX},${targetY}`;
          const newHealth = (getTileHealth(targetX, targetY) || RESOURCE_HEALTH[resource]) - 1;
          setTileHealth(prev => ({ ...prev, [key]: newHealth }));
          if (newHealth <= 0) {
            const resDef = RESOURCES[resource];
            if (user.pickaxeLevel >= resDef.minPickaxeLevel) {
              createParticles(targetX, targetY, resDef.color);
              mine.mutate(resource, { onSuccess: () => {
                const id = Date.now();
                setMiningNotifications(prev => [...prev, { id, resource, x: targetX, y: targetY }]);
                setTimeout(() => setMiningNotifications(prev => prev.filter(n => n.id !== id)), 2000);
                setMiningTarget(null);
              }});
              setMinedTiles(prev => new Set(prev).add(key));
            } else {
              toast({ title: "Pickaxe too weak!", variant: "destructive" });
            }
          } else setMiningTarget(null);
        }
        let returnStartTime = performance.now();
        const animateReturn = (t: number) => {
          const p = Math.min((t - returnStartTime) / 400, 1);
          setMiningRotation(65 * (1 - p));
          if (p < 1) requestAnimationFrame(animateReturn);
          else { setIsMining(false); setMiningRotation(0); lastMineTime.current = Date.now(); setCooldownProgress(0); const cs = Date.now(); const uc = () => { const el = Date.now() - cs; const cp = Math.min(el/cooldown, 1); setCooldownProgress(cp); if (cp < 1) requestAnimationFrame(uc); }; requestAnimationFrame(uc); }
        };
        requestAnimationFrame(animateReturn);
      }
    };
    requestAnimationFrame(animateMining);
  };

  const handleMineButtonClick = () => {
    // Use current look direction or default to down
    const dx = lookDir.dx;
    const dy = lookDir.dy !== 0 ? lookDir.dy : 1;
    const targetX = Math.round(localPos.x + dx);
    const targetY = Math.round(localPos.y + dy);
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
    const targetX = localPos.x + relX;
    const targetY = localPos.y + relY;
    
    const resource = getTileAt(targetX, targetY);
    if (!resource || isTileMined(targetX, targetY)) return;

    const dx = targetX - localPos.x;
    const dy = targetY - localPos.y;
    const normalizedDx = dx !== 0 ? Math.sign(dx) : 0;
    const normalizedDy = dy !== 0 ? Math.sign(dy) : 0;
    
    if (normalizedDx !== 0) {
      setLookDir({ dx: normalizedDx, dy: 0 });
    } else if (normalizedDy !== 0) {
      setLookDir({ dx: 0, dy: normalizedDy });
    }

    if (Math.max(Math.abs(targetX - localPos.x), Math.abs(targetY - localPos.y)) > 1) return;

    const cooldown = MINING_COOLDOWNS[user.pickaxeLevel] || 1500;
    if (isMining || Date.now() - lastMineTime.current < cooldown) return;
    const resDef = RESOURCES[resource];
    if (user.pickaxeLevel < resDef.minPickaxeLevel) {
      toast({ title: "Pickaxe too weak!", variant: "destructive" });
      return;
    }
    setIsMining(true);
    setMiningTarget({ x: targetX, y: targetY });
    let animStartTime = performance.now();
    const animateMining = (time: number) => {
      const elapsed = time - animStartTime;
      const progress = Math.min(elapsed / 1000, 1);
      // Mirrored swing logic: start negative, go positive (relative to mirrored base)
      setMiningRotation(progress < 0.75 ? (progress / 0.75) * -55 : -55 + (((progress - 0.75) / 0.25) * 120));
      if (progress < 1) requestAnimationFrame(animateMining);
      else {
        const key = `${targetX},${targetY}`;
        const newHealth = (getTileHealth(targetX, targetY) || RESOURCE_HEALTH[resource]) - 1;
        setTileHealth(prev => ({ ...prev, [key]: newHealth }));
        if (newHealth <= 0) {
          createParticles(targetX, targetY, resDef.color);
          mine.mutate(resource, { onSuccess: () => {
            const id = Date.now();
            setMiningNotifications(prev => [...prev, { id, resource, x: targetX, y: targetY }]);
            setTimeout(() => setMiningNotifications(prev => prev.filter(n => n.id !== id)), 2000);
            setMiningTarget(null);
          }});
          setMinedTiles(prev => new Set(prev).add(key));
        } else setMiningTarget(null);
        let returnStartTime = performance.now();
        const animateReturn = (t: number) => {
          const p = Math.min((t - returnStartTime) / 400, 1);
          // Mirrored return logic
          setMiningRotation(65 * (1 - p));
          if (p < 1) requestAnimationFrame(animateReturn);
          else { setIsMining(false); setMiningRotation(0); lastMineTime.current = Date.now(); setCooldownProgress(0); const cs = Date.now(); const uc = () => { const el = Date.now() - cs; const cp = Math.min(el/cooldown, 1); setCooldownProgress(cp); if (cp < 1) requestAnimationFrame(uc); }; requestAnimationFrame(uc); }
        };
        requestAnimationFrame(animateReturn);
      }
    };
    requestAnimationFrame(animateMining);
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
      for (let dy = -drawRadius; dy <= drawRadius; dy++) {
        for (let dx = -drawRadius; dx <= drawRadius; dx++) {
          const wx = Math.round(localPos.x) + dx; const wy = Math.round(localPos.y) + dy;
          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
          
          ctx.fillStyle = getFloorColor(wx, wy); ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
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
              const res = RESOURCES[resType]; ctx.fillStyle = "#444"; ctx.beginPath(); ctx.roundRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4); ctx.fill();
              
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
                    ctx.strokeStyle = "#111";
                    ctx.lineWidth = 2;
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
      
      // Smoothly interpolate rotation
      let diff = targetRotation - smoothBodyRotation.current;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      smoothBodyRotation.current += diff * 0.15;
      const bodyRotation = smoothBodyRotation.current;
      
      // Draw Body
      ctx.save();
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(0, 0, pSize / 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Draw Eyes (following rotation)
      ctx.save();
      ctx.rotate(bodyRotation);
      ctx.fillStyle = "black";
      ctx.beginPath(); ctx.arc(-pSize / 4, -pSize / 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pSize / 4, -pSize / 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      
      const pickaxeColor = PICKAXE_COLORS[user.pickaxeLevel] || "#8B4513";
      
      ctx.save(); 
      // Pickaxe rotation follows look direction
      ctx.rotate(bodyRotation);
      // Pickaxe is always on the "left" relative to the front-facing direction (mirrored)
      ctx.translate(-pSize / 2, 0); 
      
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
        <button
          onClick={handleMineButtonClick}
          disabled={cooldownProgress < 1 || isMining}
          data-testid="button-mine"
          className="relative w-16 h-16 bg-gradient-to-br from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 border-2 border-yellow-800 disabled:border-gray-700 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-lg disabled:shadow-none font-pixel text-sm font-bold text-white"
        >
          <Pickaxe size={28} className="drop-shadow-lg" />
          {cooldownProgress < 1 && (
            <div className="absolute inset-1 rounded-md border-2 border-yellow-500 opacity-60" style={{
              clipPath: `inset(0 ${(1 - cooldownProgress) * 100}% 0 0)`
            }} />
          )}
        </button>
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
