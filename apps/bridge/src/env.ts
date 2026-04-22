/**
 * Environment loading with production priority.
 *
 * `.env.production` is loaded first; dotenv never overrides already-set
 * keys, so production values win on conflicts and `.env` fills the rest.
 * Import this as a side-effect BEFORE any other module so env vars are
 * populated by the time downstream modules evaluate (db, routes, etc.).
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.production' });
dotenv.config();
