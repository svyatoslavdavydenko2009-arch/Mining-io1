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
  const [lookDir, setLookDir] = useState({ dx: 1, dy: 0 }); 
  const lastLookDirRef = useRef({ dx: 1, dy: 0 }); 
  const smoothBodyRotation = useRef(0);
  const smoothLookDir = useRef({ dx: 1, dy: 0 }); 
  const smoothPickaxeSide = useRef(0); 
  const lastPickaxeSide = useRef(0);
  const dashScale = useRef({ x: 1, y: 1 });
  const displayPlayerPos = useRef({ x: user.x, y: user.y });
  const smoothedPos = useRef({ x: user.x, y: user.y }); 
  const hitProcessed = useRef(false);
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
  const [shakingTiles, setShakingTiles] = useState<Record<string, { x: number, y: number }>>({});
  const [miningNotifications, setMiningNotifications] = useState<{id: number, resource: ResourceType, x: number, y: number}[]>([]);
  const [miningDirection, setMiningDirection] = useState<{x: number, y: number} | null>(null);
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
          
          // Scale collision distance based on stone size
          const sizeSeed = pseudoRandom(ntx + 3000, nty + 3000);
          const rockScale = 0.7 + sizeSeed * 1.5;
          const scaledCollisionDist = COLLISION_DISTANCE_SQ * rockScale;
          
          if (distSq < scaledCollisionDist) return true;
        }
      }
    }
    return false;
  };

  const triggerDash = (dx: number, dy: number) => {
    if (dx !== 0) dashScale.current = { x: 1.3, y: 0.8 };
    else if (dy !== 0) dashScale.current = { x: 0.8, y: 1.3 };
  };

  useEffect(() => {
    // Force the character to look right initially or after reset
    setLookDir({ dx: 1, dy: 0 });
    lastLookDirRef.current = { dx: 1, dy: 0 };
  }, []);

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
        setIsMining(false); setMiningTarget(null); setMiningAnimation({ rotation: 0, offsetX: 0, offsetY: 0 });
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
    // Sync displayPlayerPos when mining starts to prevent jerking
    if (isMining) {
      displayPlayerPos.current.x = smoothedPos.current.x;
      displayPlayerPos.current.y = smoothedPos.current.y;
    }
  }, [isMining]);

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

      // Always update lookDir from joystick or keyboard to prevent snapping
      if (Math.abs(joyX) > 0.01 || Math.abs(joyY) > 0.01) {
        // Joystick active - update look direction immediately
        setLookDir({ dx: joyX, dy: joyY });
        lastLookDirRef.current = { dx: joyX, dy: joyY };
      } else if (dx !== 0 || dy !== 0) {
        // Keyboard active - update look direction
        const normalizedDx = dx / Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const normalizedDy = dy / Math.max(1, Math.sqrt(dx * dx + dy * dy));
        setLookDir({ dx: normalizedDx, dy: normalizedDy });
        lastLookDirRef.current = { dx: normalizedDx, dy: normalizedDy };
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
          
          return { x: updatedX, y: updatedY };
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
    // Throttle movement updates significantly (max 4 per second) to reduce server load
    // Only update if moved more than a half tile or if it's been a while
    const moveThreshold = 0.5;
    const timeThreshold = 250;
    
    if (now - lastServerUpdate > timeThreshold && 
        (Math.abs(localPos.x - user.x) > moveThreshold || Math.abs(localPos.y - user.y) > moveThreshold)) {
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
    
    // Set initial mining direction but it will now update dynamically
    setMiningDirection({ x: lookDir.dx, y: lookDir.dy });
    
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

    const processMiningHit = () => {
      targets.forEach(t => {
        const key = `${t.x},${t.y}`;
        
        // Add shake effect
        setShakingTiles(prev => ({ ...prev, [key]: { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 } }));
        setTimeout(() => {
          setShakingTiles(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }, 100);

        // Calculate dynamic health based on scale seed used in render
        const sizeSeed = pseudoRandom(t.x + 3000, t.y + 3000);
        const rockScale = 0.7 + sizeSeed * 1.5;
        const maxHealth = rockScale <= 1.0 ? 2 : rockScale <= 1.5 ? 3 : 4;

        const currentHealth = tileHealth[key] !== undefined ? tileHealth[key] : maxHealth;
        const newHealth = currentHealth - 1;
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
    };

    let animStartTime = performance.now();
    hitProcessed.current = false;
    const animateMining = (time: number) => {
      const elapsed = time - animStartTime;
      const totalDuration = 1620; // Increased total duration by 35% (1200 * 1.35)
      const progress = Math.min(elapsed / totalDuration, 1);
      
      let rot = 0;
      let offX = 0;
      let offY = 0;

      if (progress < 0.35) {
        // Wind up backwards (to the left/back for left hand)
        const p = progress / 0.35;
        const easedP = p * p * p;
        rot = easedP * -50; 
      } else if (progress < 0.55) {
        // Fast swing forward (from 35% to 55%)
        const p = (progress - 0.35) / 0.2;
        const easedP = p * p * (3 - 2 * p); // Smoothstep
        rot = -50 + (easedP * 110);
      } else {
        // Slow return to neutral (45% of total time)
        const p = (progress - 0.55) / 0.45;
        const easedP = 1 - Math.pow(1 - p, 4); // Quartic easing for maximum smoothness
        rot = 60 * (1 - easedP);
      }
      
      setMiningAnimation({ rotation: rot, offsetX: 0, offsetY: 0 });
      
      // Sync damage application with the hit moment (0.55 progress)
      if (progress >= 0.55 && !hitProcessed.current) {
        hitProcessed.current = true;
        processMiningHit();
      }
      
      if (progress < 1) requestAnimationFrame(animateMining);
      else {
        // Process mining completion directly
        const now = Date.now();
        setIsMining(false);
        setMiningDirection(null);
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
    // Mining via clicking the world has been disabled to focus on the button-based controls.
    // Clicks on the canvas no longer trigger mining.
    return;
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
      smoothedPos.current.x += (localPos.x - smoothedPos.current.x) * 0.2;
      smoothedPos.current.y += (localPos.y - smoothedPos.current.y) * 0.2;
      displayPlayerPos.current.x += (localPos.x - displayPlayerPos.current.x) * 0.2;
      displayPlayerPos.current.y += (localPos.y - displayPlayerPos.current.y) * 0.2;
      
      // Smooth look direction - responsive to joystick input
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

      // Render Biome Regions
      // Limit draw radius to actual visible area
      const drawRadius = 10;
      const biomeTiles: Record<string, {wx: number, wy: number, sx: number, sy: number}[]> = {};
      
      const startX = Math.round(localPos.x) - drawRadius;
      const endX = Math.round(localPos.x) + drawRadius;
      const startY = Math.round(localPos.y) - drawRadius;
      const endY = Math.round(localPos.y) + drawRadius;

      for (let wy = startY; wy <= endY; wy++) {
        for (let wx = startX; wx <= endX; wx++) {
          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
          
          // Skip if off screen
          if (sx + TILE_SIZE < 0 || sx > rect.width || sy + TILE_SIZE < 0 || sy > rect.height) continue;
          
          const color = getFloorColor(wx, wy);
          if (!biomeTiles[color]) biomeTiles[color] = [];
          biomeTiles[color].push({wx, wy, sx, sy});
        }
      }

      // Helper to calculate perceived brightness for layering
      const getBrightness = (color: string) => {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return (r * 299 + g * 587 + b * 114) / 1000;
      };

      // Draw each biome region as a unified shape, sorted by brightness
      // First, draw a base layer of the darkest possible color to ensure no gaps at all
      ctx.fillStyle = "#1a120b";
      ctx.fillRect(0, 0, rect.width, rect.height);

      Object.entries(biomeTiles)
        .sort(([colorA], [colorB]) => getBrightness(colorA) - getBrightness(colorB))
        .forEach(([color, tiles]) => {
          ctx.fillStyle = color;
          
          // Draw all tiles in this biome as a single solid mass first
          tiles.forEach(t => {
            ctx.fillRect(t.sx - 0.5, t.sy - 0.5, TILE_SIZE + 1.1, TILE_SIZE + 1.1);
          });
          
          // Then draw the "organic" rounded overlaps only on the borders
          // BUT only if this biome is brighter than its neighbors or it's a border tile
          tiles.forEach(t => {
            if (isBiomeBorder(t.wx, t.wy)) {
              const sizeBonus = TILE_SIZE * 0.05; // Extremely small overlap to eliminate the "blob" grid
              ctx.beginPath();
              // Minimal rounding to maintain the "tile" structure but soften the hard corners
              ctx.roundRect(t.sx - sizeBonus / 2, t.sy - sizeBonus / 2, TILE_SIZE + sizeBonus, TILE_SIZE + sizeBonus, 4);
              ctx.fill();
            }
          });
        });

      // Render Resources and Rocks in a separate pass
      for (let wy = startY; wy <= endY; wy++) {
        for (let wx = startX; wx <= endX; wx++) {
          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
          
          // Skip if off screen
          if (sx + TILE_SIZE < 0 || sx > rect.width || sy + TILE_SIZE < 0 || sy > rect.height) continue;

          if (!isTileMined(wx, wy)) {
            const resType = getTileAt(wx, wy);
            if (resType) {
              const res = RESOURCES[resType]; 
              const shake = shakingTiles[`${wx},${wy}`] || { x: 0, y: 0 };
              
              // Deterministic visual offset and size for variety
              const seedX = wx + 1000;
              const seedY = wy + 1000;
              const sizeSeed = pseudoRandom(wx + 3000, wy + 3000);
              const rockScale = 0.7 + sizeSeed * 1.5; // Range: 0.7 to 2.2
              
              const offsetX = (pseudoRandom(seedX, seedY) - 0.5) * 12 + shake.x;
              const offsetY = (pseudoRandom(wx + 2000, wy + 2000) - 0.5) * 12 + shake.y;
              const dsx = sx + offsetX;
              const dsy = sy + offsetY;

              // Draw outline
              ctx.strokeStyle = "rgba(0,0,0,0.4)";
              ctx.lineWidth = 2;
              
              ctx.save();
              ctx.translate(dsx + TILE_SIZE / 2, dsy + TILE_SIZE / 2);
              ctx.scale(rockScale, rockScale);
              ctx.translate(-(dsx + TILE_SIZE / 2), -(dsy + TILE_SIZE / 2));

              if (resType === "stone") {
                ctx.fillStyle = "#444";
                // Draw pentagon for stone with random rotation
                ctx.beginPath();
                const centerX = dsx + TILE_SIZE / 2;
                const centerY = dsy + TILE_SIZE / 2;
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
                ctx.beginPath(); ctx.roundRect(dsx + 4, dsy + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4); ctx.fill();
                ctx.stroke();
              }
              
              if (resType !== "stone") {
                ctx.fillStyle = res.color; 
                ctx.fillRect(dsx + 10, dsy + 10, 8, 8); 
                ctx.fillRect(dsx + 24, dsy + 16, 6, 6); 
                ctx.fillRect(dsx + 16, dsy + 28, 8, 8);
              }
              ctx.restore();
              
              const h = tileHealth[`${wx},${wy}`] !== undefined ? tileHealth[`${wx},${wy}`] : (
                rockScale <= 1.0 ? 2 :
                rockScale <= 1.5 ? 3 : 4
              );
              const mh = rockScale <= 1.0 ? 2 : rockScale <= 1.5 ? 3 : 4;
              
              if (h < mh) {
                const hp = h / mh; 
                // Adjust health bar size based on rock scale
                const barWidth = (TILE_SIZE - 8) * rockScale;
                const barX = dsx + TILE_SIZE / 2 - barWidth / 2;
                // Position health bar below the stone texture, scaled with rock size
                const stoneRadius = (TILE_SIZE - 8) / 2;
                const barY = dsy + TILE_SIZE / 2 + stoneRadius * rockScale + 4;
                
                ctx.fillStyle = "rgba(0,0,0,0.5)"; 
                ctx.beginPath(); 
                ctx.roundRect(barX, barY, barWidth, 5, 2); 
                ctx.fill();
                
                ctx.fillStyle = hp > 0.5 ? "#22c55e" : hp > 0.25 ? "#eab308" : "#ef4444"; 
                ctx.beginPath(); 
                ctx.roundRect(barX, barY, barWidth * hp, 5, 2); 
                ctx.fill();
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
                    const shake = shakingTiles[`${wx},${wy}`] || { x: 0, y: 0 };
                    const sizeSeed = pseudoRandom(wx + 6000, wy + 6000);
                    const rockScale = 0.7 + sizeSeed * 1.5; // Range: 0.7 to 2.2
                    
                    // Deterministic visual offset for rocks
                    const offsetX = (pseudoRandom(wx + 888, wy + 888) - 0.5) * 16 + shake.x;
                    const offsetY = (pseudoRandom(wx + 999, wy + 999) - 0.5) * 16 + shake.y;
                    const dsx = sx + offsetX;
                    const dsy = sy + offsetY;

                    ctx.fillStyle = "#333";
                    ctx.strokeStyle = "rgba(0,0,0,0.4)";
                    ctx.lineWidth = 2;
                    
                    ctx.save();
                    ctx.translate(dsx + TILE_SIZE / 2, dsy + TILE_SIZE / 2);
                    ctx.scale(rockScale, rockScale);
                    ctx.translate(-(dsx + TILE_SIZE / 2), -(dsy + TILE_SIZE / 2));
                    
                    ctx.beginPath();
                    const rockSize = 32;
                    // Visual offset to center the hexagon on the tile center (dsx + TILE_SIZE/2, dsy + TILE_SIZE/2)
                    const renderCenterX = dsx + TILE_SIZE / 2;
                    const renderCenterY = dsy + TILE_SIZE / 2;
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
                    ctx.restore();
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

      // Determine target rotation based on look direction
      let targetRotation = Math.atan2(smoothLookDir.current.dy, smoothLookDir.current.dx) + Math.PI / 2;
      
      // Smooth body rotation - responsive to joystick changes
      let diff = targetRotation - smoothBodyRotation.current;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      smoothBodyRotation.current += diff * 0.14;
      const bodyRotation = smoothBodyRotation.current;
      
      // Mining swing animation: we calculate it once to use for both pickaxe and hand
      const swingAngle = (miningAnimation.rotation * Math.PI / 180);
      const swingOffsetX = miningAnimation.offsetX;
      const swingOffsetY = miningAnimation.offsetY;
      
      // Always use body rotation to allow character to turn during mining
      let miningBaseRot = bodyRotation;
      
      // Draw Body and Hands
      ctx.save();
      // Use the calculated rotation (which now tracks lookDir even while mining)
      ctx.rotate(miningBaseRot);
      
      const pHalf = pSize / 2;
      const handOffsetSide = 22; // Back to wider position
      const handOffsetFront = 10; // Back to previous forward offset
      const handSize = 6;

      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;

      // Draw Body
      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, pSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Eyes
      ctx.fillStyle = "black";
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(-pSize / 4, -pSize / 4, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(pSize / 4, -pSize / 4, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      
      ctx.restore(); // Restore body rotation

      // Draw Pickaxe
      const pickaxeColor = PICKAXE_COLORS[user.pickaxeLevel] || "#8B4513";
      ctx.save(); 
      ctx.rotate(miningBaseRot);
      
      // Rotate pickaxe with the hand
      const pickaxeHandRot = (miningAnimation.rotation * Math.PI / 180);
      ctx.rotate(pickaxeHandRot);
      ctx.translate(-handOffsetSide, -handOffsetFront); 
      
      // Base rotation of -90 degrees (facing forward/left relative to body)
      ctx.rotate(-(90 * Math.PI / 180));
      
      const headY = -24; 
      
      // Draw handle first (behind the head)
      ctx.save();
      // Draw handle outline (black stroke on all sides of the line)
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 7; 
      ctx.beginPath(); 
      ctx.moveTo(0, headY); 
      ctx.lineTo(0, 0); 
      ctx.stroke();

      // Inner handle color with gradient for depth/shadow (enhanced matching head style)
      const handleGrad = ctx.createLinearGradient(-3, 0, 3, 0);
      handleGrad.addColorStop(0, "rgba(0,0,0,0.3)"); // Darker edge
      handleGrad.addColorStop(0.5, "#3d2b25"); // Base shadow color
      handleGrad.addColorStop(1, "rgba(0,0,0,0.3)"); // Darker edge
      
      ctx.beginPath(); 
      ctx.moveTo(0, headY); 
      ctx.lineTo(0, 0); 
      ctx.strokeStyle = handleGrad; 
      ctx.lineWidth = 4; 
      ctx.stroke();
      
      // Add a subtle highlight line on the handle (matching head highlight)
      ctx.beginPath();
      ctx.moveTo(-1, headY);
      ctx.lineTo(-1, 0);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Add top-to-bottom shading on handle for more detail
      const handleTopGrad = ctx.createLinearGradient(0, headY, 0, 0);
      handleTopGrad.addColorStop(0, "rgba(0,0,0,0.2)");
      handleTopGrad.addColorStop(0.2, "transparent");
      handleTopGrad.addColorStop(0.8, "transparent");
      handleTopGrad.addColorStop(1, "rgba(0,0,0,0.1)");
      
      ctx.beginPath();
      ctx.moveTo(0, headY);
      ctx.lineTo(0, 0);
      ctx.strokeStyle = handleTopGrad;
      ctx.lineWidth = 4;
      ctx.stroke();
      
      ctx.restore();

      // Draw head on top of the handle
      ctx.save();
      // Draw outline for head
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      ctx.beginPath(); 
      ctx.moveTo(-14, headY + 4); 
      ctx.quadraticCurveTo(0, headY - 8, 14, headY + 4); 
      ctx.lineTo(10, headY + 6); 
      ctx.quadraticCurveTo(0, headY - 2, -10, headY + 6); 
      ctx.closePath();
      ctx.stroke();

      // Inner head color with gradient for depth (matching handle style)
      const headSideGrad = ctx.createLinearGradient(-14, 0, 14, 0);
      headSideGrad.addColorStop(0, "rgba(0,0,0,0.2)"); // Subtle dark edge
      headSideGrad.addColorStop(0.5, pickaxeColor);
      headSideGrad.addColorStop(1, "rgba(0,0,0,0.2)"); // Subtle dark edge
      
      ctx.fillStyle = headSideGrad; 
      ctx.fill();
      
      // Add a very subtle highlight line for realism
      ctx.beginPath();
      ctx.moveTo(-12, headY + 3.5);
      ctx.quadraticCurveTo(0, headY - 6, 12, headY + 3.5);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.restore();
      
      ctx.restore();

      // Drawing Left Hand (Holding Pickaxe)
      ctx.save();
      ctx.rotate(miningBaseRot);
      
      // Pivot hand based on animation rotation to keep it attached to body
      const leftHandRot = (miningAnimation.rotation * Math.PI / 180);
      ctx.rotate(leftHandRot);
      ctx.translate(-handOffsetSide, -handOffsetFront);
      
      // Draw a "limb" connecting hand to body (now hidden but kept in code)
      /*
      ctx.beginPath();
      ctx.moveTo(0, 0); // At hand
      ctx.lineTo(handOffsetSide, handOffsetFront); // Towards body center
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.stroke();
      */

      // Apply pickaxe rotation relative to hand
      ctx.rotate(-(90 * Math.PI / 180));

      // Draw hand circle centered at (0,0)
      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, handSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Drawing Right Hand (Static with limb)
      ctx.save();
      ctx.rotate(miningBaseRot);
      ctx.translate(handOffsetSide, -handOffsetFront);
      
      // Draw a "limb" connecting hand to body (now hidden but kept in code)
      /*
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-handOffsetSide, handOffsetFront);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.stroke();
      */

      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, handSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.restore(); // Restore main player transform

      const grad = ctx.createRadialGradient(cx, cy, TILE_SIZE, cx, cy, TILE_SIZE * 5);
      particles.forEach(p => { const sx = cx + (p.x - displayPos.x) * TILE_SIZE; const sy = cy + (p.y - displayPos.y) * TILE_SIZE; ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(sx - 2, sy - 2, 4, 4); ctx.globalAlpha = 1; });
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [localPos, user.pickaxeLevel, tileHealth, minedTiles, particles, miningAnimation, lookDir]);

  return (
    <div ref={containerRef} className={`relative bg-black overflow-hidden shadow-2xl transition-all ${isFullscreen ? 'fixed inset-0 w-screen h-screen border-0 rounded-none z-50' : 'w-full h-[60vh] sm:h-[70vh] border-4 border-secondary rounded-lg'}`}>
      <canvas ref={canvasRef} onClick={handleCanvasClick} className="w-full h-full cursor-crosshair active:cursor-grabbing" />
      <AnimatePresence>{cooldownProgress < 1 && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }} className="absolute top-[calc(50%+28px)] left-1/2 -translate-x-1/2 w-12 h-1.5 bg-black/50 border border-secondary rounded-full overflow-hidden shadow-[0_0_10px_rgba(0,0,0,0.5)]">
          <motion.div className="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" initial={{ width: "0%" }} animate={{ width: `${cooldownProgress * 100}%` }} transition={{ duration: 0.1 }} />
        </motion.div>
      )}</AnimatePresence>
      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none">
        {/* Fullscreen toggle is now handled by the parent Game component's settings menu or hidden */}
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
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleMineButtonClick();
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleMineButtonClick();
              }}
              disabled={isMining || isOnCooldown}
              data-testid="button-mine"
              className="relative w-16 h-16 bg-gradient-to-br from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 border-2 border-yellow-800 disabled:border-gray-700 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-lg disabled:shadow-none font-pixel text-sm font-bold text-white pointer-events-auto"
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
