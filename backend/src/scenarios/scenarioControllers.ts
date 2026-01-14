import { Request, Response } from "express";
import {
  AUTH,
  ERROR_MESSAGES,
  HTTP_METHODS,
  HTTP_STATUS,
  SCENARIO_MESSAGES,
} from "../config/constants";
import {
  CreateScenarioService,
  GetScenarioByIdService,
} from "./scenarioServices";
import { upload } from "../config/multer";

export const CreateScenarioController = [
  upload.single("cover"),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
    }

    try {
      const { name, description, mode, invite_code } = req.body;
      const coverFile = req.file;
      const ownerUserId: string = req.user.id;
      req.body.mode = "story";

      if (!ownerUserId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: AUTH.INVALID_TOKEN,
        });
      }

      const result = await CreateScenarioService(
        {
          name,
          description,
          mode,
          invite_code,
          owner_user_id: ownerUserId,
          gm_user_ids: [],
          settings: {},
        },
        ownerUserId,
        coverFile,
      );

      if (result.errors) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          errors: result.errors,
        });
      }

      res.status(HTTP_STATUS.CREATED).json({
        message: SCENARIO_MESSAGES.CREATION_SUCCESS,
        scenario: result.scenario,
      });
    } catch (error: unknown) {
      console.error("Erreur lors de la création du scénario:", error);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }
  },
];

export const GetScenarioByIdController = async (
  req: Request,
  res: Response,
) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const { id } = req.params;
    const userId: string = req.user.id;

    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: AUTH.INVALID_TOKEN,
      });
    }

    const result = await GetScenarioByIdService(id, userId);

    if (result.errors) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        errors: result.errors,
      });
    }

    res.status(HTTP_STATUS.OK).json({
      scenario: result.scenario,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la récupération du scénario:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
