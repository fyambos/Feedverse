import { Request, Response } from "express";
import { User } from "./userModels";
import {
  ERROR_MESSAGES,
  HTTP_METHODS,
  HTTP_STATUS,
  USER_MESSAGES,
} from "../config/constants";
import { GetUserScenariosService } from "./userServices";

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
