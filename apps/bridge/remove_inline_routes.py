"""
Script to remove inline routes that are now in modular files
"""

# Read the file
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Define line ranges to remove (0-indexed)
# CSP/PSI/Audit routes: lines 351-502 (approx 151 lines)
# We'll remove from "// CSP Violation" to just before "// Helper function"

output_lines = []
skip_mode = False
skip_start_markers = [
    '// CSP Violation Report Endpoint',
]
skip_end_markers = [
    '// Helper function to log authentication actions',
]

for i, line in enumerate(lines, 1):
    # Check if we should start skipping
    if any(marker in line for marker in skip_start_markers):
        skip_mode = True
        continue
    
    # Check if we should stop skipping
    if skip_mode and any(marker in line for marker in skip_end_markers):
        skip_mode = False
        # Keep this line
        output_lines.append(line)
        continue
    
    # Skip lines in skip mode
    if skip_mode:
        continue
    
    # Keep all other lines
    output_lines.append(line)

# Write cleaned file
with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.writelines(output_lines)

print(f'Removed lines: {len(lines) - len(output_lines)}')
print(f'Before: {len(lines)} lines')
print(f'After: {len(output_lines)} lines')
