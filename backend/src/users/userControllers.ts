import { Request, Response } from "express";
import { User, UserSettings } from "./userModels";
import {
  AUTH,
  ERROR_MESSAGES,
  HTTP_METHODS,
  HTTP_STATUS,
  USER_MESSAGES,
} from "../config/constants";
import {
  DeleteUserService,
  GetUserScenariosByUserIdService,
  GetUserScenariosService,
  UpdateUserService,
} from "./userServices";
import { upload } from "../config/multer";

export const GetUserProfileController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    // Récupération de l'utilisateur via requête client (la requête est de type `Request` de base + étendue avec `User`)
    const user: User = req.user;

    res.status(HTTP_STATUS.OK).json(user);
  } catch (error: unknown) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: USER_MESSAGES.NOT_FOUND,
      error: error,
    });
  }
};

export const GetUserScenariosController = async (
  req: Request,
  res: Response,
) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId: string = req.user.id;

    const result = await GetUserScenariosService(userId);

    res.status(HTTP_STATUS.OK).json({
      message: USER_MESSAGES.SCENARIOS_FETCH_SUCCESS,
      scenarios: result.scenarios,
      count: result.count,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la récupération des scénarios:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const DeleteUserController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.DELETE) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const { id } = req.params;
    const authenticatedUserId: string = req.user.id;

    if (id !== authenticatedUserId) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        errors: [
          {
            fields: "authorization",
            message: "Vous ne pouvez supprimer que votre propre compte",
          },
        ],
      });
    }

    const result = await DeleteUserService(id);

    if (result.errors) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        errors: result.errors,
      });
    }

    res.status(HTTP_STATUS.OK).json({
      message: USER_MESSAGES.DELETION_SUCCESS,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la suppression du compte:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const UpdateUserController = [
  upload.single("avatar"),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.PATCH) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
    }

    try {
      const { username, settings } = req.body;
      const avatarFile = req.file;
      const userId: string = req.user.id;

      if (!userId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: AUTH.INVALID_TOKEN,
        });
      }

      let parsedSettings: UserSettings;
      if (settings) {
        try {
          parsedSettings =
            typeof settings === "string" ? JSON.parse(settings) : settings;
        } catch (error: unknown) {
          console.error(error);
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            errors: [
              {
                fields: "settings",
                message: "Format JSON invalide pour les paramètres",
              },
            ],
          });
        }
      }

      const result = await UpdateUserService(
        userId,
        {
          username,
          settings: parsedSettings,
        },
        avatarFile,
      );

      if (result.errors) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          errors: result.errors,
        });
      }

      res.status(HTTP_STATUS.OK).json({
        message: USER_MESSAGES.UPDATE_SUCCESS,
        user: result.user?.user,
      });
    } catch (error: unknown) {
      console.error("Erreur lors de la mise à jour du profil:", error);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }
  },
];

export const GetUserScenariosByUserIdController = async (
  req: Request,
  res: Response,
) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const { userId } = req.params;
    const authenticatedUserId: string = req.user.id;

    if (!authenticatedUserId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: AUTH.INVALID_TOKEN,
      });
    }

    const result = await GetUserScenariosByUserIdService(
      userId,
      authenticatedUserId,
    );

    if (result.errors) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        errors: result.errors,
      });
    }

    res.status(HTTP_STATUS.OK).json({
      message: USER_MESSAGES.SCENARIOS_FETCH_SUCCESS,
      scenarios: result.scenarios?.scenarios,
      count: result.scenarios?.count,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la récupération des scénarios:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
