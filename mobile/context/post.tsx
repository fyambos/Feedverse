import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOCK_FEEDS } from '@/mocks/feeds';

export type StoredPost = {
  id: string;
  scenarioId: string;
  authorProfileId: string;
  text: string;
  createdAt: string;
  imageUrls?: string[] | null;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  parentPostId?: string;
  quotedPostId?: string;
};

export type StoredProfile = {
  id: string;
  scenarioId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
};

const postsKey = (scenarioId: string) => `feedverse.posts.${scenarioId}`;
const profilesKey = (scenarioId: string) => `feedverse.profiles.${scenarioId}`;

async function readArray<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeArray<T>(key: string, value: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function coerceStoredPostFromMock(scenarioId: string, mock: any): StoredPost {
  return {
    id: String(mock.id),
    scenarioId: String(mock.scenarioId ?? scenarioId),
    authorProfileId: String(mock.authorProfileId),
    text: String(mock.text ?? ''),
    createdAt: String(mock.createdAt),
    imageUrls: mock.imageUrls ?? null,
    replyCount: mock.replyCount ?? 0,
    repostCount: mock.repostCount ?? 0,
    likeCount: mock.likeCount ?? 0,
    parentPostId: mock.parentPostId ?? undefined,
    quotedPostId: mock.quotedPostId ?? undefined,
  };
}

export async function storageFetchPostById(
  scenarioId: string,
  postId: string
): Promise<StoredPost | null> {
  if (!scenarioId || !postId) return null;

  const posts = await readArray<StoredPost>(postsKey(scenarioId));
  const found = posts.find((p) => String(p.id) === String(postId));
  if (found) return found;

  const mockList = MOCK_FEEDS[scenarioId] ?? [];
  const mock = mockList.find((p: any) => String(p.id) === String(postId));
  if (!mock) return null;

  const hydrated = coerceStoredPostFromMock(scenarioId, mock);

  await storageUpsertPost(scenarioId, hydrated);

  return hydrated;
}

export async function storageFetchProfileById(
  scenarioId: string,
  profileId: string
): Promise<StoredProfile | null> {
  if (!scenarioId || !profileId) return null;

  const profiles = await readArray<StoredProfile>(profilesKey(scenarioId));
  return profiles.find((p) => String(p.id) === String(profileId)) ?? null;
}

export async function storageUpsertPost(scenarioId: string, post: StoredPost) {
  if (!scenarioId || !post?.id) return;

  const key = postsKey(scenarioId);
  const posts = await readArray<StoredPost>(key);

  const next = posts.some((p) => String(p.id) === String(post.id))
    ? posts.map((p) => (String(p.id) === String(post.id) ? post : p))
    : [post, ...posts];

  await writeArray(key, next);
}

export async function storageUpsertProfile(scenarioId: string, profile: StoredProfile) {
  if (!scenarioId || !profile?.id) return;

  const key = profilesKey(scenarioId);
  const profiles = await readArray<StoredProfile>(key);

  const next = profiles.some((p) => String(p.id) === String(profile.id))
    ? profiles.map((p) => (String(p.id) === String(profile.id) ? profile : p))
    : [profile, ...profiles];

  await writeArray(key, next);
}

export async function storageListPosts(scenarioId: string): Promise<StoredPost[]> {
  if (!scenarioId) return [];
  return await readArray<StoredPost>(postsKey(scenarioId));
}

export async function storageListProfiles(scenarioId: string): Promise<StoredProfile[]> {
  if (!scenarioId) return [];
  return await readArray<StoredProfile>(profilesKey(scenarioId));
}

type PostsContextValue = {
  fetchPostById: (scenarioId: string, postId: string) => Promise<StoredPost | null>;
  fetchProfileById: (scenarioId: string, profileId: string) => Promise<StoredProfile | null>;
  upsertPost: (scenarioId: string, post: StoredPost) => Promise<void>;
  upsertProfile: (scenarioId: string, profile: StoredProfile) => Promise<void>;
  listPosts: (scenarioId: string) => Promise<StoredPost[]>;
  listProfiles: (scenarioId: string) => Promise<StoredProfile[]>;
};

const PostsContext = React.createContext<PostsContextValue | null>(null);

export function PostsProvider({ children }: { children: React.ReactNode }) {
  const value = React.useMemo<PostsContextValue>(
    () => ({
      fetchPostById: storageFetchPostById,
      fetchProfileById: storageFetchProfileById,
      upsertPost: storageUpsertPost,
      upsertProfile: storageUpsertProfile,
      listPosts: storageListPosts,
      listProfiles: storageListProfiles,
    }),
    []
  );

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

export function usePosts() {
  const ctx = React.useContext(PostsContext);
  if (!ctx) throw new Error('usePosts must be used within <PostsProvider>');
  return ctx;
}