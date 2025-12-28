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

// Cache for expensive calculations
const noiseCache = new Map<string, number>();
const floorColorCache = new Map<string, string>();
const rockyBiomeCache = new Map<string, boolean>();

function getCacheKey(x: number, y: number, scale?: number): string {
  return scale !== undefined ? `${x},${y},${scale}` : `${x},${y}`;
} 

const RESOURCE_HEALTH: Record<ResourceType, number> = {
  stone: 2,
  copper_ore: 3,
  iron_ore: 4,
  gold_ore: 5,
  diamond: 6,
  wood: 6,
};

function pseudoRandom(x: number, y: number) {
  const dot = x * 12.9898 + y * 78.233;
  const sin = Math.sin(dot) * 43758.5453;
  return sin - Math.floor(sin);
}

// Organic noise using value noise approach with caching
function getNoise(x: number, y: number, scale: number) {
  const key = getCacheKey(x, y, scale);
  if (noiseCache.has(key)) return noiseCache.get(key)!;
  
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
  
  const result = nx0 * (1 - sy) + nx1 * sy;
  noiseCache.set(key, result);
  return result;
}

// Check if a tile is in the rocky biome - with caching
function isRockyBiome(x: number, y: number): boolean {
  const key = getCacheKey(x, y);
  if (rockyBiomeCache.has(key)) return rockyBiomeCache.get(key)!;
  
  const rockyNoise = getNoise(x + 5000, y + 5000, 0.03);
  if (rockyNoise > 0.80) {
    // Check if it's part of a large cluster
    let rockyNeighborCount = 0;
    for (let ny = -1; ny <= 1; ny++) {
      for (let nx = -1; nx <= 1; nx++) {
        const neighborNoise = getNoise(x + nx + 5000, y + ny + 5000, 0.03);
        if (neighborNoise > 0.80) rockyNeighborCount++;
      }
    }
    const result = rockyNeighborCount >= 5;
    rockyBiomeCache.set(key, result);
    return result;
  }
  rockyBiomeCache.set(key, false);
  return false;
}


// Generate biome floor colors - plains and rocky biomes - with caching
function getFloorColor(x: number, y: number): string {
  const key = getCacheKey(x, y);
  if (floorColorCache.has(key)) return floorColorCache.get(key)!;
  // Check if in a tree zone (for darker grass) with smooth transitions
  const groupZoneSize = 25;
  const groupZoneX = Math.floor(x / groupZoneSize);
  const groupZoneY = Math.floor(y / groupZoneSize);
  
  // Calculate smooth transition: check nearby zones and blend
  let forestZoneCount = 0;
  for (let zy = -1; zy <= 1; zy++) {
    for (let zx = -1; zx <= 1; zx++) {
      const checkZoneX = groupZoneX + zx;
      const checkZoneY = groupZoneY + zy;
      const checkChance = pseudoRandom(checkZoneX + 8000, checkZoneY + 8000);
      if (checkChance <= 0.65) forestZoneCount++; // 35% zones have trees
    }
  }
  
  // Blend factor: 0 = no nearby forests, 1 = all zones are forests
  // Smoothly blend colors based on how many nearby zones are forests
  const forestBlend = forestZoneCount / 9; // 9 zones in 3x3 area
  
  // Rocky biome generation - MUST match getTileAt scale and threshold
  // Use coarse scale 0.03 for large regional biomes (not scattered patches)
  // Threshold 0.80 = rare but large mountain regions when they appear
  const rockyNoise = getNoise(x + 5000, y + 5000, 0.03);
  
  if (rockyNoise > 0.80) {
    // Check if this rocky tile is part of a large enough cluster
    // Only render rocky biome if it has enough neighboring rocky tiles
    let rockyNeighborCount = 0;
    // Check 3x3 area (9 tiles) instead of 5x5 for better performance
    for (let ny = -1; ny <= 1; ny++) {
      for (let nx = -1; nx <= 1; nx++) {
        const neighborNoise = getNoise(x + nx + 5000, y + ny + 5000, 0.03);
        if (neighborNoise > 0.80) rockyNeighborCount++;
      }
    }
    
    // Only show rocky biome if it has enough neighboring rocky tiles (at least 5 in a 3x3 area)
    // This prevents tiny isolated rocky patches from appearing
    if (rockyNeighborCount < 5) {
      // Not part of a large cluster, render as plains instead
      const noise = getNoise(x, y, 0.05) * 0.7 + getNoise(x, y, 0.15) * 0.3;
      const grassNoise = getNoise(x + 1000, y + 1000, 0.06);

      let r = 86, g = 172, b = 102;
      if (grassNoise > 0.60) {
        const intensity = (grassNoise - 0.60) / 0.40;
        r = Math.round(86 + (54 - 86) * intensity);
        g = Math.round(172 + (145 - 172) * intensity);
        b = Math.round(102 + (84 - 102) * intensity);
      } else if (grassNoise > 0.50) {
        const intensity = (grassNoise - 0.50) / 0.10;
        r = Math.round(86 + (68 - 86) * intensity);
        g = Math.round(172 + (145 - 172) * intensity);
        b = Math.round(102 + (84 - 102) * intensity);
      }

      if (noise > 0.3) {
        const t = (noise - 0.3) / 0.7;
        r = Math.round(r * (1 - t * 0.1) + 90 * t * 0.1);
        g = Math.round(g * (1 - t * 0.1) + 150 * t * 0.1);
        b = Math.round(b * (1 - t * 0.1) + 95 * t * 0.1);
      }

      // Smoothly darken grass in forest zones (blend based on nearby forest zones)
      r = Math.round(r * (1 - forestBlend * 0.3));
      g = Math.round(g * (1 - forestBlend * 0.3));
      b = Math.round(b * (1 - forestBlend * 0.3));

      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
    
    // Rocky biome - uses same noise generation system as plains but with stone/grey colors
    // This creates natural terrain variation just like plains
    const noise = getNoise(x, y, 0.05) * 0.7 + getNoise(x, y, 0.15) * 0.3;
    const stoneNoise = getNoise(x + 1000, y + 1000, 0.06);

    // Base stone colors for rocky biome (grey instead of green)
    let r = 110, g = 110, b = 110; // Default grey stone

    // Vary shades of grey for visual interest (same logic as plains but grey palette)
    if (stoneNoise > 0.60) {
      const intensity = (stoneNoise - 0.60) / 0.40;
      r = Math.round(110 + (95 - 110) * intensity);
      g = Math.round(110 + (95 - 110) * intensity);
      b = Math.round(110 + (95 - 110) * intensity);
    } else if (stoneNoise > 0.50) {
      const intensity = (stoneNoise - 0.50) / 0.10;
      r = Math.round(110 + (100 - 110) * intensity);
      g = Math.round(110 + (100 - 110) * intensity);
      b = Math.round(110 + (100 - 110) * intensity);
    }

    // Subtle noise variation (same as plains but adapted for grey colors)
    if (noise > 0.3) {
      const t = (noise - 0.3) / 0.7;
      r = Math.round(r * (1 - t * 0.1) + 105 * t * 0.1);
      g = Math.round(g * (1 - t * 0.1) + 105 * t * 0.1);
      b = Math.round(b * (1 - t * 0.1) + 105 * t * 0.1);
    }

    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }
  
  // Plains biome - grass coloring
  const noise = getNoise(x, y, 0.05) * 0.7 + getNoise(x, y, 0.15) * 0.3;
  const grassNoise = getNoise(x + 1000, y + 1000, 0.06);

  // Base grass colors for plains biome
  let r = 86, g = 172, b = 102; // Default grass green

  // Vary shades of green for visual interest
  if (grassNoise > 0.60) {
    const intensity = (grassNoise - 0.60) / 0.40;
    r = Math.round(86 + (54 - 86) * intensity);
    g = Math.round(172 + (145 - 172) * intensity);
    b = Math.round(102 + (84 - 102) * intensity);
  } else if (grassNoise > 0.50) {
    const intensity = (grassNoise - 0.50) / 0.10;
    r = Math.round(86 + (68 - 86) * intensity);
    g = Math.round(172 + (145 - 172) * intensity);
    b = Math.round(102 + (84 - 102) * intensity);
  }

  // Subtle noise variation
  if (noise > 0.3) {
    const t = (noise - 0.3) / 0.7;
    r = Math.round(r * (1 - t * 0.1) + 90 * t * 0.1);
    g = Math.round(g * (1 - t * 0.1) + 150 * t * 0.1);
    b = Math.round(b * (1 - t * 0.1) + 95 * t * 0.1);
  }

  // Smoothly darken grass in forest zones (blend based on nearby forest zones)
  r = Math.round(r * (1 - forestBlend * 0.3));
  g = Math.round(g * (1 - forestBlend * 0.3));
  b = Math.round(b * (1 - forestBlend * 0.3));

  const color = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  floorColorCache.set(key, color);
  return color;
}

function isBiomeBorder(x: number, y: number): boolean {
  const myColor = getFloorColor(x, y);
  // Quick early exit check: skip border rendering for rocky biome (performance)
  if (myColor.includes("105")) return false; // Rocky color RGB starts with 105
  
  const neighbors = [
    getFloorColor(x + 1, y),
    getFloorColor(x - 1, y),
    getFloorColor(x, y + 1),
    getFloorColor(x, y - 1)
  ];
  return neighbors.some(n => n !== myColor);
}

function getTileAt(x: number, y: number): ResourceType | null {
  // Rocky biome - coarse scale 0.03 creates large, natural mountain/rocky regions
  // This creates rare but large biomes instead of scattered patches
  // MUST match getFloorColor scale and threshold exactly
  const rockyNoise = getNoise(x + 5000, y + 5000, 0.03);
  if (rockyNoise > 0.80) {
    // We're in a rocky biome area - check if it's part of a large cluster
    let rockyNeighborCount = 0;
    for (let ny = -1; ny <= 1; ny++) {
      for (let nx = -1; nx <= 1; nx++) {
        const neighborNoise = getNoise(x + nx + 5000, y + ny + 5000, 0.03);
        if (neighborNoise > 0.80) rockyNeighborCount++;
      }
    }
    
    // Only spawn stone in rocky regions that are part of a larger cluster (min 5 neighboring rocky tiles)
    if (rockyNeighborCount >= 5) {
      const stoneSeed = pseudoRandom(x + 2000, y + 2000);
      if (stoneSeed > 0.96) return "stone";
    }
    
    // IMPORTANT: Return null for all rocky terrain, no trees spawn on rocks
    return null;
  }
  
  // Plains biome - tree groups with exactly 10-15 trees per 25x25 zone
  const groupZoneSize = 25; // Each zone is 25x25 tiles
  const groupZoneX = Math.floor(x / groupZoneSize);
  const groupZoneY = Math.floor(y / groupZoneSize);
  
  // Determine if this zone has a tree group (~35% of zones)
  const groupChance = pseudoRandom(groupZoneX + 8000, groupZoneY + 8000);
  if (groupChance > 0.65) return null; // 65% empty zones, 35% with trees
  
  // Generate tree positions for this zone with distance checking
  const treeCountSeed = pseudoRandom(groupZoneX + 8001, groupZoneY + 8001);
  const treeCount = 10 + Math.floor(treeCountSeed * 6); // 10-15 trees
  
  const trees: Array<{x: number, y: number}> = [];
  
  // Try to place trees with minimum distance of 3 tiles between them (accounting for tree size 1.1-2.6)
  const minDistance = 3;
  let attempts = 0;
  const maxAttempts = treeCount * 5; // Allow multiple attempts to place trees
  
  while (trees.length < treeCount && attempts < maxAttempts) {
    const treeX = groupZoneX * groupZoneSize + Math.floor(pseudoRandom(groupZoneX + 8002 + attempts, groupZoneY + 8002 + attempts * 17) * groupZoneSize);
    const treeY = groupZoneY * groupZoneSize + Math.floor(pseudoRandom(groupZoneX + 8003 + attempts * 13, groupZoneY + 8003 + attempts) * groupZoneSize);
    
    // Check distance to existing trees
    let tooClose = false;
    for (const existingTree of trees) {
      const dx = treeX - existingTree.x;
      const dy = treeY - existingTree.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistance * minDistance) {
        tooClose = true;
        break;
      }
    }
    
    // Add tree if far enough from others
    if (!tooClose) {
      trees.push({x: treeX, y: treeY});
    }
    
    attempts++;
  }
  
  // Check if current position matches a tree position
  for (const tree of trees) {
    if (x === tree.x && y === tree.y) {
      return "wood";
    }
  }
  
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
  const [isWalking, setIsWalking] = useState(false);
  const walkCycle = useRef(0);
  const lastUpdateRef = useRef(performance.now());
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
  const hitStone = useRef(false);
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
  const [footsteps, setFootsteps] = useState<{id: number, x: number, y: number, life: number, brightness: number}[]>([]);
  const lastFootstepPos = useRef({ x: user.x, y: user.y });
  const lastStepRef = useRef(0);
  const lastStepIndex = useRef(-1);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [, setButtonUpdateTrigger] = useState(0); // Force re-renders for button

  const joystickDirRef = useRef({ dx: 0, dy: 0 });
  const smoothHandBob = useRef(0); // Smooth hand bob value
  const smoothTileHealth = useRef<Record<string, number>>({}); // Smooth health values for tiles
  const shakingTilesStartTime = useRef<Record<string, number>>({}); // Track shake start times
  const tilesDisappearingStartTime = useRef<Record<string, number>>({}); // Track disappear start times
  const tilesDisappearingType = useRef<Record<string, ResourceType>>({}); // Store resource type when disappearing

  useEffect(() => {
    const interval = setInterval(() => {
      setFootsteps(prev => {
        if (prev.length === 0) return prev;
        const next = prev.map(f => ({ ...f, life: f.life - 0.04 })).filter(f => f.life > 0);
        return next.length === prev.length ? prev : next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setButtonUpdateTrigger(t => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = useCallback(() => {
    onFullscreenChange?.(!isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  const isTileMined = (x: number, y: number) => minedTiles.has(`${x},${y}`);
  const getTileHealth = (x: number, y: number) => tileHealth[`${x},${y}`] || 0;

  const hasCollision = (x: number, y: number): boolean => {
    // Stone, wood, and boulder collision detection
    // We check a 4x4 grid around the precise position for better coverage of large boulders
    const tx = Math.round(x);
    const ty = Math.round(y);

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ntx = tx + dx;
        const nty = ty + dy;
        
        const resource = getTileAt(ntx, nty);
        if (!isTileMined(ntx, nty)) {
          const centerX = ntx;
          const centerY = nty;
          
          // Check resource tiles
          if (resource === "stone" || resource === "wood") {
            const sizeSeed = pseudoRandom(ntx + 3000, nty + 3000);
            const rotation = sizeSeed * Math.PI * 2;
            const scale = resource === "stone" ? 0.7 + sizeSeed * 1.5 : 1.1 + sizeSeed * 1.5;
            
            // Transform player relative position into resource local space (account for rotation)
            const dx_rel = x - centerX;
            const dy_rel = y - centerY;
            
            // Rotate the point BACKWARDS to check against the base collision shape
            // (Standard hexagon collision is roughly circular, but we can make it elliptical or more precise)
            const rotatedX = dx_rel * Math.cos(-rotation) - dy_rel * Math.sin(-rotation);
            const rotatedY = dx_rel * Math.sin(-rotation) + dy_rel * Math.cos(-rotation);
            
            // Resources are generally wider than they are tall (visual perspective)
            // We scale the collision distance based on the visual scale
            if (resource === "stone") {
              const baseDistSq = (rotatedX * rotatedX) + (rotatedY * rotatedY);
              const scaledCollisionDist = COLLISION_DISTANCE_SQ * scale;
              if (baseDistSq < scaledCollisionDist) return true;
            } else if (resource === "wood") {
              // Wood (trees) are square with rounded corners
              // We use an AABB check in local rotated space
              const halfSize = (0.5 * scale) * 0.8; // Adjust multiplier for tightness
              if (Math.abs(rotatedX) < halfSize && Math.abs(rotatedY) < halfSize) return true;
            }
          }
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
        setIsWalking(true);
        setLocalPos(prev => {
          const nextX = prev.x + (moveX * moveSpeed);
          const nextY = prev.y + (moveY * moveSpeed);
          
          const canMoveX = !hasCollision(nextX, prev.y);
          const canMoveY = !hasCollision(prev.x, nextY);
          
          let updatedX = prev.x;
          let updatedY = prev.y;

          if (canMoveX) updatedX = nextX;
          if (canMoveY) updatedY = nextY;
          
          // Spawn footstep synced with walk cycle
          const cycle = walkCycle.current % (Math.PI * 2);
          const currentStepIndex = cycle < Math.PI ? 0 : 1;
          
          if (currentStepIndex !== lastStepIndex.current && isWalking) {
            lastStepIndex.current = currentStepIndex;
            
            setFootsteps(prevSteps => {
              const nextSteps = prevSteps.length > 50 ? prevSteps.slice(-40) : [...prevSteps];
              
              const side = (currentStepIndex === 0) ? 1 : -1;
              const angle = Math.atan2(lookDir.dy, lookDir.dx) + Math.PI / 2;
              const offset = 12; 
              
              // World position of the footstep
              const stepX = updatedX + (Math.cos(angle) * offset) / TILE_SIZE * side;
              const stepY = updatedY + (Math.sin(angle) * offset) / TILE_SIZE * side;
              
              return [
                ...nextSteps,
                { id: Math.random(), x: stepX, y: stepY, life: 1.0, brightness: 0.5 }
              ];
            });
          }
          
          return { x: updatedX, y: updatedY };
        });
      } else {
        setIsWalking(false);
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
      // Set flag if there are stones to hit
      if (targets.length > 0) {
        hitStone.current = true;
      }
      
      targets.forEach(t => {
        const key = `${t.x},${t.y}`;
        
        // Start smooth shake animation
        shakingTilesStartTime.current[key] = performance.now();
        setShakingTiles(prev => ({ ...prev, [key]: { x: 0, y: 0 } }));
        setTimeout(() => {
          setShakingTiles(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          delete shakingTilesStartTime.current[key];
        }, 150);

        // Calculate dynamic health based on scale seed used in render
        const sizeSeed = pseudoRandom(t.x + 3000, t.y + 3000);
        const rockScale = 0.7 + sizeSeed * 1.5;
        
        let maxHealth;
        if (t.resource === "wood") {
          // Wood has 3x health of stone
          maxHealth = rockScale <= 1.0 ? 6 : rockScale <= 1.5 ? 9 : 12;
        } else {
          maxHealth = rockScale <= 1.0 ? 2 : rockScale <= 1.5 ? 3 : 4;
        }

        const currentHealth = tileHealth[key] !== undefined ? tileHealth[key] : maxHealth;
        const newHealth = currentHealth - 1;
        setTileHealth(prev => ({ ...prev, [key]: newHealth }));
        
        if (newHealth <= 0) {
          const resDef = RESOURCES[t.resource];
          if (user.pickaxeLevel >= resDef.minPickaxeLevel) {
            // Start simple fade animation - track start time and resource type
            tilesDisappearingStartTime.current[key] = performance.now();
            tilesDisappearingType.current[key] = t.resource;
            mine.mutate(t.resource, { onSuccess: () => {
              const id = Date.now() + Math.random();
              setMiningNotifications(prev => [...prev, { id, resource: t.resource, x: t.x, y: t.y }]);
              setTimeout(() => setMiningNotifications(prev => prev.filter(n => n.id !== id)), 2000);
            }});
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
        
        // Add bounce effect only if pickaxe hit a stone (after 0.55 progress)
        if (hitStone.current) {
          const bouncePhase = (progress - 0.55) / 0.45; // 0 to 1
          // Smooth tilt backward and return forward
          const tiltAmount = Math.sin(bouncePhase * Math.PI) * 15; // Smooth sine wave, max 15 degrees
          rot += tiltAmount;
        }
      }
      
      setMiningAnimation({ rotation: rot, offsetX: 0, offsetY: offY });
      
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
        hitStone.current = false; // Reset bounce flag
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
      // Use different easing: faster response to input, slower return to idle
      const isInputActive = Math.abs(lookDir.dx) > 0.01 || Math.abs(lookDir.dy) > 0.01;
      const easeSpeed = isInputActive ? 0.18 : 0.08; // Slower return for smooth hands
      smoothLookDir.current.dx += (lookDir.dx - smoothLookDir.current.dx) * easeSpeed;
      smoothLookDir.current.dy += (lookDir.dy - smoothLookDir.current.dy) * easeSpeed;
      
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
      const drawRadius = 8; // Further reduced for performance
      const biomeTiles: Record<string, {wx: number, wy: number, sx: number, sy: number}[]> = {};
      
      const startX = Math.round(localPos.x) - drawRadius;
      const endX = Math.round(localPos.x) + drawRadius;
      const startY = Math.round(localPos.y) - drawRadius;
      const endY = Math.round(localPos.y) + drawRadius;

      for (let wy = startY; wy <= endY; wy++) {
        for (let wx = startX; wx <= endX; wx++) {
          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
          
          // Skip if off screen (with padding for large trees/branches)
          const PADDING = TILE_SIZE * 2.5; 
          if (sx + TILE_SIZE + PADDING < 0 || sx - PADDING > rect.width || sy + TILE_SIZE + PADDING < 0 || sy - PADDING > rect.height) continue;
          
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

      // Render destroying tiles AFTER biome so fade-out is visible
      // Store them and render later
      
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
      const resourcesToRender: any[] = [];
      const resourceDrawRadius = 8; // Further reduced for performance
      for (let wy = Math.round(localPos.y) - resourceDrawRadius; wy <= Math.round(localPos.y) + resourceDrawRadius; wy++) {
        for (let wx = Math.round(localPos.x) - resourceDrawRadius; wx <= Math.round(localPos.x) + resourceDrawRadius; wx++) {
          const tileKey = `${wx},${wy}`;
          const resType = getTileAt(wx, wy);
          const isMined = minedTiles.has(tileKey);
          const isDisappearing = tilesDisappearingStartTime.current[tileKey];
          
          if (resType && !isMined && !isDisappearing) {
            resourcesToRender.push({ wx, wy, resType, type: 'resource' });
          }
        }
      }

      // Sort resources by Y coordinate to ensure correct overlapping (top to bottom)
      resourcesToRender.sort((a, b) => a.wy - b.wy);

      // First draw all grounds
      for (let wy = startY - 3; wy <= endY + 3; wy++) {
        for (let wx = startX - 3; wx <= endX + 3; wx++) {
          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
          if (sx + TILE_SIZE + 48 >= 0 && sx - 48 <= rect.width && sy + TILE_SIZE + 48 >= 0 && sy - 48 <= rect.height) {
            ctx.fillStyle = getFloorColor(wx, wy);
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          }
        }
      }

      // Draw footsteps
      ctx.save();
      footsteps.forEach(f => {
        // Correct conversion from world to screen coordinates
        // f.x, f.y are in tiles (e.g. 250, -133)
        // displayPos.x, displayPos.y are also in tiles
        // (f.x - displayPos.x) gives tile offset from camera center
        // Multiplying by TILE_SIZE gives pixel offset
        const screenX = cx + (f.x - displayPos.x) * TILE_SIZE;
        const screenY = cy + (f.y - displayPos.y) * TILE_SIZE;
        
        // Footsteps: simple dark circles that fade out
        ctx.fillStyle = `rgba(0, 0, 0, ${f.life * 0.35})`; 
        ctx.beginPath();
        ctx.arc(screenX, screenY, 5 * f.life, 0, Math.PI * 2); 
        ctx.fill();
      });
      ctx.restore();

          // Now draw resources in sorted order
      resourcesToRender.forEach(({ wx, wy, resType, type }) => {
        const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
        const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
        const tileKey = `${wx},${wy}`;

        if (type === 'resource' && resType) {
          const res = RESOURCES[resType as keyof typeof RESOURCES]; 
          let shake = { x: 0, y: 0 };
          const shakeStartTime = shakingTilesStartTime.current[tileKey];
          if (shakeStartTime !== undefined) {
            const shakeElapsed = performance.now() - shakeStartTime;
            if (shakeElapsed < 150) {
              const shakeProgress = shakeElapsed / 150;
              const shakeDecay = Math.cos(shakeProgress * Math.PI / 2);
              const shakeAmount = 6 * shakeDecay;
              shake.x = Math.sin(shakeElapsed / 20) * shakeAmount;
              shake.y = Math.cos(shakeElapsed / 20) * shakeAmount;
            }
          }
          
          const sizeSeed = pseudoRandom(wx + 3000, wy + 3000);
          const baseScale = resType === "wood" ? 1.1 : 0.7;
          const rockScale = baseScale + sizeSeed * 1.5;
          const dsx = sx + (pseudoRandom(wx + 1000, wy + 1000) - 0.5) * 12 + shake.x;
          const dsy = sy + (pseudoRandom(wx + 2000, wy + 2000) - 0.5) * 12 + shake.y;

          ctx.save();
          ctx.translate(dsx + TILE_SIZE / 2, dsy + TILE_SIZE / 2);
          ctx.scale(rockScale, rockScale);
          ctx.translate(-(dsx + TILE_SIZE / 2), -(dsy + TILE_SIZE / 2));
          
          ctx.strokeStyle = "rgba(0,0,0,0.4)";
          ctx.lineWidth = 2;

          if (resType === "stone") {
            ctx.fillStyle = "#444";
            ctx.beginPath();
            const centerX = dsx + TILE_SIZE / 2;
            const centerY = dsy + TILE_SIZE / 2;
            const radius = (TILE_SIZE - 8) / 2;
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
          } else if (resType === "wood") {
            ctx.fillStyle = "#1b4d2b";
            ctx.beginPath(); ctx.roundRect(dsx + 6, dsy + 6, TILE_SIZE - 12, TILE_SIZE - 12, 8); ctx.fill();
            ctx.stroke();
            
            if (rockScale > 1.4) {
              const branchSide = Math.floor(pseudoRandom(wx + 5000, wy + 5000) * 4);
              ctx.fillStyle = "#6b4423";
              if (branchSide === 0) {
                ctx.fillRect(dsx + TILE_SIZE - 6, dsy + 16, 6, 8);
                ctx.beginPath(); ctx.moveTo(dsx + TILE_SIZE - 6, dsy + 16); ctx.lineTo(dsx + TILE_SIZE, dsy + 16); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(dsx + TILE_SIZE, dsy + 16); ctx.lineTo(dsx + TILE_SIZE, dsy + 24); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(dsx + TILE_SIZE, dsy + 24); ctx.lineTo(dsx + TILE_SIZE - 6, dsy + 24); ctx.stroke();
                ctx.fillStyle = "#1b4d2b";
                ctx.beginPath(); ctx.roundRect(dsx + TILE_SIZE, dsy + 13, 14, 14, 3); ctx.fill(); ctx.stroke();
              } else if (branchSide === 1) {
                ctx.fillRect(dsx + 20, dsy + TILE_SIZE - 8, 8, 8);
                ctx.beginPath(); ctx.moveTo(dsx + 20, dsy + TILE_SIZE - 8); ctx.lineTo(dsx + 20, dsy + TILE_SIZE); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(dsx + 28, dsy + TILE_SIZE - 8); ctx.lineTo(dsx + 28, dsy + TILE_SIZE); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(dsx + 20, dsy + TILE_SIZE); ctx.lineTo(dsx + 28, dsy + TILE_SIZE); ctx.stroke();
                ctx.fillStyle = "#1b4d2b";
                ctx.beginPath(); ctx.roundRect(dsx + 17, dsy + TILE_SIZE, 14, 14, 3); ctx.fill(); ctx.stroke();
              } else if (branchSide === 2) {
                ctx.fillRect(dsx, dsy + 16, 6, 8);
                ctx.beginPath(); ctx.moveTo(dsx, dsy + 16); ctx.lineTo(dsx + 6, dsy + 16); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(dsx, dsy + 16); ctx.lineTo(dsx, dsy + 24); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(dsx, dsy + 24); ctx.lineTo(dsx + 6, dsy + 24); ctx.stroke();
                ctx.fillStyle = "#1b4d2b";
                ctx.beginPath(); ctx.roundRect(dsx - 14, dsy + 13, 14, 14, 3); ctx.fill(); ctx.stroke();
              } else {
                ctx.fillRect(dsx + 16, dsy - 6, 8, 6);
                ctx.beginPath(); ctx.moveTo(dsx + 16, dsy - 6); ctx.lineTo(dsx + 24, dsy - 6); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(dsx + 24, dsy - 6); ctx.lineTo(dsx + 24, dsy); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(dsx + 24, dsy); ctx.lineTo(dsx + 16, dsy); ctx.stroke();
                ctx.fillStyle = "#1b4d2b";
                ctx.beginPath(); ctx.roundRect(dsx + 9, dsy - 20, 14, 14, 3); ctx.fill(); ctx.stroke();
              }
            }
          } else {
            ctx.fillStyle = "#444";
            ctx.beginPath(); ctx.roundRect(dsx + 4, dsy + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4); ctx.fill();
            ctx.stroke();
          }
          
          if (resType !== "stone" && resType !== "wood") {
            ctx.fillStyle = res.color; 
            ctx.fillRect(dsx + 10, dsy + 10, 8, 8); 
            ctx.fillRect(dsx + 24, dsy + 16, 6, 6); 
            ctx.fillRect(dsx + 16, dsy + 28, 8, 8);
          }
          ctx.restore();

          // Draw health bar
          let mh = resType === "wood" ? (rockScale <= 1.0 ? 6 : rockScale <= 1.5 ? 9 : 12) : (rockScale <= 1.0 ? 2 : rockScale <= 1.5 ? 3 : 4);
          let h = tileHealth[tileKey] !== undefined ? tileHealth[tileKey] : mh;
          if (!(tileKey in smoothTileHealth.current)) smoothTileHealth.current[tileKey] = h;
          smoothTileHealth.current[tileKey] += (h - smoothTileHealth.current[tileKey]) * 0.15;
          const smoothH = smoothTileHealth.current[tileKey];
          
          if (smoothH < mh - 0.01) {
            const hp = smoothH / mh;
            const healthBarAlpha = Math.max(0, Math.min(1, (mh - smoothH) * 0.5));
            const barWidth = (TILE_SIZE - 8) * rockScale;
            const barX = dsx + TILE_SIZE / 2 - barWidth / 2;
            const barY = dsy + TILE_SIZE / 2 + ((TILE_SIZE - 8) / 2) * rockScale + 4;
            ctx.fillStyle = `rgba(0,0,0,${0.5 * healthBarAlpha})`; 
            ctx.beginPath(); ctx.roundRect(barX, barY, barWidth, 5, 2); ctx.fill();
            const colorR = hp > 0.5 ? 34 : hp > 0.25 ? 234 : 239;
            const colorG = hp > 0.5 ? 197 : hp > 0.25 ? 179 : 68;
            const colorB = hp > 0.5 ? 94 : hp > 0.25 ? 8 : 68;
            ctx.fillStyle = `rgba(${colorR},${colorG},${colorB},${healthBarAlpha})`; 
            ctx.beginPath(); ctx.roundRect(barX, barY, barWidth * hp, 5, 2); ctx.fill();
          }
        }
      });

      // Render disappearing tiles with scale and fade
      const nowTime = performance.now();
      const DISAPPEAR_DURATION = 1200; // Increased from 300ms to 1200ms
      Object.entries(tilesDisappearingStartTime.current).forEach(([key, startTime]) => {
        const [wxStr, wyStr] = key.split(',');
        const wx = parseInt(wxStr);
        const wy = parseInt(wyStr);
        const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
        const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
        
        // Skip if off screen
        if (sx + TILE_SIZE < 0 || sx > rect.width || sy + TILE_SIZE < 0 || sy > rect.height) return;
        
        // Calculate elapsed time and alpha
        const elapsed = nowTime - startTime;
        const progress = Math.min(elapsed / DISAPPEAR_DURATION, 1);
        const alpha = Math.max(0, 1 - progress);
        if (alpha <= 0) {
          // Animation finished - mark as mined immediately to prevent flicker
          setMinedTiles(prev => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });
          delete tilesDisappearingStartTime.current[key];
          delete tilesDisappearingType.current[key];
          return;
        }
        
        // Scale animation: grow for first half (0-0.5s), then shrink (0.5s-1.2s)
        let scaleMultiplier = 1;
        if (progress < 0.42) {
          // First 500ms: grow from 1 to 1.3
          const growProgress = progress / 0.42;
          scaleMultiplier = 1 + growProgress * 0.3;
        } else {
          // Next 700ms: shrink from 1.3 back to 1 then to 0
          const shrinkProgress = (progress - 0.42) / 0.58;
          scaleMultiplier = 1.3 - shrinkProgress * 1.3;
        }
        
        // Use stored resource type to ensure consistent rendering
        const resType = tilesDisappearingType.current[key];
        const sizeSeed = pseudoRandom(wx + 3000, wy + 3000);
        const rockScale = 0.7 + sizeSeed * 1.5;
        const finalScale = rockScale * scaleMultiplier;
        
        const offsetX = (pseudoRandom(wx + 1000, wy + 1000) - 0.5) * 12;
        const offsetY = (pseudoRandom(wx + 2000, wy + 2000) - 0.5) * 12;
        const dsx = sx + offsetX;
        const dsy = sy + offsetY;
        
        ctx.save();
        ctx.translate(dsx + TILE_SIZE / 2, dsy + TILE_SIZE / 2);
        ctx.scale(finalScale, finalScale);
        ctx.translate(-(dsx + TILE_SIZE / 2), -(dsy + TILE_SIZE / 2));
        
        ctx.fillStyle = `rgba(68,68,68,${alpha})`;
        ctx.strokeStyle = `rgba(0,0,0,${0.4 * alpha})`;
        ctx.lineWidth = 2;
        
        if (resType === "stone") {
          ctx.beginPath();
          const centerX = dsx + TILE_SIZE / 2;
          const centerY = dsy + TILE_SIZE / 2;
          const radius = (TILE_SIZE - 8) / 2;
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
        } else if (resType === "wood") {
          ctx.fillStyle = `rgba(27,77,43,${alpha})`;
          ctx.strokeStyle = `rgba(0,0,0,${0.4 * alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(dsx + 6, dsy + 6, TILE_SIZE - 12, TILE_SIZE - 12, 8);
          ctx.fill();
          ctx.stroke();
          
          // Add vertical wood grain pattern with alpha - darker green
          ctx.strokeStyle = `rgba(0,0,0,${0.3 * alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(dsx + 16, dsy + 8);
          ctx.lineTo(dsx + 16, dsy + 40);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(dsx + 32, dsy + 8);
          ctx.lineTo(dsx + 32, dsy + 40);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.roundRect(dsx + 4, dsy + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4);
          ctx.fill();
          ctx.stroke();
        }
        
        ctx.restore();
      });

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
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 2.5;

      // Draw Body
      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; // Lightened outer stroke (from 0.8)
      ctx.lineWidth = 2.5; // Slightly thinner outer stroke (from 3)

      ctx.beginPath();
      ctx.arc(0, 0, pSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Add internal ring for depth - thicker and darker yellow
      ctx.strokeStyle = "rgba(160, 110, 0, 0.7)"; // Darkened (from 180,140,0 @ 0.4)
      ctx.lineWidth = 2.5; // Thicker internal ring (from 1.5)
      ctx.beginPath();
      ctx.arc(0, 0, (pSize / 2) - 2, 0, Math.PI * 2);
      ctx.stroke();

      // Eyes
      ctx.fillStyle = "black";
      ctx.beginPath(); ctx.arc(-pSize / 4, -pSize / 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pSize / 4, -pSize / 4, 3, 0, Math.PI * 2); ctx.fill();
      
      ctx.restore(); // Restore body rotation

      // Calculate hand animation
      const now = performance.now();
      const dt = now - lastUpdateRef.current;
      lastUpdateRef.current = now;
      
      const frameRateFactor = dt / 16.66; // Normalize animation to ~60fps
      
      if (isWalking) {
        // Speed of walk cycle increases based on joystick input intensity
        const joystickMagnitude = Math.sqrt(joystickDirRef.current.dx ** 2 + joystickDirRef.current.dy ** 2);
        const velocityModifier = Math.max(0.5, Math.min(2, joystickMagnitude)); // 0.5 to 2x speed
        walkCycle.current += dt * 0.01 * velocityModifier;
      }
      
      // Calculate raw hand bob
      const rawHandBob = Math.sin(walkCycle.current) * 2;
      
      // Smoothly interpolate hand bob - this prevents jerking when stopping
      smoothHandBob.current += (rawHandBob - smoothHandBob.current) * (isWalking ? 0.2 : 0.06);
      const handBob = smoothHandBob.current;

      // Draw Pickaxe
      const pickaxeColor = PICKAXE_COLORS[user.pickaxeLevel] || "#8B4513";
      ctx.save(); 
      ctx.rotate(miningBaseRot);
      
      const pickaxeHandRot = (miningAnimation.rotation * Math.PI / 180);
      ctx.rotate(pickaxeHandRot);
      
      // Adjust hand position during mining swing to follow pickaxe rotation
      const miningOffsetX = -handOffsetSide;
      const miningOffsetY = -handOffsetFront + handBob + (miningAnimation.rotation * 0.05);
      
      ctx.translate(miningOffsetX, miningOffsetY); 
      ctx.rotate(-(90 * Math.PI / 180));
      
      const headY = -24; 
      
      // Draw handle
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.8)"; // Dark stroke matching the head outline
      ctx.lineWidth = 7; 
      ctx.beginPath(); 
      ctx.moveTo(0, headY); 
      ctx.lineTo(0, 0); 
      ctx.stroke();

      const handleGrad = ctx.createLinearGradient(-3, 0, 3, 0);
      handleGrad.addColorStop(0, "rgba(0,0,0,0.3)");
      handleGrad.addColorStop(0.5, "#3d2b25");
      handleGrad.addColorStop(1, "rgba(0,0,0,0.3)");
      
      ctx.beginPath(); 
      ctx.moveTo(0, headY); 
      ctx.lineTo(0, 0); 
      ctx.strokeStyle = handleGrad; 
      ctx.lineWidth = 4; 
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(-1, headY);
      ctx.lineTo(-1, 0);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      
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

      // Draw head with layered effect
      ctx.save();
      
      // Layer 1: Dark outer outline for definition
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 4;
      ctx.beginPath(); 
      ctx.moveTo(-14, headY + 4); 
      ctx.quadraticCurveTo(0, headY - 8, 14, headY + 4); 
      ctx.lineTo(10, headY + 6); 
      ctx.quadraticCurveTo(0, headY - 2, -10, headY + 6); 
      ctx.closePath();
      ctx.stroke();

      // Layer 2: Main head with gradient
      const headSideGrad = ctx.createLinearGradient(-14, 0, 14, 0);
      headSideGrad.addColorStop(0, "rgba(0,0,0,0.15)");
      headSideGrad.addColorStop(0.5, pickaxeColor);
      headSideGrad.addColorStop(1, "rgba(0,0,0,0.15)");
      
      ctx.fillStyle = headSideGrad; 
      ctx.fill();
      
      // Layer 3: Inner outline for more definition
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); 
      ctx.moveTo(-13, headY + 3.5); 
      ctx.quadraticCurveTo(0, headY - 6.5, 13, headY + 3.5); 
      ctx.lineTo(9, headY + 5); 
      ctx.quadraticCurveTo(0, headY - 1, -9, headY + 5); 
      ctx.closePath();
      ctx.stroke();
      
      // Layer 4: Bottom shadow for depth
      ctx.beginPath();
      ctx.moveTo(-10, headY + 5);
      ctx.quadraticCurveTo(0, headY + 1, 10, headY + 5);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      ctx.restore();
      ctx.restore();

      // Drawing Left Hand (Holding Pickaxe)
      ctx.save();
      ctx.rotate(miningBaseRot);
      const leftHandRot = (miningAnimation.rotation * Math.PI / 180);
      ctx.rotate(leftHandRot);
      
      // Match pickaxe hand position exactly
      const handMiningOffsetX = -handOffsetSide;
      const handMiningOffsetY = -handOffsetFront + handBob + (miningAnimation.rotation * 0.05);
      
      ctx.translate(handMiningOffsetX, handMiningOffsetY);
      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; // Lightened hand stroke (from 0.8)
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, handSize, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Inner hand ring
      ctx.strokeStyle = "rgba(160, 110, 0, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, handSize - 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Drawing Right Hand
      ctx.save();
      ctx.rotate(miningBaseRot);
      ctx.translate(handOffsetSide, -handOffsetFront - handBob);
      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; // Lightened hand stroke (from 0.8)
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, handSize, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      
      // Inner hand ring
      ctx.strokeStyle = "rgba(160, 110, 0, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, handSize - 1.5, 0, Math.PI * 2); ctx.stroke();
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
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }} style={{ top: "calc(50% + 32px)", left: "50%" }} className="absolute -translate-x-1/2 w-12 h-1.5 bg-black/50 border border-secondary rounded-full overflow-hidden shadow-[0_0_10px_rgba(0,0,0,0.5)]">
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
              className="w-24 h-24 bg-[#fbbf24] rounded-full border-4 border-[#b45309] shadow-[0_0_12px_rgba(0,0,0,0.5),inset_-3px_-3px_0_rgba(0,0,0,0.2)] flex items-center justify-center transition-all active:scale-90 disabled:opacity-50 disabled:grayscale pointer-events-auto"
            >
              <div className="absolute inset-0 rounded-full border-2 border-white/10 pointer-events-none" />
              <div className="w-14 h-14 flex items-center justify-center relative">
                {/* Background circle inside button to mimic joystick knob look */}
                <div className="absolute inset-0 border-4 border-[#b45309]/40 rounded-full" />
                <Pickaxe className="w-10 h-10 text-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.5)]" />
              </div>
            </button>
          );
        })()}
      </div>
      {/* Mini-map */}
      <div className="absolute top-4 left-4 w-32 h-32 bg-black/60 border-2 border-secondary rounded-lg overflow-hidden pointer-events-none shadow-xl">
        <canvas 
          id="minimap-canvas"
          width={256}
          height={256}
          className="w-full h-full opacity-90"
          ref={(el) => {
            if (!el) return;
            const mctx = el.getContext("2d");
            if (!mctx) return;
            
            mctx.clearRect(0, 0, 256, 256);
            
            const range = 26; // Increased range to ensure corners are fully covered
            const mTileSize = 256 / (20 * 2); // Keep tile size consistent for 20x20 view but draw more tiles
            
            // Calculate smooth offsets for sub-tile movement
            const offsetX = (localPos.x % 1) * mTileSize;
            const offsetY = (localPos.y % 1) * mTileSize;
            
            // Draw tiles with smooth interpolation
            for (let my = -range; my <= range; my++) {
              for (let mx = -range; mx <= range; mx++) {
                const wx = Math.floor(localPos.x) + mx;
                const wy = Math.floor(localPos.y) + my;
                mctx.fillStyle = getFloorColor(wx, wy);
                // Draw tiles offset by the fractional position of the player
                mctx.fillRect(128 + mx * mTileSize - offsetX, 128 + my * mTileSize - offsetY, mTileSize + 1, mTileSize + 1);
              }
            }
            
            // Draw high-quality player marker
            mctx.save();
            mctx.shadowBlur = 6;
            mctx.shadowColor = "rgba(0,0,0,0.6)";
            
            // Outer stroke for definition
            mctx.strokeStyle = "rgba(0,0,0,0.8)";
            mctx.lineWidth = 3;
            mctx.fillStyle = "#fbbf24";
            
            mctx.beginPath();
            mctx.arc(128, 128, 7, 0, Math.PI * 2);
            mctx.fill();
            mctx.stroke();
            
            // Inner highlight for depth
            mctx.shadowBlur = 0;
            mctx.strokeStyle = "rgba(255,255,255,0.4)";
            mctx.lineWidth = 2;
            mctx.beginPath();
            mctx.arc(128, 128, 4, 0, Math.PI * 2);
            mctx.stroke();
            mctx.restore();
          }}
        />
      </div>
    </div>
  );
}
