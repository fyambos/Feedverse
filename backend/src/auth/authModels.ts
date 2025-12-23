import { JwtPayload } from "jsonwebtoken";

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  profilePicture?: string;
}

export interface CreateUserData {
  id: string;
  username: string;
  email: string;
  password: string;
  profile_picture?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RegisterResponse {
  message: string;
  User: {
    id: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface ValidationError {
  fields: string;
  message: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  User: {
    id: string;
    email: string;
    profile_picture: string;
    created_at: Date;
    updated_at: Date;
    last_login: Date | null;
  };
}

export interface CustomRequest extends Request {
  token: string | JwtPayload;
}
