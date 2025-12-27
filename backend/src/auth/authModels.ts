import { JwtPayload } from "jsonwebtoken";

export interface RegisterRequest {
  username: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string;
}

export interface CreateUserData {
  id: string;
  username: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string;
  created_at: Date;
  updated_at: Date;
}

export interface RegisterResponse {
  message: string;
  User: {
    id: string;
    username: string;
    name: string;
    email: string;
    avatar_url: string;
    created_at: Date;
    updated_at: Date;
  };
}

export interface ValidationError {
  fields: string;
  message: string;
}

export interface LoginRequest {
  email: string;
  password_hash: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  User: {
    id: string;
    email: string;
    avatar_url: string;
    created_at: Date;
    updated_at: Date;
    // last_login: Date | null;
  };
}

export interface CustomRequest extends Request {
  token: string | JwtPayload;
}
