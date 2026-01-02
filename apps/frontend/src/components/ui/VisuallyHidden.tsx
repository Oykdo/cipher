import React from 'react';
import { cn } from '../../lib/utils';

export const VisuallyHidden = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={cn('sr-only', className)}>{children}</span>
);
