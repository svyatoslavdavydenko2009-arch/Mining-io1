import { useEffect, useRef, useState } from "react";

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
  onEnd: () => void;
}

export function Joystick({ onMove, onEnd }: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const isTouching = useRef(false);

  const radius = 60;

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    isTouching.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setTouchPos({ x: clientX, y: clientY });
  };

  const handleMove = (e: TouchEvent | MouseEvent) => {
    if (!isTouching.current || !touchPos) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const dx = clientX - touchPos.x;
    const dy = clientY - touchPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 5) {
      setKnobPos({ x: 0, y: 0 });
      onMove(0, 0);
      return;
    }

    const limitedDistance = Math.min(distance, radius);
    const angle = Math.atan2(dy, dx);
    
    const nx = Math.cos(angle) * limitedDistance;
    const ny = Math.sin(angle) * limitedDistance;

    setKnobPos({ x: nx, y: ny });
    
    // Normalize and send
    const normDx = nx / radius;
    const normDy = ny / radius;
    onMove(normDx, normDy);
  };

  const handleEnd = () => {
    isTouching.current = false;
    setTouchPos(null);
    setKnobPos({ x: 0, y: 0 });
    onEnd();
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [touchPos]);

  return (
    <div 
      ref={containerRef}
      className="fixed bottom-12 left-12 w-32 h-32 flex items-center justify-center pointer-events-auto z-50"
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      style={{ touchAction: 'none' }}
    >
      <div className="w-24 h-24 rounded-full bg-black/30 border-4 border-white/20 flex items-center justify-center">
        <div 
          className="w-12 h-12 rounded-full bg-white/60 shadow-lg border-2 border-white/40 transition-transform duration-75"
          style={{ 
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)` 
          }}
        />
      </div>
    </div>
  );
}
