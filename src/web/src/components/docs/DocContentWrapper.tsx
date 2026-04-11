'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface DocContentWrapperProps {
  children: ReactNode;
}

export function DocContentWrapper({ children }: DocContentWrapperProps) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="contents"
    >
      {children}
    </motion.div>
  );
}
