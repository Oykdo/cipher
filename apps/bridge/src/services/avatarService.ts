import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

interface AvatarParams {
    geometry: {
        type: 'icosahedron' | 'torus' | 'cube' | 'sphere';
        subdivisions: number;
        wireframe: boolean;
    };
    transform: {
        rotation: [number, number, number];
        scale: number;
    };
    material: {
        type: 'metallic' | 'glass' | 'emissive';
        color: [number, number, number, number]; // RGBA
        roughness: number;
    };
    environment: {
        particleCount: number;
        particleColor: [number, number, number];
        backgroundColor: [number, number, number];
    };
}

export class AvatarService {
    private outputDir: string;
    private scriptPath: string;

    constructor() {
        // Ensure these paths are correct relative to your project structure
        this.outputDir = path.join(process.cwd(), 'public', 'avatars');
        this.scriptPath = path.join(process.cwd(), 'scripts', 'generate_avatar.py');

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Translates a list of 30 checksums into deterministic 3D parameters.
     * This function is non-reversible.
     */
    private translateChecksumsTo3DParams(checksums: string[]): AvatarParams {
        if (checksums.length !== 30) {
            throw new Error('Invalid checksum count. Expected 30.');
        }

        // Helper to generate a deterministic number from a checksum string
        const getHashVal = (str: string) => {
            const hash = crypto.createHash('sha256').update(str).digest('hex');
            return parseInt(hash.substring(0, 8), 16) / 0xffffffff;
        };

        // Helper to map a value to a range
        const mapRange = (val: number, min: number, max: number) => min + val * (max - min);

        // 1. Geometry (Checksums 0-4)
        // We use the combined hash of the first 5 checksums to decide the shape
        const geoHash = getHashVal(checksums.slice(0, 5).join(''));
        const shapes: AvatarParams['geometry']['type'][] = ['icosahedron', 'torus', 'cube', 'sphere'];
        const shapeIndex = Math.floor(geoHash * shapes.length);

        // 2. Transform (Checksums 5-14)
        const rotX = mapRange(getHashVal(checksums[5]), 0, 360);
        const rotY = mapRange(getHashVal(checksums[6]), 0, 360);
        const rotZ = mapRange(getHashVal(checksums[7]), 0, 360);
        const scale = mapRange(getHashVal(checksums[8]), 0.8, 1.5);

        // 3. Material (Checksums 15-19)
        const matHash = getHashVal(checksums.slice(15, 20).join(''));
        const matTypes: AvatarParams['material']['type'][] = ['metallic', 'glass', 'emissive'];
        const matIndex = Math.floor(matHash * matTypes.length);

        const r = getHashVal(checksums[15]);
        const g = getHashVal(checksums[16]);
        const b = getHashVal(checksums[17]);
        const roughness = getHashVal(checksums[18]);

        // 4. Environment (Checksums 20-29)
        const particleCount = Math.floor(mapRange(getHashVal(checksums[20]), 50, 200));
        const pr = getHashVal(checksums[21]);
        const pg = getHashVal(checksums[22]);
        const pb = getHashVal(checksums[23]);

        // Background color (subtle darks)
        const bgR = mapRange(getHashVal(checksums[24]), 0, 0.1);
        const bgG = mapRange(getHashVal(checksums[25]), 0, 0.1);
        const bgB = mapRange(getHashVal(checksums[26]), 0, 0.2);

        return {
            geometry: {
                type: shapes[shapeIndex],
                subdivisions: 2 + Math.floor(getHashVal(checksums[1]) * 3), // 2 to 4
                wireframe: getHashVal(checksums[2]) > 0.8,
            },
            transform: {
                rotation: [rotX, rotY, rotZ],
                scale: scale,
            },
            material: {
                type: matTypes[matIndex],
                color: [r, g, b, 1.0],
                roughness: roughness,
            },
            environment: {
                particleCount: particleCount,
                particleColor: [pr, pg, pb],
                backgroundColor: [bgR, bgG, bgB],
            },
        };
    }

    /**
     * Generates an avatar from checksums.
     * Returns the public URL path to the generated .blend file and its hash.
     */
    public async generateAvatar(checksums: string[], userId?: string): Promise<{ url: string; hash: string }> {
        const params = this.translateChecksumsTo3DParams(checksums);

        // Use deterministic filename based on userId to prevent wrong file downloads
        // If no userId (testing/preview), use temp- prefix with random UUID
        const filename = userId ? `${userId}.blend` : `temp-${randomUUID()}.blend`;
        const outputPath = path.join(this.outputDir, filename);

        // JSON stringify params to pass to Python script
        const paramsJson = JSON.stringify(params);

        // Construct command
        const command = `blender --background --python "${this.scriptPath}" -- --output "${outputPath}" --params '${paramsJson}'`;

        try {
            console.log('Executing Blender command:', command);
            // In a real environment with Blender installed:
            await execAsync(command);
        } catch (e: any) {
            // Check if it's a "command not found" type error
            if (e.message && (e.message.includes('not recognized') || e.message.includes('not found') || e.code === 127 || e.code === 1)) {
                console.warn('⚠️ Blender not found in PATH. Switching to internal mock generator.');
            } else {
                console.warn('⚠️ Blender execution failed. Switching to internal mock generator.', e.message);
            }

            // Create a dummy file for testing purposes
            await this.createMockFile(outputPath, params);
        }

        // Calculate SHA-256 hash of the generated file
        let hash = '';
        try {
            const fileBuffer = fs.readFileSync(outputPath);
            hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            // Store hash in database ONLY if userId is provided
            if (userId) {
                // Dynamic import to avoid circular dependency issues if any, though here it's fine
                const { getDatabase } = await import('../db/database.js');
                const db = getDatabase();
                // We try to update, but if user doesn't exist yet (signup flow), it might fail or do nothing.
                // In signup flow, we should rely on passing the hash to the signup endpoint.
                try {
                    await db.updateUserAvatarHash(userId, hash);
                } catch (dbError) {
                    console.warn(`Could not update avatar hash for user ${userId} (user might not exist yet):`, dbError);
                }
            }
        } catch (err) {
            console.error('Failed to hash/store avatar:', err);
            // We don't throw here to ensure the user still gets their file
        }

        // Return the public URL and hash
        return {
            url: `/avatars/${filename}`,
            hash
        };
    }

    private async createMockFile(outputPath: string, params: AvatarParams) {
        // Create a dummy .blend file (just text content for now)
        // In a real scenario, this would be a valid minimal .blend file
        const dummyContent = `BLENDER-MOCK-FILE-FOR-${params.geometry.type}`;
        fs.writeFileSync(outputPath, dummyContent);
    }
}

export const avatarService = new AvatarService();
