// mobile/components/profile/profileTypes.ts
export type ProfileViewState =
  | "normal"
  | "muted"
  | "blocked"
  | "blocked_by"
  | "suspended"
  | "deactivated"
  | "reactivated"
  | "reported"
  | "privated";
  

export type ProfileOverlayConfig = {
  state: Exclude<ProfileViewState, "normal">;
  title: string;
  message: string;
  // if true: show overlay but allow seeing profile underneath (greyed)
  dimUnderlying?: boolean;
};
