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
  const stoneSeed = pseudoRandom(x + 2000, y + 2000);
  if (stoneSeed > 0.99) return "stone";
  return null;
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
  const [lookDir, setLookDir] = useState({ dx: 1, dy: 0 }); 
  const smoothBodyRotation = useRef(0);
  const smoothLookDir = useRef({ dx: 1, dy: 0 }); 
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
  const [miningAnimation, setMiningAnimation] = useState({ rotation: 0, offsetX: 0, offsetY: 0 });
  const [miningNotifications, setMiningNotifications] = useState<{id: number, resource: ResourceType, x: number, y: number}[]>([]);
  const [cooldownProgress, setCooldownProgress] = useState(1);
  const [lastMineTimeState, setLastMineTimeState] = useState(0);
  const [, setButtonUpdateTrigger] = useState(0); 

  const joystickDirRef = useRef({ dx: 0, dy: 0 });
  
  useEffect(() => {
    const interval = setInterval(() => {
      setButtonUpdateTrigger(t => t + 1);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = useCallback(() => {
    onFullscreenChange?.(!isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  const isTileMined = useCallback((x: number, y: number) => minedTiles.has(`${x},${y}`), [minedTiles]);
  const getTileHealth = useCallback((x: number, y: number) => tileHealth[`${x},${y}`] || 0, [tileHealth]);

  const hasCollision = useCallback((x: number, y: number): boolean => {
    const tx = Math.round(x);
    const ty = Math.round(y);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ntx = tx + dx;
        const nty = ty + dy;
        
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
  }, [isTileMined]);

  const triggerDash = (dx: number, dy: number) => {
    if (dx !== 0) dashScale.current = { x: 1.3, y: 0.8 };
    else if (dy !== 0) dashScale.current = { x: 0.8, y: 1.3 };
  };

  useEffect(() => {
    const dist = Math.abs(user.x - localPos.x) + Math.abs(user.y - localPos.y);
    if (dist > 5) setLocalPos({ x: user.x, y: user.y });
  }, [user.x, user.y, localPos.x, localPos.y]);

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

      let moveX = Math.abs(joyX) > 0.01 ? joyX : dx;
      let moveY = Math.abs(joyY) > 0.01 ? joyY : dy;

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
  }, [hasCollision]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastServerUpdate > 100 && (Math.abs(localPos.x - user.x) > 0.05 || Math.abs(localPos.y - user.y) > 0.05)) {
      move.mutate({ x: Math.round(localPos.x), y: Math.round(localPos.y) });
      setLastServerUpdate(now);
    }
  }, [localPos, user.x, user.y, move, lastServerUpdate]);

  const createParticles = useCallback((x: number, y: number, color: string) => {
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
  }, []);

  const processMiningHit = useCallback((targets: {x: number, y: number, resource: ResourceType}[]) => {
    targets.forEach(t => {
      const key = `${t.x},${t.y}`;
      const health = tileHealth[key] ?? RESOURCE_HEALTH[t.resource];
      const newHealth = health - 1;
      
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
          setMinedTiles(prev => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });
        } else {
          toast({ title: `Pickaxe too weak for ${resDef.name}!`, variant: "destructive" });
        }
      }
    });
    setMiningTarget(null);
  }, [tileHealth, user.pickaxeLevel, mine, createParticles, toast]);

  const performMining = useCallback((targetX: number, targetY: number) => {
    const cooldown = MINING_COOLDOWNS[user.pickaxeLevel] || 1500;
    if (isMining || Date.now() - lastMineTime.current < cooldown) return;
    
    const playerTileX = Math.round(localPos.x);
    const playerTileY = Math.round(localPos.y);
    
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
      setIsMining(true);
      setMiningTarget(null);
    } else {
      setIsMining(true);
      const mainTarget = targets.find(t => t.x === targetX && t.y === targetY) || targets[0];
      setMiningTarget({ x: mainTarget.x, y: mainTarget.y });
    }

    let animStartTime = performance.now();
    let hitProcessed = false;
    const animateMining = (time: number) => {
      const elapsed = time - animStartTime;
      const totalDuration = 1620; 
      const progress = Math.min(elapsed / totalDuration, 1);
      
      let rot = 0;

      if (progress < 0.35) {
        const p = progress / 0.35;
        const easedP = p * p * p;
        rot = easedP * -50; 
      } else if (progress < 0.55) {
        const p = (progress - 0.35) / 0.2;
        const easedP = p * p * (3 - 2 * p);
        rot = -50 + (easedP * 110);
      } else {
        const p = (progress - 0.55) / 0.45;
        const easedP = 1 - Math.pow(1 - p, 4);
        rot = 60 * (1 - easedP);
      }
      
      setMiningAnimation({ rotation: rot, offsetX: 0, offsetY: 0 });
      
      if (progress >= 0.55 && !hitProcessed) {
        hitProcessed = true;
        processMiningHit(targets);
      }
      
      if (progress < 1) requestAnimationFrame(animateMining);
      else {
        const now = Date.now();
        setIsMining(false);
        setMiningAnimation({ rotation: 0, offsetX: 0, offsetY: 0 });
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
    requestAnimationFrame(animateMining);
  }, [isMining, localPos, user.pickaxeLevel, isTileMined, processMiningHit]);

  const handleMineButtonClick = () => {
    let dirX = lookDir.dx;
    let dirY = lookDir.dy;
    if (dirX === 0 && dirY === 0) {
      dirX = 0; dirY = 1;
    }
    const mag = Math.sqrt(dirX * dirX + dirY * dirY);
    if (mag > 0) {
      dirX /= mag; dirY /= mag;
    }
    const playerTileX = Math.round(localPos.x);
    const playerTileY = Math.round(localPos.y);
    const targetX = playerTileX + Math.round(dirX);
    const targetY = playerTileY + Math.round(dirY);
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
    
    const dx = targetX - localPos.x;
    const dy = targetY - localPos.y;
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      setLookDir({ dx, dy });
    }
    
    performMining(targetX, targetY);
  };

  useEffect(() => {
    const update = () => {
      setParticles(prev => prev.map(p => ({ ...p, x: p.x + p.vx * 0.05, y: p.y + p.vy * 0.05, vy: p.vy + 0.15, life: p.life - 0.04 })).filter(p => p.life > 0));
      requestAnimationFrame(update);
    };
    const id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
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
      smoothedPos.current.x += (localPos.x - smoothedPos.current.x) * 0.2;
      smoothedPos.current.y += (localPos.y - smoothedPos.current.y) * 0.2;
      displayPlayerPos.current.x += (localPos.x - displayPlayerPos.current.x) * 0.2;
      displayPlayerPos.current.y += (localPos.y - displayPlayerPos.current.y) * 0.2;
      
      smoothLookDir.current.dx += (lookDir.dx - smoothLookDir.current.dx) * 0.08;
      smoothLookDir.current.dy += (lookDir.dy - smoothLookDir.current.dy) * 0.08;
      
      let targetSide = lookDir.dx < 0 ? 1 : 0;
      if (Math.abs(lookDir.dy) > Math.abs(lookDir.dx) && lookDir.dy < 0) {
        targetSide = 1 - targetSide;
      }
      smoothPickaxeSide.current += (targetSide - smoothPickaxeSide.current) * 0.05;
      
      dashScale.current.x += (1 - dashScale.current.x) * 0.15;
      dashScale.current.y += (1 - dashScale.current.y) * 0.15;

      const cx = rect.width / 2; const cy = rect.height / 2;
      
      ctx.fillStyle = "#1e150f"; ctx.fillRect(0, 0, rect.width, rect.height);

      const drawRadius = 12;
      for (let dy = -drawRadius; dy <= drawRadius; dy++) {
        for (let dx = -drawRadius; dx <= drawRadius; dx++) {
          const wx = Math.round(smoothedPos.current.x) + dx;
          const wy = Math.round(smoothedPos.current.y) + dy;
          const sx = cx + (wx - smoothedPos.current.x) * TILE_SIZE;
          const sy = cy + (wy - smoothedPos.current.y) * TILE_SIZE;
          ctx.fillStyle = getFloorColor(wx, wy);
          ctx.fillRect(sx, sy, TILE_SIZE + 1, TILE_SIZE + 1);
        }
      }

      for (let dy = -drawRadius; dy <= drawRadius; dy++) {
        for (let dx = -drawRadius; dx <= drawRadius; dx++) {
          const wx = Math.round(smoothedPos.current.x) + dx;
          const wy = Math.round(smoothedPos.current.y) + dy;
          const sx = cx + (wx - smoothedPos.current.x) * TILE_SIZE;
          const sy = cy + (wy - smoothedPos.current.y) * TILE_SIZE;
          
          const greyNoise = getNoise(wx + 5000, wy + 5000, 0.08);
          if (greyNoise > 0.83) {
            const rockSeed = pseudoRandom(wx + 777, wy + 777);
            if (rockSeed > 0.95) {
               ctx.fillStyle = "#4a4a4a";
               ctx.beginPath();
               ctx.arc(sx + TILE_SIZE/2, sy + TILE_SIZE/2, ROCK_SIZE/2, 0, Math.PI*2);
               ctx.fill();
            }
          }

          const resource = getTileAt(wx, wy);
          if (resource === "stone" && !isTileMined(wx, wy)) {
             ctx.fillStyle = RESOURCES.stone.color;
             ctx.fillRect(sx + 8, sy + 8, TILE_SIZE - 16, TILE_SIZE - 16);
          }
        }
      }

      particles.forEach(p => {
        const sx = cx + (p.x - smoothedPos.current.x) * TILE_SIZE;
        const sy = cy + (p.y - smoothedPos.current.y) * TILE_SIZE;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
      });
      ctx.globalAlpha = 1;

      const px = cx + (displayPlayerPos.current.x - smoothedPos.current.x) * TILE_SIZE;
      const py = cy + (displayPlayerPos.current.y - smoothedPos.current.y) * TILE_SIZE;
      
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(dashScale.current.x, dashScale.current.y);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath(); ctx.arc(0, 0, PLAYER_SIZE/2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      if (isMining || miningAnimation.rotation !== 0) {
        ctx.save();
        ctx.translate(px, py);
        const lookAngle = Math.atan2(smoothLookDir.current.dy, smoothLookDir.current.dx);
        ctx.rotate(lookAngle + (miningAnimation.rotation * Math.PI / 180));
        ctx.fillStyle = PICKAXE_COLORS[user.pickaxeLevel];
        ctx.fillRect(10, -2, 20, 4);
        ctx.restore();
      }

      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [localPos, lookDir, isMining, miningAnimation, user.pickaxeLevel, particles, isTileMined]);

  return (
    <div ref={containerRef} className="relative w-full aspect-square bg-black overflow-hidden rounded-lg border-4 border-secondary shadow-2xl">
      <canvas ref={canvasRef} onClick={handleCanvasClick} className="w-full h-full cursor-crosshair touch-none" />
      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none">
        <button 
          onClick={toggleFullscreen} 
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
      <div className="absolute bottom-12 left-12 z-50 pointer-events-auto">
        <Joystick 
          onMove={(dx, dy) => { joystickDirRef.current = { dx, dy }; }} 
          onEnd={() => { joystickDirRef.current = { dx: 0, dy: 0 }; }} 
        />
      </div>
      <div className="absolute bottom-12 right-12 z-50 pointer-events-auto">
        {(() => {
          const cooldown = MINING_COOLDOWNS[user.pickaxeLevel] || 1500;
          const timeSinceLastMine = Date.now() - lastMineTimeState;
          const isOnCooldown = timeSinceLastMine < cooldown;
          return (
            <button
              onClick={handleMineButtonClick}
              disabled={isMining || isOnCooldown}
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
    </div>
  );
}
