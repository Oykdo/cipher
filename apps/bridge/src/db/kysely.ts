import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { DatabaseSchema } from './schema.js';

const { Pool } = pg;

export const db = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
        pool: new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
        })
    }),
});

