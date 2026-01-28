import {
  createPostForScenario,
  deletePost,
  getPostThreadForScenario,
  listPostsForScenario,
  listPostsPageForScenario,
  reportPost,
  updatePost,
  uploadPostImages,
} from "./postRepositories";

export const ListPostsForScenarioService = async (userId: string, scenarioId: string) => {
  return await listPostsForScenario({ userId, scenarioId });
};

export const ListPostsPageForScenarioService = async (
  userId: string,
  scenarioId: string,
  opts: { limit: number; cursor?: string | null },
) => {
  return await listPostsPageForScenario({ userId, scenarioId, limit: opts.limit, cursor: opts.cursor });
};

export const CreatePostForScenarioService = async (args: { userId: string; scenarioId: string; input: any }) => {
  return await createPostForScenario({ userId: args.userId, scenarioId: args.scenarioId, input: args.input });
};

export const UpdatePostService = async (args: { userId: string; postId: string; patch: any }) => {
  return await updatePost({ userId: args.userId, postId: args.postId, patch: args.patch });
};

export const DeletePostService = async (args: { userId: string; postId: string }) => {
  return await deletePost({ userId: args.userId, postId: args.postId });
};

export const UploadPostImagesService = async (args: { userId: string; postId: string; files: Express.Multer.File[] }) => {
  return await uploadPostImages({ userId: args.userId, postId: args.postId, files: args.files });
};

export const GetPostThreadForScenarioService = async (userId: string, scenarioId: string, postId: string) => {
  return await getPostThreadForScenario({ userId, scenarioId, postId });
};

export const ReportPostService = async (args: {
  userId: string;
  postId: string;
  reportMessage?: string | null;
  requestId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}) => {
  return await reportPost({
    userId: args.userId,
    postId: args.postId,
    reportMessage: args.reportMessage ?? null,
    requestId: args.requestId ?? null,
    userAgent: args.userAgent ?? null,
    ip: args.ip ?? null,
  });
};
