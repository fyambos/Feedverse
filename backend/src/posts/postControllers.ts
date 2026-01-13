import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_METHODS, HTTP_STATUS } from "../config/constants";
import { upload } from "../config/multer";
import {
  CreatePostForScenarioService,
  DeletePostService,
  ListPostsForScenarioService,
  ListPostsPageForScenarioService,
  UpdatePostService,
  UploadPostImagesService,
} from "./postServices";

export const ListScenarioPostsController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const rawLimit = req.query?.limit;
    const rawCursor = req.query?.cursor;
    const hasPaging = rawLimit != null || rawCursor != null;

    if (hasPaging) {
      const limit = Math.max(1, Math.min(500, Number.isFinite(Number(rawLimit)) ? Math.floor(Number(rawLimit)) : 200));
      const cursor = rawCursor == null ? null : String(rawCursor);
      const page = await ListPostsPageForScenarioService(userId, scenarioId, { limit, cursor });
      if (!page) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
      return res.status(HTTP_STATUS.OK).json(page);
    }

    const posts = await ListPostsForScenarioService(userId, scenarioId);
    if (!posts) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    return res.status(HTTP_STATUS.OK).json(posts);
  } catch (error: unknown) {
    console.error("Erreur récupération posts:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const CreateScenarioPostController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const input = {
      id: req.body?.id,
      authorProfileId: req.body?.authorProfileId ?? req.body?.author_profile_id,
      text: req.body?.text,
      imageUrls: req.body?.imageUrls ?? req.body?.image_urls,
      replyCount: req.body?.replyCount ?? req.body?.reply_count,
      repostCount: req.body?.repostCount ?? req.body?.repost_count,
      likeCount: req.body?.likeCount ?? req.body?.like_count,
      parentPostId: req.body?.parentPostId ?? req.body?.parent_post_id,
      quotedPostId: req.body?.quotedPostId ?? req.body?.quoted_post_id,
      insertedAt: req.body?.insertedAt ?? req.body?.inserted_at,
      createdAt: req.body?.createdAt ?? req.body?.created_at,
      postType: req.body?.postType ?? req.body?.post_type,
      isPinned: req.body?.isPinned ?? req.body?.is_pinned,
      pinOrder: req.body?.pinOrder ?? req.body?.pin_order,
      meta: req.body?.meta,
    };

    const result = await CreatePostForScenarioService({ userId, scenarioId, input });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.CREATED).json({ post: result.post });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: msg || ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const UpdatePostController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.PATCH) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const postId = String(req.params?.id ?? "").trim();
    if (!postId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "postId is required" });

    const patch = req.body ?? {};

    const result = await UpdatePostService({ userId, postId, patch });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json({ post: result.post });
  } catch (error: unknown) {
    console.error("Erreur mise à jour post:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const DeletePostController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.DELETE) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const postId = String(req.params?.id ?? "").trim();
    if (!postId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "postId is required" });

    const result = await DeletePostService({ userId, postId });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (error: unknown) {
    console.error("Erreur suppression post:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const UploadPostImagesController = [
  upload.array("images", 8),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
    }

    try {
      const userId = String(req.user?.id ?? "").trim();
      if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

      const postId = String(req.params?.id ?? "").trim();
      if (!postId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "postId is required" });

      const files = (req.files as Express.Multer.File[]) ?? [];
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "No images uploaded" });
      }

      const result = await UploadPostImagesService({ userId, postId, files });
      if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
      if ("error" in result) return res.status(result.status).json({ error: result.error });

      return res.status(HTTP_STATUS.OK).json({ post: result.post });
    } catch (error: unknown) {
      console.error("Erreur upload images post:", error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }
  },
];
