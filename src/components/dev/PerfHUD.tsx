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
        // Hide by default in automated test environments to prevent interference
        if (typeof navigator !== 'undefined' && navigator.webdriver) {
            return false;
        }
        return true;
    });
    const [mode, setMode] = useState<HudMode>(() => {
        const stored = localStorage.getItem('nahan_perf_hud_mode');
        return (stored === 'compact' ? 'compact' : 'full');
    });

    // Position State (y only, x is determined by snap)
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
    const dragOffset = useRef({ x: 0, y: 0 });
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

    // --- Drag Logic ---
    const handleStart = (clientX: number, clientY: number) => {
        if (!dragRef.current) return;
        const rect = dragRef.current.getBoundingClientRect();
        dragOffset.current = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
        setIsDragging(true);
    };

    const handleMove = (clientX: number, clientY: number) => {
        if (!isDragging || !dragRef.current) return;

        // Update position visually during drag (without snapping yet)
        const x = clientX - dragOffset.current.x;
        const y = clientY - dragOffset.current.y;

        dragRef.current.style.left = `${x}px`;
        dragRef.current.style.top = `${y}px`;
        dragRef.current.style.right = 'auto'; // Disable right while dragging
        dragRef.current.style.transform = 'none';

        // Prevent default to stop scrolling on mobile
        // e.preventDefault(); // Note: handled in listener options usually
    };

    const handleEnd = () => {
        if (!isDragging || !dragRef.current) return;
        setIsDragging(false);

        const rect = dragRef.current.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const centerX = rect.left + rect.width / 2;

        // Snap Logic
        const newSide = centerX < screenWidth / 2 ? 'left' : 'right';

        // Reset styles for React state to take over
        dragRef.current.style.left = '';
        dragRef.current.style.top = '';
        dragRef.current.style.right = '';

        setPosition({ y: rect.top, side: newSide });
    };

    // Mouse Handlers
    const onMouseDown = (e: React.MouseEvent) => {
        handleStart(e.clientX, e.clientY);
    };

    // Touch Handlers
    const onTouchStart = (e: React.TouchEvent) => {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
    };

    // Global Listeners for Move/End (to catch release outside element)
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
        top: `${position.y}px`,
        // Snap to side
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
        transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', // Smooth snap

        // Rounding logic for sides
        borderTopRightRadius: position.side === 'left' ? '12px' : '0',
        borderBottomRightRadius: position.side === 'left' ? '12px' : '0',
        borderTopLeftRadius: position.side === 'right' ? '12px' : '0',
        borderBottomLeftRadius: position.side === 'right' ? '12px' : '0',
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
                        padding: '4px'
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
