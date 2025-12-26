import { useEffect, useRef, useState } from "react";

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
  onEnd: () => void;
}

export function Joystick({ onMove, onEnd }: JoystickProps) {
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const baseRef = useRef<HTMLDivElement>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const startCenterRef = useRef({ x: 0, y: 0 });
  const radius = 40;

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!baseRef.current) return;
    
    const rect = baseRef.current.getBoundingClientRect();
    startCenterRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    
    if ('touches' in e) {
      activeTouchIdRef.current = e.touches[0].identifier;
    } else {
      activeTouchIdRef.current = -1;
    }
    
    setIsActive(true);
    updateJoystick(e);
  };

  const handleJoystickPointerDown = (e: React.PointerEvent) => {
    // Only handle pointer events on the joystick itself
    handleStart(e as any);
  };

  const updateJoystick = (e: any) => {
    const activeTouchId = activeTouchIdRef.current;
    if (activeTouchId === null) return;
    
    let clientX = 0, clientY = 0;
    let touchFound = false;
    
    if (e.touches) {
      // Find the specific touch we're tracking
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeTouchId) {
          clientX = e.touches[i].clientX;
          clientY = e.touches[i].clientY;
          touchFound = true;
          break;
        }
      }
      if (!touchFound) return;
    } else if (activeTouchId === -1) {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    
    const dx = clientX - startCenterRef.current.x;
    const dy = clientY - startCenterRef.current.y;
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

    const handleGlobalMove = (e: Event) => {
      updateJoystick(e);
    };
    
    const handleGlobalEnd = (e: Event) => {
      const activeTouchId = activeTouchIdRef.current;
      if (activeTouchId === null) return;
      
      const touchEvent = e as TouchEvent;
      const mouseEvent = e as MouseEvent;
      
      if (touchEvent.changedTouches) {
        // Check if our tracked touch ended
        let ourTouchEnded = false;
        for (let i = 0; i < touchEvent.changedTouches.length; i++) {
          if (touchEvent.changedTouches[i].identifier === activeTouchId) {
            ourTouchEnded = true;
            break;
          }
        }
        if (!ourTouchEnded) return;
      } else if (activeTouchId !== -1) {
        // We're tracking a touch but this is a mouse event, ignore
        return;
      }
      
      // Our touch/mouse ended
      setIsActive(false);
      setKnobPos({ x: 0, y: 0 });
      onMove(0, 0);
      onEnd();
      activeTouchIdRef.current = null;
    };

    const handleGlobalMoveWithPrevent = (e: Event) => {
      handleGlobalMove(e);
      // Only prevent default for the specific touch we're tracking
      const touchEvent = e as TouchEvent;
      const activeTouchId = activeTouchIdRef.current;
      if (touchEvent.touches && activeTouchId !== null && activeTouchId !== -1) {
        for (let i = 0; i < touchEvent.touches.length; i++) {
          if (touchEvent.touches[i].identifier === activeTouchId) {
            e.preventDefault();
            break;
          }
        }
      }
    };

    const handleGlobalEndWithPrevent = (e: Event) => {
      handleGlobalEnd(e);
      // Only prevent default if it was our tracked touch
      const activeTouchId = activeTouchIdRef.current;
      const touchEvent = e as TouchEvent;
      if (touchEvent.changedTouches && activeTouchId !== null && activeTouchId !== -1) {
        for (let i = 0; i < touchEvent.changedTouches.length; i++) {
          if (touchEvent.changedTouches[i].identifier === activeTouchId) {
            e.preventDefault();
            break;
          }
        }
      }
    };

    window.addEventListener("mousemove", handleGlobalMove);
    window.addEventListener("mouseup", handleGlobalEnd);
    window.addEventListener("touchmove", handleGlobalMoveWithPrevent, { passive: false });
    window.addEventListener("touchend", handleGlobalEndWithPrevent, { passive: false });

    return () => {
      window.removeEventListener("mousemove", handleGlobalMove);
      window.removeEventListener("mouseup", handleGlobalEnd);
      window.removeEventListener("touchmove", handleGlobalMoveWithPrevent);
      window.removeEventListener("touchend", handleGlobalEndWithPrevent);
    };
  }, [isActive, onMove, onEnd]);

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
