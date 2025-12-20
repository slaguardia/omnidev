'use client';

import { motion, useInView, Variants, HTMLMotionProps } from 'framer-motion';
import { useRef, ReactNode } from 'react';

// Animation presets
const DURATION = 0.5;
const STAGGER = 0.1;
const EASING = [0.25, 0.1, 0.25, 1];

// Variants
const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION, ease: EASING } },
};

const fadeInUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION, ease: EASING } },
};

const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: DURATION, ease: EASING } },
};

const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: STAGGER,
      delayChildren: 0.1,
    },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4, ease: EASING } },
};

interface AnimationWrapperProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/**
 * FadeIn - Simple opacity fade animation
 */
export function FadeIn({ children, delay = 0, className, ...props }: AnimationWrapperProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeInVariants}
      transition={{ delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * FadeInUp - Fade in with upward slide
 */
export function FadeInUp({ children, delay = 0, className, ...props }: AnimationWrapperProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeInUpVariants}
      transition={{ delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * ScaleIn - Scale up with fade
 */
export function ScaleIn({ children, delay = 0, className, ...props }: AnimationWrapperProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={scaleInVariants}
      transition={{ delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/**
 * StaggerContainer - Container that staggers children animations
 */
export function StaggerContainer({
  children,
  className,
  delay = 0,
  ...props
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainerVariants}
      transition={{ delayChildren: delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * StaggerItem - Child element for StaggerContainer
 */
export function StaggerItem({
  children,
  className,
  ...props
}: Omit<AnimationWrapperProps, 'delay'>) {
  return (
    <motion.div variants={staggerItemVariants} className={className} {...props}>
      {children}
    </motion.div>
  );
}

interface ScrollRevealProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  children: ReactNode;
  className?: string;
  threshold?: number;
  once?: boolean;
}

/**
 * ScrollReveal - Reveals content when scrolled into view (subtle fade-in)
 */
export function ScrollReveal({
  children,
  className,
  threshold = 0.2,
  once = true,
  ...props
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: threshold, once });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: DURATION, ease: EASING }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

interface ScrollRevealScaleProps extends ScrollRevealProps {
  scale?: number;
}

/**
 * ScrollRevealScale - Reveals with subtle scale effect
 */
export function ScrollRevealScale({
  children,
  className,
  threshold = 0.2,
  once = true,
  scale = 0.98,
  ...props
}: ScrollRevealScaleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: threshold, once });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale }}
      animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale }}
      transition={{ duration: DURATION, ease: EASING }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Re-export motion and AnimatePresence for convenience
export { motion, AnimatePresence } from 'framer-motion';
