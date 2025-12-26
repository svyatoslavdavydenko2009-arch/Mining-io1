import { useEffect, useRef, useState } from "react";

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
  onEnd: () => void;
}

export function Joystick({ onMove, onEnd }: JoystickProps) {
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const baseRef = useRef<HTMLDivElement>(null);
  const radius = 40;

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
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
      e.preventDefault();
      handleUpdate(e);
    };
    
    const onEndAny = () => {
      setIsActive(false);
      setKnobPos({ x: 0, y: 0 });
      onMove(0, 0);
      onEnd();
    };

    window.addEventListener("mousemove", onMoveAny);
    window.addEventListener("mouseup", onEndAny);
    window.addEventListener("touchmove", onMoveAny, { passive: false });
    window.addEventListener("touchend", onEndAny);

    return () => {
      window.removeEventListener("mousemove", onMoveAny);
      window.removeEventListener("mouseup", onEndAny);
      window.removeEventListener("touchmove", onMoveAny);
      window.removeEventListener("touchend", onEndAny);
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