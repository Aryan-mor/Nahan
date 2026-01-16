/* eslint-disable i18next/no-literal-string */
/* eslint-disable no-console */
/* eslint-disable max-lines-per-function */
import { Activity, Maximize2, Minimize2, X } from 'lucide-react';
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
        // Fallback to full if stored was 'minimized' or invalid
        return (stored === 'compact' ? 'compact' : 'full');
    });

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

    // Persist Mode
    useEffect(() => {
        localStorage.setItem('nahan_perf_hud_mode', mode);
    }, [mode]);

    // Event Loop Monitor
    useEffect(() => {
        if (!isVisible) return;
        const interval = setInterval(() => {
            const now = Date.now();
            const delta = now - lastLoopTime.current;
            const currentLag = Math.max(0, delta - 500); // Expecting 500ms interval
            setLag(currentLag);
            lastLoopTime.current = now;
        }, 500);
        return () => clearInterval(interval);
    }, [isVisible]);

    // Worker & Memory Polling
    useEffect(() => {
        if (!isVisible) return;
        const pollInterval = setInterval(() => {
            try {
                // Worker Stats
                setWorkerStats(workerService.getQueueStats());

                // Memory
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

    // FPS Counter
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

    const handleClose = () => {
        localStorage.removeItem('nahan_force_perf_hud');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    // Visual Thresholds
    const isLagHigh = lag > 50;
    const isMemoryHigh = memory > 250;
    const isWorkerBusy = workerStats.activeTasks > 0 || workerStats.processingQueueLength > 0 || workerStats.storageQueueLength > 0;

    // Overall Health check (kept for potential health indicator use, though minimized mode is gone)
    const isHealthy = !isLagHigh && !isMemoryHigh;

    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: isLagHigh ? 'rgba(80, 0, 0, 0.95)' : 'rgba(10, 10, 10, 0.85)',
        color: '#e5e5e5',
        padding: '12px',
        borderRadius: '12px',
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
        transition: 'all 0.3s ease'
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
        <div data-testid={`perf-hud-${mode}`} style={containerStyle}>
            {/* Header / Controls */}
            <div style={headerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', color: '#fff' }}>
                    <Activity size={14} className={isHealthy ? 'text-green-400' : 'text-red-400'} />
                    <span>PERF HUD</span>
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
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px' }}>
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
