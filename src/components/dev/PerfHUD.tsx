/* eslint-disable i18next/no-literal-string */
/* eslint-disable no-console */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
import { Activity, GripVertical, Maximize2, Minimize2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { workerService } from '../../services/workerService';

type HudMode = 'full' | 'compact';

export const PerfHUD: React.FC = () => {
    // UI State
    const [isVisible, setIsVisible] = useState(() => {
        // Hide by default in automated test environments
        if (typeof navigator !== 'undefined' && navigator.webdriver) return false;

        // Check persistence and force flag
        const storedVisible = localStorage.getItem('nahan_perf_hud_visible');
        const forced = localStorage.getItem('nahan_force_perf_hud') === 'true';

        // Show if forced or previously visible
        if (forced) return true;
        if (storedVisible !== null) return storedVisible === 'true';

        return false; // Default hide as requested
    });

    // Persist Visibility
    useEffect(() => {
        localStorage.setItem('nahan_perf_hud_visible', String(isVisible));
    }, [isVisible]);

    const [mode, setMode] = useState<HudMode>(() => {
        const stored = localStorage.getItem('nahan_perf_hud_mode');
        return (stored === 'compact' ? 'compact' : 'full');
    });

    // Position State
    // We store the snapped side and the vertical Y position.
    const [position, setPosition] = useState(() => {
        const stored = localStorage.getItem('nahan_perf_hud_pos');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch { /* ignore */ }
        }
        return { y: 100, side: 'right' }; // Default
    });

    // Dragging State
    const [isDragging, setIsDragging] = useState(false);

    // Checkpoints for drag calculations
    const dragStart = useRef({ x: 0, y: 0 }); // Mouse/Touch start position
    const initialRect = useRef<DOMRect | null>(null); // Element rect at start
    const dragRef = useRef<HTMLDivElement>(null);

    // 1. Event Loop Lag
    const [lag, setLag] = useState(0);
    const lastLoopTime = useRef(Date.now());

    // 2. FPS
    const [fps, setFps] = useState(60);
    const frames = useRef(0);
    const lastFpsTime = useRef(Date.now());

    // 3. Worker Stats
    const [workerStats, setWorkerStats] = useState({
        storageQueueLength: 0,
        processingQueueLength: 0,
        activeTasks: 0
    });

    // 4. Memory (Chrome only)
    const [memory, setMemory] = useState(0);

    // Persist Mode & Position
    useEffect(() => {
        localStorage.setItem('nahan_perf_hud_mode', mode);
    }, [mode]);

    useEffect(() => {
        localStorage.setItem('nahan_perf_hud_pos', JSON.stringify(position));
    }, [position]);

    // --- Data Polling Effects (unchanged) ---
    useEffect(() => {
        if (!isVisible) return;
        const interval = setInterval(() => {
            const now = Date.now();
            const delta = now - lastLoopTime.current;
            const currentLag = Math.max(0, delta - 500);
            setLag(currentLag);
            lastLoopTime.current = now;
        }, 500);
        return () => clearInterval(interval);
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible) return;
        const pollInterval = setInterval(() => {
            try {
                setWorkerStats(workerService.getQueueStats());
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const perf = performance as any;
                if (perf.memory) {
                    const used = perf.memory.usedJSHeapSize;
                    setMemory(Math.round(used / 1024 / 1024));
                }
            } catch (e) {
                console.error('PerfHUD Error:', e);
            }
        }, 500);
        return () => clearInterval(pollInterval);
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible) return;
        let frameId: number;
        const loop = () => {
            frames.current++;
            const now = Date.now();
            if (now - lastFpsTime.current >= 1000) {
                setFps(frames.current);
                frames.current = 0;
                lastFpsTime.current = now;
            }
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [isVisible]);

    // --- Drag Logic with Clamping & Transform ---
    const handleStart = (clientX: number, clientY: number) => {
        if (!dragRef.current) return;

        // Capture initial state
        dragStart.current = { x: clientX, y: clientY };
        initialRect.current = dragRef.current.getBoundingClientRect();

        setIsDragging(true);
    };

    const handleMove = (clientX: number, clientY: number) => {
        if (!isDragging || !dragRef.current || !initialRect.current) return;

        const deltaX = clientX - dragStart.current.x;
        const deltaY = clientY - dragStart.current.y;

        // Visual feedback using Transform (avoids layout thrashing)
        // We clamp the delta so the element doesn't leave the viewport
        const rect = initialRect.current;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Calculate allowed movement range relative to start position
        const minX = -rect.left + 5; // allow 5px margin
        const maxX = windowWidth - rect.right - 5;
        const minY = -rect.top + 5;
        const maxY = windowHeight - rect.bottom - 5;

        const clampedDeltaX = Math.max(minX, Math.min(maxX, deltaX));
        const clampedDeltaY = Math.max(minY, Math.min(maxY, deltaY));

        dragRef.current.style.transform = `translate3d(${clampedDeltaX}px, ${clampedDeltaY}px, 0)`;
        // NOTE: We do NOT touch top/left/right styles here. React owns those.
        // Transform sits on top visually.
    };

    const handleEnd = () => {
        if (!isDragging || !dragRef.current || !initialRect.current) return;
        setIsDragging(false);

        // Get final visual position
        // Since we used transform, we need to calculate where we ended up.
        // We can use getBoundingClientRect() which accounts for the transform.
        const finalRect = dragRef.current.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const centerX = finalRect.left + finalRect.width / 2;

        // Reset Transform (so state updates can take over cleanly)
        dragRef.current.style.transform = '';

        // Determine Snap Side
        const newSide = centerX < screenWidth / 2 ? 'left' : 'right';

        // Determine Y position (clamped)
        // Ensure it doesn't stick off top/bottom
        let newY = finalRect.top;
        newY = Math.max(10, Math.min(screenHeight - finalRect.height - 10, newY));

        setPosition({ y: newY, side: newSide });
    };

    // Mouse Handlers
    const onMouseDown = (e: React.MouseEvent) => {
        handleStart(e.clientX, e.clientY);
    };

    // Touch Handlers
    const onTouchStart = (e: React.TouchEvent) => {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
    };

    // Global Listeners
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
        const onMouseUp = () => isDragging && handleEnd();

        const onTouchMove = (e: TouchEvent) => {
            if(isDragging) e.preventDefault();
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        };
        const onTouchEnd = () => isDragging && handleEnd();

        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            window.addEventListener('touchmove', onTouchMove, { passive: false });
            window.addEventListener('touchend', onTouchEnd);
        }

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDragging]);


    const handleClose = () => {
        localStorage.removeItem('nahan_force_perf_hud');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    // Visual Thresholds
    const isLagHigh = lag > 50;
    const isMemoryHigh = memory > 250;
    const isWorkerBusy = workerStats.activeTasks > 0 || workerStats.processingQueueLength > 0 || workerStats.storageQueueLength > 0;
    const isHealthy = !isLagHigh && !isMemoryHigh;

    const containerStyle: React.CSSProperties = {
        position: 'fixed',
         // When NOT dragging, we use the state position.
         // When dragging, strict position remains, and transform moves it visually.
        top: `${position.y}px`,
        left: position.side === 'left' ? '0' : 'auto',
        right: position.side === 'right' ? '0' : 'auto',

        // Visuals
        backgroundColor: isLagHigh ? 'rgba(80, 0, 0, 0.95)' : 'rgba(10, 10, 10, 0.90)',
        color: '#e5e5e5',
        padding: '12px',
        fontSize: '11px',
        fontFamily: 'Menlo, Monaco, Consolas, monospace',
        zIndex: 9999,
        minWidth: mode === 'compact' ? 'auto' : '220px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        // Important: During dragging, we disable transition so it follows mouse perfectly.
        // After drag, we enable it for the snap effect.
        transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',

        // Rounding logic for sides
        borderTopRightRadius: position.side === 'left' ? '12px' : '0',
        borderBottomRightRadius: position.side === 'left' ? '12px' : '0',
        borderTopLeftRadius: position.side === 'right' ? '12px' : '0',
        borderBottomLeftRadius: position.side === 'right' ? '12px' : '0',

        // Prevent selection during drag
        userSelect: 'none',
        touchAction: 'none'
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: mode === 'full' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
        paddingBottom: mode === 'full' ? '8px' : '0',
        marginBottom: mode === 'full' ? '4px' : '0'
    };

    return (
        <div
            ref={dragRef}
            data-testid={`perf-hud-${mode}`}
            style={containerStyle}
        >
            {/* Header / Controls */}
            <div style={headerStyle}>
                {/* Drag Handle */}
                <div
                    onMouseDown={onMouseDown}
                    onTouchStart={onTouchStart}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        padding: '4px',
                        flex: 1 // make header handle drag target
                    }}
                >
                    <GripVertical size={14} color="#666" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', color: '#fff' }}>
                        <Activity size={14} className={isHealthy ? 'text-green-400' : 'text-red-400'} />
                        {mode === 'full' && <span>PERF HUD</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => setMode(mode === 'full' ? 'compact' : 'full')}
                        style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '4px' }}
                        title={mode === 'full' ? 'Compact' : 'Expand'}
                    >
                        {mode === 'full' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '4px' }}
                        title="Close"
                        data-testid="perf-hud-close"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Compact Mode Content */}
            {mode === 'compact' && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px', paddingLeft: '8px' }}>
                    <div style={{ color: fps < 30 ? '#ef4444' : '#22c55e', fontWeight: 'bold' }}>
                        {fps} FPS
                    </div>
                    <div style={{ color: isLagHigh ? '#ef4444' : '#22c55e' }}>
                         Lag: {lag}ms
                    </div>
                </div>
            )}

            {/* Full Mode Content */}
            {mode === 'full' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                        <div style={{ color: '#888' }}>FPS</div>
                        <div style={{ color: fps < 30 ? '#ef4444' : '#22c55e', fontWeight: 'bold', textAlign: 'right' }}>
                            {fps}
                        </div>

                        <div style={{ color: '#888' }}>Loop Lag</div>
                        <div style={{ color: isLagHigh ? '#ef4444' : '#22c55e', textAlign: 'right' }}>
                            {lag}ms
                        </div>

                        <div style={{ color: '#888' }}>JS Heap</div>
                        <div style={{ color: isMemoryHigh ? '#ef4444' : '#22c55e', textAlign: 'right' }}>
                            {memory > 0 ? `${memory} MB` : 'N/A'}
                        </div>
                    </div>

                    <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: '#888' }}>WORKERS</span>
                            <span style={{
                                color: isWorkerBusy ? '#f59e0b' : '#22c55e',
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: isWorkerBusy ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)'
                            }}>
                                {isWorkerBusy ? 'BUSY' : 'IDLE'}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '10px' }}>
                            <div style={{ color: '#666' }}>Active Tasks</div>
                            <div style={{ textAlign: 'right' }}>{workerStats.activeTasks}</div>

                            <div style={{ color: '#666' }}>Queue (Proc)</div>
                            <div style={{ textAlign: 'right' }}>{workerStats.processingQueueLength}</div>

                            <div style={{ color: '#666' }}>Queue (Stor)</div>
                            <div style={{ textAlign: 'right' }}>{workerStats.storageQueueLength}</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
