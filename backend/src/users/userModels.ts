interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string;
  settings: object;
  created_at: Date;
  updated_at: Date;
  // last_login: Date | null;
}

interface GetUser {
  User: User;
}

export { User, GetUser };
