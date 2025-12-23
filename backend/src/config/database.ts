import { Pool } from "pg";
import {
  DATABASE_HOST,
  DATABASE_USER,
  DATABASE_PORT,
  DATABASE_PASSWORD,
  DATABASE_NAME,
  DATABASE_SSL_MODE,
} from "./constants";

// const { Pool } = pg;

export const pool = new Pool({
  host: DATABASE_HOST,
  user: DATABASE_USER,
  port: DATABASE_PORT,
  password: DATABASE_PASSWORD,
  database: DATABASE_NAME,
  ssl: DATABASE_SSL_MODE,
});
