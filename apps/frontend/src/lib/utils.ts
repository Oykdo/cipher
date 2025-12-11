/**
 * Utility Functions - Project Chimera
 * 
 * Helper functions for className merging, formatting, etc.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper conflict resolution
 * 
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 * 
 * @example
 * cn("px-2 py-1", "px-4") // "py-1 px-4"
 * cn("text-red-500", condition && "text-blue-500") // conditional
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format file size to human-readable string
 * 
 * @example
 * formatBytes(1024) // "1.0 KB"
 * formatBytes(1536000) // "1.5 MB"
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) {return '0 Bytes';}
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Truncate string with ellipsis
 * 
 * @example
 * truncate("Hello World", 5) // "Hello..."
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) {return str;}
  return str.slice(0, length) + '...';
}

/**
 * Debounce function execution
 * 
 * @example
 * const debouncedSearch = debounce(search, 300);
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {clearTimeout(timeout);}
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate random ID
 * 
 * @example
 * generateId() // "a1b2c3d4"
 */
export function generateId(length: number = 8): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}
