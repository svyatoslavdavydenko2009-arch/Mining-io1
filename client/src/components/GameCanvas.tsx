import { useEffect, useRef, useState, useCallback } from "react";
import { RESOURCES, type ResourceType, type User, PICKAXES } from "@shared/schema";
import { useGame } from "@/hooks/use-game";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Pickaxe, Hammer, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const TILE_SIZE = 48; 
const VIEW_RADIUS = 8; 
const WORLD_SEED = 12345; 

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

// Organic floor noise for biomes
function getFloorColor(x: number, y: number): string {
  const val = pseudoRandom(x * 0.1 + WORLD_SEED, y * 0.1 + WORLD_SEED);
  if (val > 0.8) return "#16130e"; // Extra dark patch
  if (val > 0.5) return "#1e1a14"; // Default dark earth
  if (val > 0.2) return "#252119"; // Slightly lighter earth
  return "#2c2820"; // Lightest earth patch
}

function getTileAt(x: number, y: number): ResourceType | null {
  const val = pseudoRandom(x + WORLD_SEED, y + WORLD_SEED);
  if (val > 0.98) return "diamond";
  if (val > 0.95) return "gold_ore";
  if (val > 0.90) return "iron_ore";
  if (val > 0.82) return "copper_ore";
  if (val > 0.65) return "stone";
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
  1: "#8B4513", 
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

export function GameCanvas({ user }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [localPos, setLocalPos] = useState({ x: user.x, y: user.y });
  const [lookDir, setLookDir] = useState({ dx: 0, dy: 0 }); 
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

  const isTileMined = (x: number, y: number) => minedTiles.has(`${x},${y}`);
  const getTileHealth = (x: number, y: number) => tileHealth[`${x},${y}`] || 0;

  const hasCollision = (x: number, y: number): boolean => {
    if (isTileMined(x, y)) return false;
    const resource = getTileAt(x, y);
    return resource !== null;
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      const now = Date.now();
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key)) {
        if (now - lastMoveTime.current < 250) return;
        lastMoveTime.current = now;
      }
      setLocalPos(prev => {
        let next = { ...prev };
        let dx = 0, dy = 0;
        if (e.key === "ArrowUp" || e.key === "w") { if (!hasCollision(prev.x, prev.y - 1)) { next.y -= 1; dy = -1; } }
        else if (e.key === "ArrowDown" || e.key === "s") { if (!hasCollision(prev.x, prev.y + 1)) { next.y += 1; dy = 1; } }
        else if (e.key === "ArrowLeft" || e.key === "a") { if (!hasCollision(prev.x - 1, prev.y)) { next.x -= 1; dx = -1; } }
        else if (e.key === "ArrowRight" || e.key === "d") { if (!hasCollision(prev.x + 1, prev.y)) { next.x += 1; dx = 1; } }

        if (next.x !== prev.x || next.y !== prev.y) {
          setLookDir({ dx, dy });
          triggerDash(dx, dy);
          lastMoveTimeForInterp.current = Date.now();
          setIsMining(false); setMiningTarget(null); setMiningRotation(0);
        }
        return next;
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [minedTiles]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastServerUpdate > 500 && (localPos.x !== user.x || localPos.y !== user.y)) {
      move.mutate(localPos);
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
      
      const targetSide = lookDir.dx < 0 ? 1 : 0;
      smoothPickaxeSide.current += (targetSide - smoothPickaxeSide.current) * 0.05;
      const switchingSpeed = Math.abs(targetSide - smoothPickaxeSide.current);
      const isSwitching = switchingSpeed > 0.01;

      dashScale.current.x += (1 - dashScale.current.x) * 0.15;
      dashScale.current.y += (1 - dashScale.current.y) * 0.15;

      const displayPos = smoothedPos.current; const playerPos = displayPlayerPos.current;
      const cx = rect.width / 2; const cy = rect.height / 2;
      
      ctx.fillStyle = "#1e1a14"; ctx.fillRect(0, 0, rect.width, rect.height);

      const drawRadius = 10;
      for (let dy = -drawRadius; dy <= drawRadius; dy++) {
        for (let dx = -drawRadius; dx <= drawRadius; dx++) {
          const wx = Math.round(localPos.x) + dx; const wy = Math.round(localPos.y) + dy;
          const sx = cx + (wx - displayPos.x) * TILE_SIZE - TILE_SIZE / 2;
          const sy = cy + (wy - displayPos.y) * TILE_SIZE - TILE_SIZE / 2;
          
          ctx.fillStyle = getFloorColor(wx, wy); ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          
          if (!isTileMined(wx, wy)) {
            const resType = getTileAt(wx, wy);
            if (resType) {
              const res = RESOURCES[resType]; ctx.fillStyle = "#444"; ctx.beginPath(); ctx.roundRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4); ctx.fill();
              ctx.fillStyle = res.color; ctx.fillRect(sx + 10, sy + 10, 8, 8); ctx.fillRect(sx + 24, sy + 16, 6, 6); ctx.fillRect(sx + 16, sy + 28, 8, 8);
              const h = tileHealth[`${wx},${wy}`] || RESOURCE_HEALTH[resType]; const mh = RESOURCE_HEALTH[resType];
              if (h < mh) {
                const hp = h / mh; ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.roundRect(sx + 4, sy + TILE_SIZE - 8, TILE_SIZE - 8, 5, 2); ctx.fill();
                ctx.fillStyle = hp > 0.5 ? "#22c55e" : hp > 0.25 ? "#eab308" : "#ef4444"; ctx.beginPath(); ctx.roundRect(sx + 4, sy + TILE_SIZE - 8, (TILE_SIZE - 8) * hp, 5, 2); ctx.fill();
              }
            }
          }
        }
      }

      const px = cx + (playerPos.x - displayPos.x) * TILE_SIZE - TILE_SIZE / 2 + 8;
      const py = cy + (playerPos.y - displayPos.y) * TILE_SIZE - TILE_SIZE / 2 + 8;
      const pSize = TILE_SIZE - 16;
      ctx.save(); ctx.translate(px + pSize / 2, py + pSize / 2); ctx.scale(dashScale.current.x, dashScale.current.y);
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.roundRect(-pSize / 2, -pSize / 2, pSize, pSize, 8); ctx.fill();
      
      const pickaxeColor = PICKAXE_COLORS[user.pickaxeLevel] || "#8B4513";
      
      if (isSwitching) {
          for (let i = 0; i < 3; i++) {
              ctx.save();
              const offset = (i - 1) * switchingSpeed * 10;
              const blurredSide = smoothPickaxeSide.current + offset;
              const blurAlpha = 0.3 - (i * 0.1);
              ctx.globalAlpha = blurAlpha;
              ctx.translate((pSize / 2) * (1 - blurredSide * 2), 0); 
              ctx.scale(1 - blurredSide * 2, 1);
              ctx.rotate((Math.PI / 4) + (miningRotation * Math.PI / 180));
              const hY = -24; ctx.beginPath(); ctx.moveTo(-14, hY + 4); ctx.quadraticCurveTo(0, hY - 8, 14, hY + 4); ctx.lineTo(10, hY + 6); ctx.quadraticCurveTo(0, hY - 2, -10, hY + 6); ctx.closePath();
              ctx.fillStyle = pickaxeColor; ctx.fill();
              ctx.beginPath(); ctx.moveTo(0, hY); ctx.lineTo(0, 0); ctx.strokeStyle = "#5D4037"; ctx.lineWidth = 4; ctx.stroke();
              ctx.restore();
          }
      }
      
      ctx.save(); 
      const side = smoothPickaxeSide.current; 
      ctx.translate((pSize / 2) * (1 - side * 2), 0); 
      ctx.scale(1 - side * 2, 1);
      ctx.rotate((Math.PI / 4) + (miningRotation * Math.PI / 180));
      const headY = -24; ctx.beginPath(); ctx.moveTo(-14, headY + 4); ctx.quadraticCurveTo(0, headY - 8, 14, headY + 4); ctx.lineTo(10, headY + 6); ctx.quadraticCurveTo(0, headY - 2, -10, headY + 6); ctx.closePath();
      ctx.fillStyle = pickaxeColor; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, headY); ctx.lineTo(0, 0); ctx.strokeStyle = "#5D4037"; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
      
      ctx.fillStyle = "black"; const eX = smoothLookDir.current.dx * 4; const eY = smoothLookDir.current.dy * 4;
      ctx.beginPath(); ctx.arc(-pSize / 2 + 10 + eX, -pSize / 2 + 13 + eY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-pSize / 2 + 22 + eX, -pSize / 2 + 13 + eY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      const grad = ctx.createRadialGradient(cx, cy, TILE_SIZE, cx, cy, TILE_SIZE * 5);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.9)");
      ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = grad; ctx.fillRect(0, 0, rect.width, rect.height); ctx.globalCompositeOperation = "source-over";
      particles.forEach(p => { const sx = cx + (p.x - displayPos.x) * TILE_SIZE; const sy = cy + (p.y - displayPos.y) * TILE_SIZE; ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(sx - 2, sy - 2, 4, 4); ctx.globalAlpha = 1; });
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [localPos, user.pickaxeLevel, tileHealth, minedTiles, particles, miningRotation, lookDir]);

  return (
    <div className="relative w-full h-[60vh] sm:h-[70vh] bg-black border-4 border-secondary rounded-lg overflow-hidden shadow-2xl">
      <canvas ref={canvasRef} onClick={handleCanvasClick} className="w-full h-full cursor-crosshair active:cursor-grabbing" />
      <div className="absolute top-4 left-4 font-pixel text-white text-xs opacity-70">X: {localPos.x} Y: {localPos.y}</div>
      <AnimatePresence>{cooldownProgress < 1 && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }} className="absolute top-[calc(50%+28px)] left-1/2 -translate-x-1/2 w-12 h-1.5 bg-black/50 border border-secondary rounded-full overflow-hidden shadow-[0_0_10px_rgba(0,0,0,0.5)]">
          <motion.div className="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" initial={{ width: "0%" }} animate={{ width: `${cooldownProgress * 100}%` }} transition={{ duration: 0.1 }} />
        </motion.div>
      )}</AnimatePresence>
      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence>{miningNotifications.map((n) => (
          <motion.div key={n.id} initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} className="bg-black/80 border border-secondary px-3 py-1.5 rounded-md flex items-center gap-2 shadow-lg">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RESOURCES[n.resource].color }} />
            <span className="text-white text-xs font-pixel uppercase tracking-wider">Mined {RESOURCES[n.resource].name}</span>
          </motion.div>
        ))}</AnimatePresence>
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 sm:hidden">
        <div className="grid grid-cols-3 gap-2">
          <div /> <button onPointerDown={(e) => { e.preventDefault(); handleMobileMove(0, -1); }} className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center border border-white/20 active:bg-white/30 transition-colors"><ChevronUp className="text-white" /></button> <div />
          <button onPointerDown={(e) => { e.preventDefault(); handleMobileMove(-1, 0); }} className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center border border-white/20 active:bg-white/30 transition-colors"><ChevronLeft className="text-white" /></button>
          <button onPointerDown={(e) => { e.preventDefault(); handleMobileMove(0, 1); }} className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center border border-white/20 active:bg-white/30 transition-colors"><ChevronDown className="text-white" /></button>
          <button onPointerDown={(e) => { e.preventDefault(); handleMobileMove(1, 0); }} className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center border border-white/20 active:bg-white/30 transition-colors"><ChevronRight className="text-white" /></button>
        </div>
      </div>
    </div>
  );
}
