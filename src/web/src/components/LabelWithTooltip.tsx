import React from 'react';
import { Tooltip } from '@heroui/tooltip';
import { Info } from 'lucide-react';

interface LabelWithTooltipProps {
  label: string;
  tooltip: React.ReactNode;
  ariaLabel?: string;
}

export function LabelWithTooltip({ label, tooltip, ariaLabel }: LabelWithTooltipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 leading-none">
      <span>{label}</span>
      <Tooltip content={tooltip} placement="top" showArrow>
        <button
          type="button"
          aria-label={ariaLabel || `${label} info`}
          className="flex items-center justify-center w-4 h-4 rounded hover:bg-default-200/60 transition-colors"
        >
          <Info className="w-3.5 h-3.5 text-default-500" />
        </button>
      </Tooltip>
    </span>
  );
}
