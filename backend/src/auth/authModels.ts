import { JwtPayload } from "jsonwebtoken";
import { User } from "../users/userModels";

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

export interface LoginRequest {
  email: string;
  password_hash: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  User: User;
}

export interface CustomRequest extends Request {
  token: string | JwtPayload;
}

export interface JwtTokenPayload {
  id: string;
  username: string;
  email: string;
  name: string;
}
