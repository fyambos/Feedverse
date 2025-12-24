interface User {
  id: string;
  userName: string;
  email: string;
  password: string;
  phoneNumber: string;
  isActive: boolean;
  profilePicture: string;
  authProvider: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date;
}

interface GetUser {
  User: User;
}

export { User, GetUser };
