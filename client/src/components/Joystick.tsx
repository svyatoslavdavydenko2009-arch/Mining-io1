import { useEffect, useRef, useState } from "react";

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
  onEnd: () => void;
}

export function Joystick({ onMove, onEnd }: JoystickProps) {
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const baseRef = useRef<HTMLDivElement>(null);
  const activeTouchId = useRef<number | null>(null);
  const radius = 40;

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      activeTouchId.current = e.touches[0].identifier;
    } else {
      activeTouchId.current = -1; // Mouse has identifier -1
    }
    setIsActive(true);
    handleUpdate(e);
  };

  const handleUpdate = (e: any) => {
    if (!baseRef.current) return;
    
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const limitedDist = Math.min(distance, radius);
    const angle = Math.atan2(dy, dx);
    
    const nx = Math.cos(angle) * limitedDist;
    const ny = Math.sin(angle) * limitedDist;
    
    setKnobPos({ x: nx, y: ny });
    onMove(nx / radius, ny / radius);
  };

  useEffect(() => {
    if (!isActive) return;

    const onMoveAny = (e: MouseEvent | TouchEvent) => {
      handleUpdate(e);
    };
    
    const onEndAny = (e: MouseEvent | TouchEvent) => {
      // Only reset if the active touch/mouse that started the joystick has ended
      if ('changedTouches' in e) {
        // For touch events, check if the touch that was tracked has ended
        let touchEnded = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId.current) {
            touchEnded = true;
            break;
          }
        }
        if (!touchEnded) return;
      } else {
        // For mouse events, always reset (we only track one mouse)
        if (activeTouchId.current !== -1) return;
      }
      
      setIsActive(false);
      setKnobPos({ x: 0, y: 0 });
      onMove(0, 0);
      onEnd();
      activeTouchId.current = null;
    };

    window.addEventListener("mousemove", onMoveAny as EventListener);
    window.addEventListener("mouseup", onEndAny as EventListener);
    window.addEventListener("touchmove", onMoveAny as EventListener, { passive: false });
    window.addEventListener("touchend", onEndAny as EventListener);

    return () => {
      window.removeEventListener("mousemove", onMoveAny as EventListener);
      window.removeEventListener("mouseup", onEndAny as EventListener);
      window.removeEventListener("touchmove", onMoveAny as EventListener);
      window.removeEventListener("touchend", onEndAny as EventListener);
    };
  }, [isActive]);

  return (
    <div 
      ref={baseRef}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      className="w-24 h-24 bg-black/40 rounded-full border-4 border-[#3d2b1f] flex items-center justify-center pointer-events-auto touch-none select-none shadow-[0_0_15px_rgba(0,0,0,0.5)]"
    >
      <div className="absolute inset-0 rounded-full border-2 border-white/5 pointer-events-none" />
      <div 
        className="w-12 h-12 bg-[#fbbf24] rounded-full border-4 border-[#b45309] shadow-[inset_-4px_-4px_0_rgba(0,0,0,0.2)] flex items-center justify-center"
        style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
      >
        <div className="w-6 h-6 border-2 border-[#b45309]/30 rounded-full" />
      </div>
    </div>
  );
}