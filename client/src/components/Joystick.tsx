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
      className="w-24 h-24 bg-white/10 rounded-full border-2 border-white/20 flex items-center justify-center backdrop-blur-sm shadow-xl pointer-events-auto touch-none select-none"
    >
      <div 
        className="w-12 h-12 bg-white/40 rounded-full border-2 border-white/60 shadow-inner transition-transform duration-75"
        style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
      />
    </div>
  );
}