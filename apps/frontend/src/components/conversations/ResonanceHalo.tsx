import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

interface ResonanceHaloProps {
    children: ReactNode;
    intensity?: number; // Number of lovebombs or accumulated weight
}

export function ResonanceHalo({ children, intensity = 0 }: ResonanceHaloProps) {
    // Determine glow based on intensity
    // 0: No Glow
    // 1-5: Low Glow (Blue/Cyan)
    // >5: High Glow (Violet/Pink)

    if (intensity <= 0) {
        return <>{children}</>;
    }

    const isHighResonance = intensity > 50; // Threshold for "High" level

    const glowColor = isHighResonance
        ? 'rgba(255, 0, 255, 0.4)' // Magenta/Pink for high resonance
        : 'rgba(0, 255, 255, 0.3)'; // Cyan for normal resonance

    const pulseVariants: Variants = {
        idle: {
            boxShadow: `0 0 10px ${glowColor}`,
            opacity: 1
        },
        pulse: {
            boxShadow: [
                `0 0 10px ${glowColor}`,
                `0 0 25px ${glowColor}`,
                `0 0 10px ${glowColor}`
            ],
            transition: {
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
            }
        }
    };

    return (
        <div className="relative">
            <motion.div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                variants={pulseVariants}
                initial="idle"
                animate="pulse"
                style={{
                    zIndex: -1,
                    // Expand slightly larger than the message bubble
                    left: -5,
                    right: -5,
                    top: -5,
                    bottom: -5,
                    background: `linear-gradient(45deg, ${glowColor}, transparent)`,
                    opacity: 0.2
                }}
            />
            {children}
        </div>
    );
}
