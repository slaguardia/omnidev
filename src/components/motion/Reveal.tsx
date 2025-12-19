'use client';

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

export interface RevealProps {
  children: React.ReactNode;
  /** seconds */
  delay?: number;
  /** px */
  y?: number;
  once?: boolean;
  className?: string;
}

export function Reveal({ children, delay = 0, y = 14, once = true, className }: RevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once, margin: '-12% 0px -12% 0px' });

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
