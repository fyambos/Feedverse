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
  DeleteScenarioService,
  GetScenarioByIdService,
  GetScenarioPlayersService,
  TransferScenarioOwnershipService,
  UpdateScenarioService,
  JoinScenarioService,
  LeaveScenarioService,
} from "./scenarioServices";
import { JoinScenarioRequest } from "./scenarioModels";
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

export const UpdateScenarioController = [
  upload.single("cover"),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.PATCH) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
    }

    try {
      const { id } = req.params;
      const { name, description, invite_code } = req.body;
      const coverFile = req.file;
      const userId: string = req.user.id;

      if (!userId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: AUTH.INVALID_TOKEN,
        });
      }

      const result = await UpdateScenarioService(
        id,
        userId,
        {
          name,
          description,
          invite_code,
        },
        coverFile,
      );

      if (result.errors) {
        const isForbidden = result.errors.some(
          (err) => err.fields === "authorization",
        );

        return res
          .status(isForbidden ? HTTP_STATUS.FORBIDDEN : HTTP_STATUS.BAD_REQUEST)
          .json({ errors: result.errors });
      }

      res.status(HTTP_STATUS.OK).json({
        message: SCENARIO_MESSAGES.UPDATE_SUCCESS,
        scenario: result.scenario?.scenario,
      });
    } catch (error: unknown) {
      console.error("Erreur lors de la mise à jour du scénario:", error);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }
  },
];

export const DeleteScenarioController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.DELETE) {
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

    const result = await DeleteScenarioService(id, userId);

    if (result.errors) {
      const isForbidden = result.errors.some(
        (err) => err.fields === "authorization",
      );

      return res
        .status(isForbidden ? HTTP_STATUS.FORBIDDEN : HTTP_STATUS.NOT_FOUND)
        .json({ errors: result.errors });
    }

    res.status(HTTP_STATUS.OK).json({
      message: SCENARIO_MESSAGES.DELETION_SUCCESS,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la suppression du scénario:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const GetScenarioPlayersController = async (
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

    const result = await GetScenarioPlayersService(id, userId);

    if (result.errors) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        errors: result.errors,
      });
    }

    res.status(HTTP_STATUS.OK).json({
      message: SCENARIO_MESSAGES.PLAYERS_FETCH_SUCCESS,
      players: result.players?.players,
      count: result.players?.count,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la récupération des participants:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const TransferScenarioOwnershipController = async (
  req: Request,
  res: Response,
) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const { id } = req.params;
    const { newOwnerUserId } = req.body;
    const currentUserId: string = req.user.id;

    if (!currentUserId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: AUTH.INVALID_TOKEN,
      });
    }

    const result = await TransferScenarioOwnershipService(id, currentUserId, {
      newOwnerUserId,
    });

    if (result.errors) {
      const isForbidden = result.errors.some(
        (err) => err.fields === "authorization",
      );

      return res
        .status(isForbidden ? HTTP_STATUS.FORBIDDEN : HTTP_STATUS.BAD_REQUEST)
        .json({ errors: result.errors });
    }

    res.status(HTTP_STATUS.OK).json({
      message: SCENARIO_MESSAGES.TRANSFER_SUCCESS,
      scenario: result.scenario?.scenario,
    });
  } catch (error: unknown) {
    console.error("Erreur lors du transfert de propriété:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const JoinScenarioController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId: string = req.user.id;

    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: AUTH.INVALID_TOKEN,
      });
    }

    const requestData: JoinScenarioRequest = req.body;

    const result = await JoinScenarioService(requestData, userId);

    if (result.errors) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: ERROR_MESSAGES.VALIDATION_ERROR,
        errors: result.errors,
      });
    }

    const statusCode = result.data?.already_member
      ? HTTP_STATUS.OK
      : HTTP_STATUS.CREATED;

    res.status(statusCode).json({
      message: result.data?.message,
      scenario: result.data?.scenario,
      already_member: result.data?.already_member,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la jonction au scénario:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const LeaveScenarioController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
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

    const result = await LeaveScenarioService(id, userId);

    if (result.errors) {
      const statusCode = result.errors.some((e) => e.fields === "id")
        ? HTTP_STATUS.NOT_FOUND
        : HTTP_STATUS.BAD_REQUEST;

      return res.status(statusCode).json({
        message: ERROR_MESSAGES.VALIDATION_ERROR,
        errors: result.errors,
      });
    }

    res.status(HTTP_STATUS.OK).json({
      message: result.data?.message,
      scenario_id: result.data?.scenario_id,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la sortie du scénario:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
