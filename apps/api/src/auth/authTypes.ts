export type UserRole = "admin" | "inspector";

export type CurrentUser = {
  id: number;
  username: string;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
      sessionId?: number;
      sessionTokenHash?: string;
    }
  }
}

